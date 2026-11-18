// A "flow" is one interface's copy of the recommendation journey: its answers, ranking, explanations
// and action steps. The chat and the cash-options page each have their own, so demoing one never
// changes the other. Cards, the gate message and the action flow read from whichever flow wraps them.
import { createContext, useContext } from 'react';
import type { Answers, Derived, RankedOption, RankingResult } from '../engine/types';
import type { Explained } from '../conversation/agent';
import type { ActionState } from './store';

export type FlowId = 'chat' | 'page';

export interface Flow {
  id: FlowId;
  derived: Derived | null;
  answers: Answers | null;
  result: RankingResult | null;
  /** True while the customer can pick an option (not mid-action, not done). */
  canChoose: boolean;
  /** True while answers can't change (an action is in progress or done). */
  locked: boolean;
  explanations: Record<string, Explained>;
  explaining: boolean;
  action: ActionState | null;
  selectedOption: RankedOption | null;
  updateAnswers: (patch: Partial<Answers>) => void;
  choose: (productId: string) => void;
  actionNext: () => void;
  actionBack: () => void;
  actionPatch: (patch: Partial<ActionState>) => void;
  cancelAction: () => void;
}

export const FlowCtx = createContext<Flow | null>(null);
export const useFlow = () => useContext(FlowCtx)!;
