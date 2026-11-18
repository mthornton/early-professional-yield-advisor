import type { Answers, NudgeId, TraceEntry } from '../engine/types';
import type { Explained, Mode } from '../conversation/agent';
import type { IntentKind } from '../conversation/intent';
import { config } from '../data';
import { envKey } from '../conversation/openrouter';

export type Variant = 'upfront' | 'progressive';

export type BlockKind =
  | 'user'
  | 'agent_text'
  | 'literal'
  | 'general_options'
  | 'consent_upfront'
  | 'consent_progressive'
  | 'profile'
  | 'gate'
  | 'questions'
  | 'recommendations'
  | 'action'
  | 'confirmation';

export interface Block {
  id: string;
  kind: BlockKind;
  text?: string;
  data?: Record<string, unknown>;
}

export type ActionStep = 'open_1' | 'open_2' | 'amount' | 'final_disclosure' | 'confirm';

export interface ActionState {
  productId: string;
  steps: ActionStep[];
  index: number;
  finalAccepted: boolean;
  agreementsAccepted: boolean;
}

export interface Holding {
  productId: string;
  name: string;
  amount: number;
  monthly: number;
  annualDollars: number;
  afterTaxYield: number;
  availableLabel: string;
  undoLabel: string;
  fromChecking: number;
  fromSavings: number;
  openedBrokerage: boolean;
  at: string;
}

/** Figures the customer can correct on the cash-options page. Pre-filled from account data. */
export interface Overrides {
  state: string;
  nyc: boolean;
  income: number;
  cardBalance: number;
  cardAprPct: number;
  monthly: number;
}

export interface PageState {
  consented: boolean;
  declined: boolean;
  shown: boolean;
  answers: Answers | null;
  overrides: Overrides | null;
  action: ActionState | null;
  confirmation: Holding | null;
  explanations: Record<string, Explained>;
  explaining: boolean;
}

export const pageReset = (): PageState => ({
  consented: false,
  declined: false,
  shown: false,
  answers: null,
  overrides: null,
  action: null,
  confirmation: null,
  explanations: {},
  explaining: false,
});

export interface State {
  view: 'accounts' | 'cash';
  page: PageState;
  personaId: string | null;
  variant: Variant;
  mode: Mode;
  apiKey: string;
  model: string;
  showTrace: boolean;
  demoOpen: boolean;
  chatOpen: boolean;
  pickerOpen: boolean;
  blocks: Block[];
  consented: boolean;
  stage: 'idle' | 'answered' | 'consent' | 'recommend' | 'gated' | 'action' | 'done';
  intentKind: IntentKind | null;
  entry: 'ask' | 'nudge' | null;
  answers: Answers | null;
  trace: TraceEntry[];
  suppressedUntil: Record<string, Partial<Record<NudgeId, string>>>;
  forcedNudge: NudgeId | null;
  action: ActionState | null;
  holdings: Record<string, Holding[]>;
  explanations: Record<string, Explained>;
  explaining: boolean;
  explainKey: string;
  busy: boolean;
}

let seq = 0;
export const newId = () => `b${++seq}`;
export const now = () => new Date().toISOString();

const SUPPRESS_KEY = 'yield-poc-suppressed';
function loadSuppressed(): State['suppressedUntil'] {
  try {
    return JSON.parse(localStorage.getItem(SUPPRESS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveSuppressed(s: State['suppressedUntil']) {
  try {
    localStorage.setItem(SUPPRESS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: suppression lasts for this session only */
  }
}

export const initialState = (): State => ({
  view: 'accounts',
  page: pageReset(),
  personaId: null,
  variant: 'upfront',
  mode: 'scripted',
  apiKey: envKey,
  model: config.model.default_model,
  showTrace: true,
  demoOpen: true,
  chatOpen: false,
  pickerOpen: true,
  blocks: [],
  consented: false,
  stage: 'idle',
  intentKind: null,
  entry: null,
  answers: null,
  trace: [],
  suppressedUntil: loadSuppressed(),
  forcedNudge: null,
  action: null,
  holdings: {},
  explanations: {},
  explaining: false,
  explainKey: '',
  busy: false,
});

export type Action =
  | { type: 'set'; patch: Partial<State> }
  | { type: 'setPage'; patch: Partial<PageState> }
  | { type: 'resetPage' }
  | { type: 'selectPersona'; id: string }
  | { type: 'resetChat' }
  | { type: 'resetAll' }
  | { type: 'addBlocks'; blocks: Omit<Block, 'id'>[]; patch?: Partial<State> }
  | { type: 'trace'; entry: Omit<TraceEntry, 'at'> }
  | { type: 'setAnswers'; answers: Answers }
  | { type: 'suppress'; personaId: string; nudge: NudgeId; until: string }
  | { type: 'addHolding'; personaId: string; holding: Holding };

const chatReset: Partial<State> = {
  blocks: [],
  consented: false,
  stage: 'idle',
  intentKind: null,
  entry: null,
  answers: null,
  trace: [],
  forcedNudge: null,
  action: null,
  explanations: {},
  explaining: false,
  explainKey: '',
  busy: false,
};

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'setPage':
      return { ...s, page: { ...s.page, ...a.patch } };
    case 'resetPage':
      return { ...s, page: pageReset() };
    case 'selectPersona':
      return { ...s, ...chatReset, page: pageReset(), personaId: a.id, pickerOpen: false, chatOpen: false };
    case 'resetChat':
      return { ...s, ...chatReset };
    case 'resetAll':
      saveSuppressed({});
      return { ...s, ...chatReset, page: pageReset(), suppressedUntil: {}, holdings: {}, chatOpen: false };
    case 'addBlocks':
      return { ...s, ...a.patch, blocks: [...s.blocks, ...a.blocks.map((b) => ({ ...b, id: newId() }))] };
    case 'trace':
      return { ...s, trace: [...s.trace, { ...a.entry, at: now() }] };
    case 'setAnswers':
      return { ...s, answers: a.answers };
    case 'suppress': {
      const suppressedUntil = {
        ...s.suppressedUntil,
        [a.personaId]: { ...(s.suppressedUntil[a.personaId] ?? {}), [a.nudge]: a.until },
      };
      saveSuppressed(suppressedUntil);
      return { ...s, suppressedUntil, forcedNudge: null };
    }
    case 'addHolding':
      return {
        ...s,
        holdings: { ...s.holdings, [a.personaId]: [...(s.holdings[a.personaId] ?? []), a.holding] },
      };
  }
}
