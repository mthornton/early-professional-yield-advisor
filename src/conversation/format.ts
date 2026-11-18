export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const signedMoney = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
export const pct = (n: number, digits = 2) => `${n.toFixed(digits)}%`;
export const ratePct = (r: number) => `${(r * 100).toFixed(r * 100 < 10 ? 2 : 1)}%`;
export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export const asOf = (iso: string) => `as of ${longDate(iso)}`;
