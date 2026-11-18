import type { Config, Derived, Persona, RecurringOutside, TaxTables } from './types';
import { estimateTaxRates } from './tax';

// Transfers between the customer's own accounts are moves, not spending.
export const NON_SPENDING = new Set(['transfer_internal', 'transfer_brokerage_internal', 'transfer_outside']);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function detectRecurringOutside(p: Persona, cfg: Config): RecurringOutside[] {
  const groups = new Map<string, RecurringOutside>();
  const lists: [RecurringOutside['kind'], string[]][] = [
    ['savings', cfg.outside_institutions.savings],
    ['brokerage', cfg.outside_institutions.brokerage],
  ];
  for (const t of p.transactions) {
    if (t.account_id !== 'chk' || t.amount >= 0) continue;
    const desc = t.description.toUpperCase();
    for (const [kind, names] of lists) {
      const inst = names.find((n) => desc.includes(n));
      if (!inst) continue;
      const g = groups.get(inst) ?? { institution: inst, kind, monthlyAmount: 0, occurrences: 0 };
      g.occurrences += 1;
      g.monthlyAmount += -t.amount;
      groups.set(inst, g);
    }
  }
  const months = daysBetween(p.period.start, p.period.end) / 30.44;
  return [...groups.values()]
    .filter((g) => g.occurrences >= cfg.nudges.money_leaving_min_occurrences)
    .map((g) => ({ ...g, monthlyAmount: Math.round(g.monthlyAmount / Math.max(1, Math.round(months))) }));
}

export function deriveFigures(p: Persona, cfg: Config, tables: TaxTables): Derived {
  const checking = p.accounts.filter((a) => a.type === 'checking').reduce((s, a) => s + a.balance, 0);
  const savings = p.accounts.filter((a) => a.type === 'savings').reduce((s, a) => s + a.balance, 0);
  const chk = p.transactions.filter((t) => t.account_id === 'chk');
  const typicalPaycheck = median(chk.filter((t) => t.category === 'payroll').map((t) => t.amount));
  const monthsObserved = daysBetween(p.period.start, p.period.end) / 30.44;
  const spend = chk.filter((t) => t.amount < 0 && !NON_SPENDING.has(t.category)).reduce((s, t) => s - t.amount, 0);
  const avgMonthlyOutflow = Math.round(spend / monthsObserved);
  const buffer = Math.round(cfg.ranking.buffer_months * avgMonthlyOutflow);
  const step = cfg.ranking.round_down_to;
  // Decision (2026-11-16): money in Chase Savings at 0.01% counts as movable along with checking.
  const movable = Math.max(0, Math.floor((checking + savings - buffer) / step) * step);
  const cards = p.accounts.filter((a) => a.type === 'credit_card' && (a.revolving_balance ?? 0) > 0);
  const cardRevolving = cards.reduce((s, a) => s + (a.revolving_balance ?? 0), 0);
  const cardApr = cards.reduce((m, a) => Math.max(m, a.apr ?? 0), 0);
  return {
    checking,
    savings,
    typicalPaycheck,
    avgMonthlyOutflow,
    buffer,
    movable,
    cardRevolving,
    cardApr,
    recurringOutside: detectRecurringOutside(p, cfg),
    tax: estimateTaxRates(p.profile, tables),
    monthsObserved: Math.round(monthsObserved * 10) / 10,
  };
}
