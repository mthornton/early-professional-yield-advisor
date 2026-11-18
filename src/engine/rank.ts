// Ranking is a pure function of persona-derived figures, the customer's answers and the catalog.
// The same inputs always give the same order. No model is involved here.
import type {
  Answers,
  BenchmarkRow,
  BillTerm,
  Catalog,
  CdTerm,
  Config,
  Derived,
  Exclusion,
  GateResult,
  Persona,
  Product,
  RankedOption,
  RankingResult,
  ReasonFact,
} from './types';
import { afterTaxYield } from './tax';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Share of income exempt from state tax, after state rules such as CA/NY/CT's 50% threshold for funds. */
export function effectiveExemptShare(p: Product, d: Derived): number {
  const e = p.state_tax_exempt_share;
  if (e <= 0) return 0;
  if (p.type === 'fund' && d.tax.fundThreshold !== undefined && e < d.tax.fundThreshold) return 0;
  return e;
}

interface TermChoice {
  yield: number;
  label: string;
  maturity: string;
}

function termCandidates(p: Product, amount: number, today: string): TermChoice[] {
  if (!p.terms) return [];
  if (p.id === 'tbill') {
    return (p.terms as BillTerm[]).map((t) => ({
      yield: t.yield,
      label: `${t.weeks}-week`,
      maturity: addDaysIso(today, t.weeks * 7),
    }));
  }
  return (p.terms as CdTerm[]).map((t) => {
    const tier = [...t.tiers].reverse().find((x) => amount >= x.min) ?? t.tiers[0];
    return { yield: tier.apy, label: `${t.months}-month`, maturity: addMonths(today, t.months) };
  });
}

/** Highest after-tax yield anything in the catalog could pay this customer (used by the debt gate). */
export function bestAvailableAfterTax(catalog: Catalog, d: Derived, today: string): number {
  let best = 0;
  for (const p of catalog.products) {
    const e = effectiveExemptShare(p, d);
    const ys = p.terms ? termCandidates(p, Math.max(d.movable, 100000), today).map((t) => t.yield) : [p.yield ?? 0];
    for (const y of ys) best = Math.max(best, afterTaxYield(y, d.tax, e));
  }
  return best;
}

export function checkGates(catalog: Catalog, cfg: Config, d: Derived, today: string): GateResult[] {
  const best = bestAvailableAfterTax(catalog, d, today);
  const aprPct = d.cardApr * 100;
  const per1000Card = round2(1000 * d.cardApr);
  const per1000Best = round2((1000 * best) / 100);
  const debt: GateResult = {
    id: 'card_debt',
    applies: d.cardRevolving > 0 && aprPct > best,
    rule: 'Revolving card balance with an APR above the best available after-tax yield',
    values: {
      revolving_balance: d.cardRevolving,
      card_apr_pct: round2(aprPct),
      best_available_after_tax_pct: round2(best),
      annual_interest_on_balance: Math.round(d.cardRevolving * d.cardApr),
      saved_per_1000_paid_down: per1000Card,
      earned_per_1000_in_best_option: per1000Best,
    },
  };
  const thinLimit = cfg.ranking.thin_buffer_months * d.avgMonthlyOutflow;
  const thin: GateResult = {
    id: 'thin_buffer',
    applies: d.checking < thinLimit,
    rule: `Checking balance below ${cfg.ranking.thin_buffer_months} month(s) of average outflow`,
    values: { checking: d.checking, one_month_outflow: Math.round(thinLimit) },
  };
  return [debt, thin];
}

function insuredScore(i: Product['insured']): number {
  return i === 'none' ? 0 : 1;
}

export function defaultAnswers(p: Persona, d: Derived): Answers {
  return {
    amount: d.movable,
    timing: p.demo_answers.timing,
    date: p.demo_answers.date,
    redirectRecurring: !!p.demo_answers.redirect_recurring && d.recurringOutside.length > 0,
  };
}

export function rank(
  persona: Persona,
  d: Derived,
  answers: Answers,
  catalog: Catalog,
  cfg: Config,
): RankingResult {
  const today = cfg.demo_date;
  const gates = checkGates(catalog, cfg, d, today);
  const gate = gates.find((g) => g.applies) ?? null;
  if (gate) return { gate, gates, ranked: [], excluded: [], benchmarks: [], topKey: `gate:${gate.id}` };

  const lump = Math.max(0, answers.amount);
  const recurringMonthly = answers.redirectRecurring ? d.recurringOutside.reduce((s, r) => s + r.monthlyAmount, 0) : 0;
  const recurringBasis = recurringMonthly * cfg.recurring_redirect.first_year_balance_months;
  const amountBasis = lump + recurringBasis;
  const minimumCheck = lump + recurringMonthly; // what lands in the first month

  const excluded: Exclusion[] = [];
  const options: Omit<RankedOption, 'rank' | 'facts'>[] = [];

  for (const p of catalog.products) {
    if (p.minimum > minimumCheck) {
      excluded.push({ productId: p.id, name: p.short_name, reason: `Minimum $${p.minimum.toLocaleString()} is above the amount ($${minimumCheck.toLocaleString()})` });
      continue;
    }
    let y = p.yield ?? 0;
    let termLabel: string | undefined;
    let maturity: string | undefined;
    const e = effectiveExemptShare(p, d);

    if (p.locks_until_maturity) {
      if (answers.timing === 'anytime') {
        excluded.push({ productId: p.id, name: p.short_name, reason: 'Locks money until maturity; customer needs it anytime' });
        continue;
      }
      let cands = termCandidates(p, amountBasis, today);
      if (answers.timing === 'date' && answers.date) cands = cands.filter((c) => c.maturity <= answers.date!);
      if (!cands.length) {
        excluded.push({ productId: p.id, name: p.short_name, reason: `No term matures by ${answers.date}` });
        continue;
      }
      // Best term for this customer: highest yield; on equal yield, the longer term.
      const best = cands.reduce((a, b) => (b.yield > a.yield || (b.yield === a.yield && b.maturity > a.maturity) ? b : a));
      y = best.yield;
      termLabel = best.label;
      maturity = best.maturity;
    }

    const at = afterTaxYield(y, d.tax, e);
    const needsOpen = p.needs_brokerage && !persona.has_brokerage;
    options.push({
      productId: p.id,
      name: termLabel ? `${p.name}, ${termLabel}` : p.name,
      shortName: termLabel ? `${termLabel} ${p.short_name}` : p.short_name,
      termLabel,
      maturityDate: maturity,
      yield: y,
      yieldBasis: p.yield_basis,
      asOf: p.as_of,
      exemptShare: p.state_tax_exempt_share,
      exemptShareApplied: e,
      afterTaxYield: round4(at),
      amountBasis,
      annualDollars: Math.round((amountBasis * at) / 100),
      lumpDollars: Math.round((lump * at) / 100),
      recurringDollars: Math.round((recurringBasis * at) / 100),
      steps: p.steps_to_act + (needsOpen ? cfg.ranking.brokerage_open_extra_steps : 0),
      needsAccountOpening: needsOpen,
      insured: p.insured,
      tradeoffs: p.tradeoffs,
      disclosureIds: p.disclosure_ids,
      accessLabel: p.access_label,
      daysToCash: p.days_to_cash,
      locks: p.locks_until_maturity,
      verify: p.verify,
    });
  }

  // Step 5: after-tax dollars, highest first. Within the tie-break band, fewer steps, then insured.
  const tie = cfg.ranking.tie_break_points;
  const sorted = [...options].sort((a, b) => b.afterTaxYield - a.afterTaxYield);
  // Adjacent-swap pass so the tie-break only ever reorders near neighbours (keeps the order auditable).
  const notes = new Map<string, string>();
  let swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (Math.abs(a.afterTaxYield - b.afterTaxYield) >= tie) continue;
      const bWins = b.steps < a.steps || (b.steps === a.steps && insuredScore(b.insured) > insuredScore(a.insured));
      if (bWins) {
        sorted[i] = b;
        sorted[i + 1] = a;
        notes.set(b.productId, `Within ${tie} pts of ${a.shortName}; moved up for ${b.steps < a.steps ? 'fewer steps' : 'insurance'}`);
        swapped = true;
      }
    }
  }

  const ranked: RankedOption[] = sorted.map((o, i) => ({
    ...o,
    rank: i + 1,
    tieBreakNote: notes.get(o.productId),
    facts: [],
  }));
  ranked.forEach((o, i) => (o.facts = reasonFacts(o, ranked[i + 1], ranked[0], persona, d, answers)));

  const top = ranked[0];
  const benchmarks: BenchmarkRow[] = catalog.benchmarks.map((b) => {
    const at = afterTaxYield(b.yield, d.tax, 0);
    const dollars = Math.round((amountBasis * at) / 100);
    return {
      id: b.id,
      name: b.name,
      yield: b.yield,
      yieldLow: b.yield_low,
      yieldHigh: b.yield_high,
      asOf: b.as_of,
      afterTaxYield: round4(at),
      annualDollars: dollars,
      differenceVsTop: top ? dollars - top.annualDollars : dollars,
    };
  });

  const mode = recurringMonthly > 0 ? 'recurring' : 'lump';
  return { gate: null, gates, ranked, excluded, benchmarks, topKey: top ? `${top.productId}:${mode}` : null };
}

/** Facts the explanation is written from. Every figure here comes from the engine. */
function reasonFacts(
  o: RankedOption,
  next: RankedOption | undefined,
  top: RankedOption,
  persona: Persona,
  d: Derived,
  answers: Answers,
): ReasonFact[] {
  const f: ReasonFact[] = [];
  const statePct = round2(d.tax.stateLocal * 100);
  const where = d.tax.localName ? `${d.tax.stateName} State and City` : d.tax.stateName;
  if (o.exemptShareApplied >= 0.99 && d.tax.stateLocal > 0) {
    f.push({ code: 'state_tax_free', params: { where, state_rate_pct: statePct } });
  } else if (o.exemptShare > 0 && o.exemptShareApplied === 0 && d.tax.fundThreshold) {
    f.push({ code: 'threshold_lost', params: { where: d.tax.stateName } });
  } else if (d.tax.stateLocal === 0) {
    f.push({ code: 'no_state_tax', params: { where: d.tax.stateName } });
  } else if (o.exemptShareApplied === 0 && d.tax.stateLocal > 0) {
    f.push({ code: 'fully_state_taxed', params: { where, state_rate_pct: statePct } });
  }
  if (o.maturityDate && answers.timing === 'date' && answers.date) {
    f.push({ code: 'matures_before', params: { maturity: o.maturityDate, need_date: answers.date } });
  }
  if (o.needsAccountOpening) f.push({ code: 'needs_account', params: { steps: o.steps } });
  else if (o.steps > 1 && persona.has_brokerage && o.productId !== 'chase_cd') f.push({ code: 'has_account', params: {} });
  if (o.insured === 'FDIC') f.push({ code: 'fdic', params: {} });
  if (o.insured === 'us_government') f.push({ code: 'us_backed', params: {} });
  if (next && o.rank === 1) {
    f.push({ code: 'beats_next', params: { dollars_more: o.annualDollars - next.annualDollars, next_name: next.shortName } });
  }
  if (o.rank > 1) f.push({ code: 'behind_top', params: { dollars_less: top.annualDollars - o.annualDollars, top_name: top.shortName } });
  if (o.recurringDollars > 0) {
    const monthly = d.recurringOutside.reduce((s, r) => s + r.monthlyAmount, 0);
    f.push({ code: 'recurring', params: { monthly, first_year_dollars: o.recurringDollars } });
  }
  if (o.productId === 'chase_savings') f.push({ code: 'where_it_sits', params: {} });
  return f;
}
