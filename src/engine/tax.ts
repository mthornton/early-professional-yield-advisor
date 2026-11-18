import type { Bracket, Profile, TaxRates, TaxTables } from './types';

export function marginalRate(brackets: Bracket[], taxable: number): number {
  for (const b of brackets) {
    if (b.up_to === null || taxable <= b.up_to) return b.rate;
  }
  return brackets[brackets.length - 1].rate;
}

/** Simple bracket lookup on estimated gross income, single filer. */
export function estimateTaxRates(profile: Profile, tables: TaxTables): TaxRates {
  const fed = tables.federal.single;
  const federal = marginalRate(fed.brackets, Math.max(0, profile.estimated_gross_income - fed.standard_deduction));
  const st = tables.states[profile.state];
  const state = st ? marginalRate(st.brackets, Math.max(0, profile.estimated_gross_income - st.standard_deduction)) : 0;
  const loc = profile.locality ? tables.localities[profile.locality] : undefined;
  const local = loc ? marginalRate(loc.brackets, Math.max(0, profile.estimated_gross_income - loc.standard_deduction)) : 0;
  return {
    federal,
    state,
    local,
    stateLocal: state + local,
    stateName: st?.name ?? profile.state,
    localName: loc?.name,
    fundThreshold: st?.fund_exemption_threshold,
  };
}

/** y_after = y × (1 − t_fed − t_state × (1 − e)) */
export function afterTaxYield(y: number, rates: TaxRates, e: number): number {
  return y * (1 - rates.federal - rates.stateLocal * (1 - e));
}
