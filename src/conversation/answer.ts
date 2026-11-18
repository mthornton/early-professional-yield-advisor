// Open questions in model mode. The model gets everything the app knows about this customer
// (profile, accounts, transactions, derived figures, ranking, catalog, disclosures) plus the
// recent conversation, and answers in its own words. Figures it adds that are not in that data
// are flagged on the message and in the trace rather than blocked.
import type { Account, Answers, Catalog, Derived, Persona, RankingResult } from '../engine/types';
import type { Holding } from '../ui/store';
import { config, disclosures } from '../data';
import { NON_SPENDING } from '../engine/derive';
import { cardFactsForModel, factSentence, gateText, templateExplanation } from './explain';
import { checkNumbers } from './guard';
import { chat, type ChatTurn, type ModelCallLog } from './openrouter';
import type { ModelSettings } from './agent';

export interface AnswerContextInput {
  persona: Persona;
  accounts: Account[];
  derived: Derived;
  answers: Answers | null;
  result: RankingResult | null;
  consented: boolean;
  holdings: Holding[];
  catalog: Catalog;
}

/** Checking spending by calendar month (same definition as the engine's outflow: transfers excluded). */
function spendingByMonth(p: Persona) {
  const months: Record<string, { spending: number; largest: { date: string; description: string; amount: number } | null; partial_month: boolean }> = {};
  for (const t of p.transactions) {
    if (t.account_id !== 'chk' || t.amount >= 0 || NON_SPENDING.has(t.category)) continue;
    const m = t.date.slice(0, 7);
    const row = (months[m] ??= { spending: 0, largest: null, partial_month: m === p.period.start.slice(0, 7) || m === p.period.end.slice(0, 7) });
    row.spending = Math.round((row.spending - t.amount) * 100) / 100;
    if (!row.largest || -t.amount > row.largest.amount) row.largest = { date: t.date, description: t.description, amount: -t.amount };
  }
  return months;
}

export function buildAnswerContext(i: AnswerContextInput) {
  const { persona: p, derived: d, result } = i;
  return {
    today: config.demo_date,
    customer: p.profile,
    data_consent_given: i.consented,
    accounts: i.accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balance: a.balance,
      ...(a.revolving_balance !== undefined ? { carried_month_to_month: a.revolving_balance } : {}),
      ...(a.apr !== undefined ? { apr_pct: a.apr } : {}),
    })),
    has_self_directed_investing: p.has_brokerage,
    brokerage_holdings: p.brokerage_holdings,
    linked_outside_accounts: p.external_links,
    figures_from_account_history: {
      typical_paycheck: d.typicalPaycheck,
      paid: 'every two weeks',
      average_monthly_outflow: d.avgMonthlyOutflow,
      average_note: 'average over all months observed, not any single month',
      checking_spending_by_month: spendingByMonth(p),
      months_observed: d.monthsObserved,
      buffer_kept_in_checking: d.buffer,
      buffer_rule: `${config.ranking.buffer_months} months of outflow`,
      movable_cash: d.movable,
      card_balance_carried: d.cardRevolving,
      card_apr_pct: d.cardApr,
      recurring_outside_transfers: d.recurringOutside,
      estimated_tax_rates_pct: {
        federal: +(d.tax.federal * 100).toFixed(2),
        state_and_local: +(d.tax.stateLocal * 100).toFixed(2),
        state: d.tax.stateName,
        locality: d.tax.localName ?? null,
      },
    },
    simulated_actions_taken_this_session: i.holdings.map((h) => ({
      product: h.name,
      amount: h.amount,
      monthly_redirect: h.monthly,
      dollars_per_year: h.annualDollars,
      after_tax_yield_pct: +h.afterTaxYield.toFixed(2),
      available: h.availableLabel,
      how_to_undo: h.undoLabel,
    })),
    current_answers: i.answers,
    ranking: result
      ? {
          gate: result.gate ? { id: result.gate.id, ...gateText(result.gate), values: result.gate.values } : null,
          options_in_rank_order: result.ranked.map((o) => ({
            ...cardFactsForModel(o),
            facts: o.facts.map(factSentence),
            card_text: templateExplanation(o),
            name: o.name,
            term: o.termLabel ?? null,
            matures: o.maturityDate ?? null,
            pre_tax_yield_pct: o.yield,
            yield_basis: o.yieldBasis,
            rate_as_of: o.asOf,
            amount_basis: o.amountBasis,
            lump_sum_dollars_per_year: o.lumpDollars,
            redirect_dollars_first_year: o.recurringDollars,
            access: o.accessLabel,
            insured: o.insured,
            tradeoffs: o.tradeoffs,
            ranking_note: o.tieBreakNote ?? null,
          })),
          not_ranked: result.excluded,
          outside_comparison: result.benchmarks.map((b) => ({
            category: b.name,
            yield_pct: b.yield,
            after_tax_yield_pct: +b.afterTaxYield.toFixed(2),
            dollars_per_year: b.annualDollars,
            difference_vs_top_chase_option: b.differenceVsTop,
            as_of: b.asOf,
          })),
        }
      : null,
    chase_products: i.catalog.products.map((x) => ({
      id: x.id,
      name: x.name,
      ticker: x.ticker ?? null,
      type: x.type,
      yield_pct: x.yield ?? null,
      terms: x.terms ?? null,
      yield_basis: x.yield_basis,
      as_of: x.as_of,
      minimum: x.minimum,
      insured: x.insured,
      needs_self_directed_investing: x.needs_brokerage,
      access: x.access_label,
      locks_until_maturity: x.locks_until_maturity,
      state_tax_exempt_share: x.state_tax_exempt_share,
      rate_note: x.rate_note ?? null,
      tradeoffs: x.tradeoffs,
    })),
    outside_rate_categories: i.catalog.benchmarks.map((b) => ({ name: b.name, yield_pct: b.yield, low: b.yield_low, high: b.yield_high, as_of: b.as_of })),
    disclosures: Object.fromEntries(Object.entries(disclosures.items).map(([k, v]) => [k, v.short])),
    transactions_last_6_months: p.transactions.map((t) => `${t.date} | ${t.account_id} | ${t.description} | ${t.amount}`),
  };
}

export const ANSWER_SYSTEM_PROMPT = `You are the cash-savings assistant inside a bank's online banking, talking with a signed-in customer. Speak to them as "you".
You receive a JSON object with everything the app knows: the customer's profile, accounts, six months of transactions, figures the rules engine derived from them, the engine's ranking of cash options (when there is one), the bank's product catalog with rates and as-of dates, outside rate categories, and disclosure text. Then you get the recent conversation and the customer's new message.
How to answer:
- Answer the question directly, using the data. Short: two to five sentences, or a few short bullet lines when listing. Plain words, no jargon.
- Prefer figures exactly as they appear in the data. If you must calculate (a sum, a difference), keep it simple and say "about".
- When you quote a product rate, give its as-of date.
- Ranking and recommendations come from the rules engine. Never rank or recommend differently than "ranking" does. If "ranking.gate" is set, explain that instead of recommending a product.
- If data_consent_given is false: you may answer factual questions about the customer's own accounts and transactions, but do not give a personalized recommendation of where to put money; give the general product facts and offer to rank options using their accounts.
- Investments (money market funds, Treasury bills, Premium Deposit via Self-Directed Investing) are not FDIC-insured deposits; say so when it matters.
- Do not name other banks or institutions except as they appear in the customer's own transactions or links. Do not invent products, rates, fees or policies. If the data doesn't cover it, say you don't have that information here.
- No promises, no "guaranteed" returns, no tax or legal advice beyond the estimated rates given. No exclamation marks.
- If the message is unrelated to the customer's money or the bank, say briefly that you can help with their accounts, savings and cash options.
Reply with the answer text only, as plain text: no markdown, no asterisks or headings. For a list, start each line with "- ".`;

export interface AnswerResult {
  text: string | null;
  note?: string;
  log?: ModelCallLog;
  fallback?: string;
}

export async function answerQuestion(
  question: string,
  history: ChatTurn[],
  context: ReturnType<typeof buildAnswerContext>,
  s: ModelSettings,
): Promise<AnswerResult> {
  if (s.mode !== 'model') return { text: null };
  if (!s.apiKey) return { text: null, fallback: 'No OpenRouter key; used scripted reply' };
  const user = `Customer data:\n${JSON.stringify(context)}\n\nCustomer's new message: ${question}`;
  try {
    const { text, log } = await chat(s.apiKey, s.model, ANSWER_SYSTEM_PROMPT, user, 'answer', config.model.answer_max_tokens, history);
    const t = text.trim();
    const check = checkNumbers(t, { context, history: history.map((h) => h.content), question });
    return {
      text: t,
      log,
      note: check.ok ? undefined : `Includes figures the model calculated, not taken from the data: ${check.unknown.join(', ')}`,
    };
  } catch (e) {
    return { text: null, log: (e as { log?: ModelCallLog }).log, fallback: `Model call failed (${(e as Error).message}); used scripted reply` };
  }
}
