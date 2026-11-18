// Shared types for data, rules engine, conversation layer and interface.

export interface Profile {
  name: string;
  age: number;
  city: string;
  state: string;
  locality?: string;
  estimated_gross_income: number;
  filing_status: 'single';
  situation: string;
}

export interface Account {
  id: string;
  type: 'checking' | 'savings' | 'credit_card' | 'brokerage';
  name: string;
  balance: number;
  opening_balance?: number;
  revolving_balance?: number;
  apr?: number;
}

export interface Transaction {
  date: string;
  account_id: string;
  description: string;
  amount: number;
  category: string;
  balance_after?: number;
}

export interface Persona {
  id: string;
  profile: Profile;
  accounts: Account[];
  has_brokerage: boolean;
  brokerage_holdings: { symbol: string; name: string; value: number }[];
  external_links: { institution: string; type: string; rate_category: string }[];
  demo_answers: { timing: TimingKind; date?: string; note?: string; redirect_recurring?: boolean };
  period: { start: string; end: string };
  transactions: Transaction[];
}

export type TimingKind = 'anytime' | 'date' | 'over_12';

export interface Answers {
  amount: number;
  timing: TimingKind;
  date?: string; // ISO, when timing === 'date'
  redirectRecurring: boolean;
}

export interface CdTerm {
  months: number;
  featured?: boolean;
  tiers: { min: number; apy: number }[];
}
export interface BillTerm {
  weeks: number;
  yield: number;
}

export interface Product {
  id: string;
  name: string;
  short_name: string;
  ticker?: string;
  type: 'deposit' | 'brokered_deposit' | 'fund' | 'security';
  fund_kind?: 'prime' | 'government' | 'treasury';
  yield?: number;
  yield_basis: string;
  as_of: string;
  minimum: number;
  insured: 'FDIC' | 'us_government' | 'none';
  needs_brokerage: boolean;
  days_to_cash: number | null;
  access_label: string;
  locks_until_maturity: boolean;
  state_tax_exempt_share: number;
  direct_treasury?: boolean;
  steps_to_act: number;
  rate_note?: string;
  terms?: (CdTerm | BillTerm)[];
  tradeoffs: string[];
  disclosure_ids: string[];
  source_url: string;
  verify: string[];
}

export interface Benchmark {
  id: string;
  name: string;
  yield: number;
  yield_low?: number;
  yield_high?: number;
  yield_basis: string;
  as_of: string;
  insured: string;
  access_label: string;
  verify: string[];
}

export interface Catalog {
  snapshot_taken: string;
  products: Product[];
  benchmarks: Benchmark[];
}

export interface Config {
  demo_date: string;
  brand: { product_label: string; prototype_label: string };
  ranking: {
    buffer_months: number;
    round_down_to: number;
    thin_buffer_months: number;
    tie_break_points: number;
    brokerage_open_extra_steps: number;
  };
  nudges: {
    large_deposit_multiple: number;
    idle_balance_outflow_multiple: number;
    idle_balance_days: number;
    money_leaving_min_occurrences: number;
    suppress_days: number;
    priority: NudgeId[];
  };
  outside_institutions: { savings: string[]; brokerage: string[] };
  recurring_redirect: { first_year_balance_months: number };
  model: {
    provider: string;
    endpoint: string;
    default_model: string;
    model_options: string[];
    timeout_ms: number;
    explanation_max_tokens: number;
    answer_max_tokens: number;
    answer_history_turns: number;
    max_explanation_chars: number;
  };
}

export interface Bracket {
  up_to: number | null;
  rate: number;
}
export interface TaxTables {
  federal: { single: { standard_deduction: number; brackets: Bracket[] } };
  states: Record<string, { name: string; standard_deduction: number; brackets: Bracket[]; fund_exemption_threshold?: number }>;
  localities: Record<string, { name: string; state: string; standard_deduction: number; brackets: Bracket[] }>;
}

export interface TaxRates {
  federal: number;
  state: number; // state only
  local: number; // city, e.g. NYC
  stateLocal: number; // state + local, used in the formula as t_state
  stateName: string;
  localName?: string;
  fundThreshold?: number;
}

export interface RecurringOutside {
  institution: string;
  kind: 'savings' | 'brokerage';
  monthlyAmount: number;
  occurrences: number;
}

export interface Derived {
  checking: number;
  savings: number;
  typicalPaycheck: number;
  avgMonthlyOutflow: number;
  buffer: number;
  movable: number;
  cardRevolving: number;
  cardApr: number;
  recurringOutside: RecurringOutside[];
  tax: TaxRates;
  monthsObserved: number;
}

export type GateId = 'card_debt' | 'thin_buffer';
export interface GateResult {
  id: GateId;
  applies: boolean;
  rule: string;
  values: Record<string, number | string>;
}

export interface ReasonFact {
  code: string;
  params: Record<string, string | number>;
}

export interface RankedOption {
  rank: number;
  productId: string;
  name: string;
  shortName: string;
  termLabel?: string;
  maturityDate?: string;
  yield: number;
  yieldBasis: string;
  asOf: string;
  exemptShare: number;
  exemptShareApplied: number;
  afterTaxYield: number;
  amountBasis: number; // dollars the annual figure is computed on
  annualDollars: number;
  lumpDollars: number;
  recurringDollars: number;
  steps: number;
  needsAccountOpening: boolean;
  insured: Product['insured'];
  tradeoffs: string[];
  disclosureIds: string[];
  accessLabel: string;
  daysToCash: number | null;
  locks: boolean;
  tieBreakNote?: string;
  facts: ReasonFact[];
  verify: string[];
}

export interface Exclusion {
  productId: string;
  name: string;
  reason: string;
}

export interface BenchmarkRow {
  id: string;
  name: string;
  yield: number;
  yieldLow?: number;
  yieldHigh?: number;
  asOf: string;
  afterTaxYield: number;
  annualDollars: number;
  differenceVsTop: number; // benchmark dollars minus top Chase option dollars
}

export interface RankingResult {
  gate: GateResult | null;
  gates: GateResult[];
  ranked: RankedOption[];
  excluded: Exclusion[];
  benchmarks: BenchmarkRow[];
  topKey: string | null; // productId:mode — what "top result" means for acceptance tests
}

export type NudgeId = 'large_deposit' | 'idle_balance' | 'money_leaving';
export interface NudgeResult {
  id: NudgeId;
  fired: boolean;
  detail: string;
  values: Record<string, number | string>;
}

export interface TraceEntry {
  at: string;
  kind: 'disclosure' | 'model' | 'action' | 'nudge' | 'intent';
  detail: string;
  data?: Record<string, unknown>;
}
