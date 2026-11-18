import type { Config, Derived, GateResult, NudgeId, NudgeResult, Persona } from './types';
import { daysBetween } from './derive';

/** End-of-day checking balance for each date in the window, from the generated running balances. */
function dailyBalances(p: Persona): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of p.transactions) if (t.account_id === 'chk' && t.balance_after !== undefined) m.set(t.date, t.balance_after);
  return m;
}

export function evaluateNudges(p: Persona, d: Derived, gates: GateResult[], cfg: Config): NudgeResult[] {
  const n = cfg.nudges;
  const today = cfg.demo_date;
  const debtGate = gates.find((g) => g.id === 'card_debt' && g.applies);

  // Large deposit: a single non-payroll deposit at least N× the typical paycheck, in the last 30 days.
  const big = p.transactions
    .filter((t) => t.account_id === 'chk' && t.amount > 0 && t.category !== 'payroll' && daysBetween(t.date, today) <= 30)
    .sort((a, b) => b.amount - a.amount)[0];
  const largeFired = !!big && big.amount >= n.large_deposit_multiple * d.typicalPaycheck;

  // Idle balance: checking above N× average monthly outflow on every day of the last 60 days.
  const bals = dailyBalances(p);
  const threshold = n.idle_balance_outflow_multiple * d.avgMonthlyOutflow;
  let running = p.accounts.find((a) => a.id === 'chk')?.opening_balance ?? 0;
  let minInWindow = Infinity;
  for (let i = daysBetween(p.period.start, p.period.end); i >= 0; i--) {
    const day = new Date(Date.parse(`${p.period.end}T12:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    if (bals.has(day)) running = bals.get(day)!;
    if (daysBetween(day, today) <= n.idle_balance_days) minInWindow = Math.min(minInWindow, running);
  }
  const idleFired = minInWindow > threshold;

  const leaving = d.recurringOutside;
  const leavingFired = leaving.length > 0;

  const results: NudgeResult[] = [
    {
      id: 'large_deposit',
      fired: largeFired,
      detail: big
        ? `Largest recent deposit $${big.amount.toLocaleString()} on ${big.date} vs ${n.large_deposit_multiple}× typical paycheck ($${Math.round(n.large_deposit_multiple * d.typicalPaycheck).toLocaleString()})`
        : 'No non-payroll deposit in the last 30 days',
      values: { largest_deposit: big?.amount ?? 0, typical_paycheck: d.typicalPaycheck },
    },
    {
      id: 'money_leaving',
      fired: leavingFired,
      detail: leavingFired
        ? leaving.map((l) => `~$${l.monthlyAmount.toLocaleString()}/month to an outside ${l.kind} account (${l.occurrences} transfers)`).join('; ')
        : 'No recurring transfers to outside savings or brokerage',
      values: { monthly: leaving.reduce((s, l) => s + l.monthlyAmount, 0) },
    },
    {
      id: 'idle_balance',
      fired: idleFired,
      detail: `Lowest checking balance in last ${n.idle_balance_days} days $${Math.round(minInWindow).toLocaleString()} vs ${n.idle_balance_outflow_multiple}× monthly outflow ($${Math.round(threshold).toLocaleString()})`,
      values: { min_balance: Math.round(minInWindow), threshold: Math.round(threshold) },
    },
  ];

  if (debtGate) {
    // A customer carrying card debt should not be nudged toward a savings product.
    return results.map((r) => ({ ...r, fired: false, detail: `${r.detail} — suppressed by card-debt gate` }));
  }
  return results;
}

export function primaryNudge(results: NudgeResult[], cfg: Config, suppressed: Set<NudgeId>): NudgeResult | null {
  for (const id of cfg.nudges.priority) {
    const r = results.find((x) => x.id === id);
    if (r?.fired && !suppressed.has(id)) return r;
  }
  return null;
}
