// Template text, filled only from rules-engine output. Scripted mode uses these as-is;
// model mode uses them as the fallback and as the baseline to compare the model's wording against.
import type { Catalog, Derived, GateResult, RankedOption, ReasonFact, CdTerm, BillTerm } from '../engine/types';
import type { IntentKind } from './intent';
import { asOf, longDate, money, pct, ratePct } from './format';

export function factSentence(f: ReasonFact): string {
  const p = f.params;
  switch (f.code) {
    case 'state_tax_free':
      return `Its income is free of ${p.where} income tax, which counts at your estimated ${p.state_rate_pct}% rate.`;
    case 'threshold_lost':
      return `${p.where} only exempts funds that hold at least half Treasuries, so this fund gets no state-tax break for you.`;
    case 'no_state_tax':
      return `${p.where} has no state income tax, so the highest pre-tax yield comes out ahead for you.`;
    case 'fully_state_taxed':
      return `Its income is fully taxed by ${p.where} at your estimated ${p.state_rate_pct}% rate.`;
    case 'matures_before':
      return `It matures ${longDate(String(p.maturity))}, before the ${longDate(String(p.need_date))} date you need the money.`;
    case 'needs_account':
      return `You'd open a Self-Directed Investing account first, ${p.steps} steps in all.`;
    case 'has_account':
      return `You already have a Self-Directed Investing account, so there's nothing new to open.`;
    case 'fdic':
      return `It's FDIC-insured.`;
    case 'us_backed':
      return `It's backed by the U.S. government when held to maturity.`;
    case 'beats_next':
      return `That's about ${money(Number(p.dollars_more))} a year more than the ${String(p.next_name).toLowerCase()}.`;
    case 'behind_top':
      return `It earns about ${money(Number(p.dollars_less))} a year less than the ${String(p.top_name).toLowerCase()}.`;
    case 'recurring':
      return `Redirecting your ${money(Number(p.monthly))}/month outside transfer here adds about ${money(Number(p.first_year_dollars))} in the first year.`;
    case 'where_it_sits':
      return `This is roughly what the money earns where it sits today.`;
    default:
      return '';
  }
}

const PRIORITY = ['where_it_sits', 'matures_before', 'state_tax_free', 'threshold_lost', 'no_state_tax', 'fully_state_taxed', 'recurring', 'needs_account', 'has_account', 'beats_next', 'behind_top', 'us_backed', 'fdic'];

/** One or two short sentences for the card, chosen from the highest-priority facts. */
export function templateExplanation(o: RankedOption): string {
  const facts = [...o.facts].sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
  return facts.slice(0, 2).map(factSentence).join(' ');
}

function cdRange(catalog: Catalog): { best: number; months: number } {
  const cd = catalog.products.find((p) => p.id === 'chase_cd')!;
  let best = { best: 0, months: 0 };
  for (const t of cd.terms as CdTerm[]) if (t.tiers[0].apy > best.best) best = { best: t.tiers[0].apy, months: t.months };
  return best;
}

/** Step 2 of Flow A: answer the literal question first, from the catalog. */
export function literalAnswer(kind: IntentKind | null, catalog: Catalog): string {
  const sav = catalog.products.find((p) => p.id === 'chase_savings')!;
  const prime = catalog.products.find((p) => p.id === 'mmf_prime')!;
  const bill = catalog.products.find((p) => p.id === 'tbill')!;
  const bills = bill.terms as BillTerm[];
  const cd = cdRange(catalog);
  const others = `Chase has other options that pay more: CDs up to ${pct(cd.best)} APY (${cd.months}-month term), money market funds around ${pct(prime.yield!)} (7-day yield, ${asOf(prime.as_of)}), and Treasury bills from ${pct(bills[0].yield)} to ${pct(bills[bills.length - 1].yield)} (${asOf(bill.as_of)}).`;
  switch (kind) {
    case 'hysa':
      return `Straight answer: Chase Savings pays ${pct(sav.yield!)} APY (${asOf(sav.as_of)}), so it isn't a high-yield savings account. ${others}`;
    case 'rate':
      return `Chase Savings pays ${pct(sav.yield!)} APY (${asOf(sav.as_of)}). ${others}`;
    case 'placement':
      return `Good question to ask before it sits in checking. Chase Savings pays ${pct(sav.yield!)} APY (${asOf(sav.as_of)}). ${others}`;
    case 'product':
      return `Here's where Chase's cash options stand today. Chase Savings pays ${pct(sav.yield!)} APY (${asOf(sav.as_of)}). ${others}`;
    default:
      return `Chase Savings pays ${pct(sav.yield!)} APY (${asOf(sav.as_of)}). ${others}`;
  }
}

export const OFFER_TEXT = 'I can rank these for your situation using your Chase accounts. It takes about a minute.';

export function profileSummary(d: Derived, hasBrokerage: boolean): string[] {
  const lines = [
    `Checking: ${money(d.checking)}${d.savings ? ` · Chase Savings: ${money(d.savings)}` : ''}`,
    `Typical paycheck: ${money(d.typicalPaycheck)} every two weeks`,
    `Average monthly outflow: ${money(d.avgMonthlyOutflow)} (last ${d.monthsObserved} months)`,
    `Buffer kept in checking: ${money(d.buffer)} (1.5 months of outflow)`,
    `State: ${d.tax.stateName}${d.tax.localName ? ` + ${d.tax.localName}` : ''} · estimated tax rates: ${ratePct(d.tax.federal)} federal, ${ratePct(d.tax.stateLocal)} state${d.tax.localName ? ' and local' : ''}`,
    `Self-Directed Investing account: ${hasBrokerage ? 'yes' : 'no'}`,
    d.cardRevolving > 0 ? `Card balance carried month to month: ${money(d.cardRevolving)} at ${ratePct(d.cardApr)} APR` : 'No card balance carried month to month',
  ];
  for (const r of d.recurringOutside) lines.push(`About ${money(r.monthlyAmount)}/month goes to an outside ${r.kind} account`);
  return lines;
}

export function gateText(g: GateResult): { headline: string; body: string[] } {
  const v = g.values;
  if (g.id === 'card_debt') {
    return {
      headline: "Paying down your card earns more than any option here.",
      body: [
        `You're carrying ${money(Number(v.revolving_balance))} on your card at ${v.card_apr_pct}% APR. That costs about ${money(Number(v.annual_interest_on_balance))} a year in interest.`,
        `Every $1,000 you put toward the card saves about ${money(Number(v.saved_per_1000_paid_down))} a year. The same $1,000 in the best cash option here would earn about ${money(Number(v.earned_per_1000_in_best_option))} after tax.`,
        'Keep a cash buffer for emergencies, and put extra cash toward the card first. Once it is paid off, I can rank cash options for you.',
      ],
    };
  }
  return {
    headline: 'Keep the money where it is for now.',
    body: [
      `Your checking balance (${money(Number(v.checking))}) is below one month of your usual spending (${money(Number(v.one_month_outflow))}). That cushion matters more than a few dollars of interest.`,
      'Want me to check again after your next paycheck?',
    ],
  };
}

export const EXPLAIN_SYSTEM_PROMPT = `You write the short reason on each card of a bank's cash-option recommendation, speaking to the customer as "you".
The card already shows the rank, after-tax yield, dollars per year and steps, so do not restate them. Say why this option fits, or doesn't, for this customer, using the facts given. Each fact comes with a "plain" sentence that states what it means.
For each card: one or two sentences, at most 40 words. Lead with the most decisive fact for this customer (tax treatment, timing, account needed). Mention a dollar comparison only if it helps the customer decide.
If a card has a "recurring" fact, it must mention redirecting the monthly transfer: that is the main point of the recommendation for this customer.
Rules:
- Use ONLY numbers that appear in the input, written the same way. Do not compute, round or add any rate, dollar figure or date.
- Do not name products or institutions that are not in the input.
- Plain words. No jargon such as "threshold", "exempt share" or "basis". No promises, no "guaranteed", no exclamation marks, no advice beyond the facts.
Reply with JSON only, no code fences: {"explanations": {"<productId>": "<text>", ...}}`;

/** The facts the model receives for one card. Every value here is engine output. */
export function cardFactsForModel(o: RankedOption) {
  return {
    productId: o.productId,
    rank: o.rank,
    name: o.shortName,
    after_tax_yield_pct: Number(o.afterTaxYield.toFixed(2)),
    dollars_per_year: o.annualDollars,
    steps: o.steps,
    facts: o.facts.map((f) => ({ code: f.code, ...f.params, plain: factSentence(f) })),
  };
}
