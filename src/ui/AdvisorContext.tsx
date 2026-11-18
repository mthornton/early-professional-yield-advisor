import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { Flow } from './flow';
import { catalog, config, disclosures, personaById, taxTables } from '../data';
import {
  addDaysIso,
  defaultAnswers,
  deriveFigures,
  estimateTaxRates,
  evaluateNudges,
  primaryNudge,
  rank,
  type Account,
  type Answers,
  type Derived,
  type NudgeId,
  type NudgeResult,
  type Persona,
  type RankedOption,
  type RankingResult,
} from '../engine';
import { classify, explainAll } from '../conversation/agent';
import { answerQuestion, buildAnswerContext } from '../conversation/answer';
import type { ChatTurn } from '../conversation/openrouter';
import { literalAnswer, OFFER_TEXT } from '../conversation/explain';
import { longDate, money } from '../conversation/format';
import { initialState, now, reducer, type ActionStep, type Block, type Holding, type Overrides, type PageState, type State } from './store';

/** The visible text conversation so far, for the model's open answers. Cards and forms are summarized. */
function recentTurns(blocks: Block[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const b of blocks) {
    if (b.kind === 'user' && b.text) turns.push({ role: 'user', content: b.text });
    else if ((b.kind === 'agent_text' || b.kind === 'literal' || b.kind === 'consent_progressive') && b.text) turns.push({ role: 'assistant', content: b.text });
    else if (b.kind === 'recommendations') turns.push({ role: 'assistant', content: '[Showed the ranked options from "ranking" as cards.]' });
    else if (b.kind === 'gate') turns.push({ role: 'assistant', content: '[Showed the message in "ranking.gate".]' });
    else if (b.kind === 'general_options') turns.push({ role: 'assistant', content: '[Showed the general list of Chase cash options and rates.]' });
    else if (b.kind === 'consent_upfront') turns.push({ role: 'assistant', content: '[Asked for consent to use account data to rank options.]' });
    else if (b.kind === 'confirmation') turns.push({ role: 'assistant', content: '[Confirmed a simulated order; see simulated_actions_taken_this_session.]' });
  }
  // Merge consecutive same-role turns so the message list alternates.
  const merged: ChatTurn[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else merged.push({ ...t });
  }
  // The caller sends the new question separately; drop it if it is already in the blocks.
  if (merged.length && merged[merged.length - 1].role === 'user') merged.pop();
  const out = merged.slice(-config.model.answer_history_turns);
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

interface Ctx {
  s: State;
  set: (patch: Partial<State>) => void;
  persona: Persona | null;
  derived: Derived | null;
  result: RankingResult | null;
  nudges: NudgeResult[];
  activeNudge: (NudgeResult & { forced?: boolean }) | null;
  accounts: Account[];
  selectPersona: (id: string) => void;
  resetChat: () => void;
  resetAll: () => void;
  sendMessage: (text: string) => Promise<void>;
  acceptNudge: () => void;
  dismissNudge: () => void;
  forceNudge: (id: NudgeId) => void;
  showGeneralThenRank: () => void;
  acceptConsent: () => void;
  declineConsent: () => void;
  updateAnswers: (patch: Partial<Answers>) => void;
  choose: (productId: string) => void;
  actionPatch: (patch: Partial<NonNullable<State['action']>>) => void;
  actionNext: () => void;
  actionBack: () => void;
  cancelAction: () => void;
  selectedOption: RankedOption | null;
  chatFlow: Flow;
  pageFlow: Flow;
  page: PageState;
  pageOverrides: Overrides | null;
  pageDefaults: Overrides | null;
  openView: (view: State['view']) => void;
  pageConsent: () => void;
  pageDecline: () => void;
  pageShow: () => void;
  setOverrides: (patch: Partial<Overrides>) => void;
  resetPageInputs: () => void;
  restartPage: () => void;
}

const AdvisorCtx = createContext<Ctx | null>(null);
export const useAdvisor = () => useContext(AdvisorCtx)!;

const DATA_DISCLOSURES = ['data_consent', 'investments_not_deposits', 'advice_basis'];

export function undoLabel(o: RankedOption): string {
  switch (o.productId) {
    case 'chase_savings':
      return 'Transfer back to checking any time; it arrives instantly.';
    case 'chase_cd':
      return `Close the CD early from the account page. An early withdrawal penalty applies before ${longDate(o.maturityDate!)}.`;
    case 'tbill':
      return `Hold it to ${longDate(o.maturityDate!)} for full value, or sell early in Self-Directed Investing at market price (may return less).`;
    case 'premium_deposit':
      return 'Move it back to Self-Directed Investing cash any business day, then transfer to checking.';
    default:
      return 'Sell shares in Self-Directed Investing any business day; cash reaches checking in about one business day.';
  }
}
export function availableLabel(o: RankedOption): string {
  if (o.maturityDate) return `${longDate(o.maturityDate)} (maturity)`;
  if (o.productId === 'chase_savings') return 'Instantly';
  if (o.productId === 'premium_deposit') return 'Same business day if requested before 4 p.m. ET, then a standard transfer to checking';
  return 'About one business day after you sell';
}

/** What the page pre-fills from account data. */
export function defaultOverrides(p: Persona, d: Derived): Overrides {
  const card = p.accounts.find((a) => a.type === 'credit_card');
  return {
    state: p.profile.state,
    nyc: p.profile.locality === 'NYC',
    income: p.profile.estimated_gross_income,
    cardBalance: d.cardRevolving,
    cardAprPct: Math.round((d.cardApr || card?.apr || 0) * 10000) / 100,
    monthly: d.recurringOutside.reduce((a, r) => a + r.monthlyAmount, 0),
  };
}

/** Derived figures with the customer's corrections applied. The rules engine runs unchanged on the result. */
export function applyOverrides(p: Persona, d: Derived, o: Overrides): Derived {
  const profile = { ...p.profile, state: o.state, locality: o.state === 'NY' && o.nyc ? 'NYC' : undefined, estimated_gross_income: Math.max(0, o.income) };
  return {
    ...d,
    tax: estimateTaxRates(profile, taxTables),
    cardRevolving: Math.max(0, o.cardBalance),
    cardApr: Math.max(0, o.cardAprPct) / 100,
    recurringOutside: d.recurringOutside.length ? [{ ...d.recurringOutside[0], monthlyAmount: Math.max(0, o.monthly) }] : [],
  };
}

const actionSteps = (o: RankedOption): ActionStep[] => [...(o.needsAccountOpening ? (['open_1', 'open_2'] as ActionStep[]) : []), 'amount', 'final_disclosure', 'confirm'];

/** The simulated order: where the money comes from and what the customer holds afterward. */
export function buildHolding(o: RankedOption, answers: Answers, d: Derived): Holding {
  const lump = answers.amount;
  const fromChecking = Math.min(lump, Math.max(0, d.checking - d.buffer));
  const fromSavings = Math.min(d.savings, lump - fromChecking);
  const monthly = answers.redirectRecurring ? d.recurringOutside.reduce((a, r) => a + r.monthlyAmount, 0) : 0;
  return {
    productId: o.productId,
    name: o.productId === 'chase_cd' ? `Chase CD (${o.termLabel})` : o.name,
    amount: lump,
    monthly,
    annualDollars: o.annualDollars,
    afterTaxYield: o.afterTaxYield,
    availableLabel: availableLabel(o),
    undoLabel: undoLabel(o),
    fromChecking: Math.max(0, fromChecking),
    fromSavings: Math.max(0, fromSavings),
    openedBrokerage: o.needsAccountOpening,
    at: now(),
  };
}

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const set = useCallback((patch: Partial<State>) => dispatch({ type: 'set', patch }), []);

  const basePersona = s.personaId ? personaById(s.personaId) : null;
  // Accounts as displayed, after any simulated actions.
  const accounts = useMemo(() => {
    if (!basePersona) return [];
    const list: Account[] = basePersona.accounts.map((a) => ({ ...a }));
    for (const h of s.holdings[basePersona.id] ?? []) {
      const chk = list.find((a) => a.type === 'checking');
      const sav = list.find((a) => a.type === 'savings');
      if (chk) chk.balance -= h.fromChecking;
      if (sav) sav.balance -= h.fromSavings;
      if (h.productId === 'chase_cd') {
        list.push({ id: `cd-${h.at}`, type: 'savings', name: h.name, balance: h.amount });
      } else if (h.productId === 'chase_savings') {
        if (sav) sav.balance += h.amount;
        else list.push({ id: `sav-${h.at}`, type: 'savings', name: 'Chase Savings', balance: h.amount });
      } else {
        const sdi = list.find((a) => a.type === 'brokerage');
        if (sdi) sdi.balance += h.amount;
        else list.push({ id: `sdi-${h.at}`, type: 'brokerage', name: 'Self-Directed Investing', balance: h.amount });
      }
    }
    return list;
  }, [basePersona, s.holdings]);
  // The engine, both interfaces and the model all see balances after simulated orders, so a move made
  // on the page isn't pitched again in the chat (and vice versa).
  const persona = useMemo((): Persona | null => {
    if (!basePersona) return null;
    const opened = (s.holdings[basePersona.id] ?? []).some((h) => h.openedBrokerage);
    // A simulated CD shows as its own tile but is locked money, not movable cash.
    const engineAccounts = accounts.filter((a) => !a.id.startsWith('cd-'));
    return { ...basePersona, accounts: engineAccounts, has_brokerage: basePersona.has_brokerage || opened };
  }, [basePersona, accounts, s.holdings]);
  const derived = useMemo(() => (persona ? deriveFigures(persona, config, taxTables) : null), [persona]);
  const answers = useMemo(() => s.answers ?? (persona && derived ? defaultAnswers(persona, derived) : null), [s.answers, persona, derived]);
  const result = useMemo(
    () => (persona && derived && answers ? rank(persona, derived, answers, catalog, config) : null),
    [persona, derived, answers],
  );
  const nudges = useMemo(() => (persona && derived && result ? evaluateNudges(persona, derived, result.gates, config) : []), [persona, derived, result]);

  const activeNudge = useMemo((): (NudgeResult & { forced?: boolean }) | null => {
    if (!persona || !derived) return null;
    if (s.forcedNudge) {
      const r = nudges.find((n) => n.id === s.forcedNudge)!;
      return { ...r, fired: true, forced: true };
    }
    const until = s.suppressedUntil[persona.id] ?? {};
    const suppressed = new Set(
      (Object.keys(until) as NudgeId[]).filter((k) => (until[k] ?? '') > config.demo_date),
    );
    if (derived.movable <= 0) return null; // nothing left to move, e.g. after a simulated order
    return primaryNudge(nudges, config, suppressed);
  }, [persona, derived, nudges, s.forcedNudge, s.suppressedUntil]);


  const trace = (kind: 'disclosure' | 'model' | 'action' | 'nudge' | 'intent', detail: string, data?: Record<string, unknown>) =>
    dispatch({ type: 'trace', entry: { kind, detail, data } });

  const selectPersona = (id: string) => dispatch({ type: 'selectPersona', id });
  const resetChat = () => dispatch({ type: 'resetChat' });
  const resetAll = () => dispatch({ type: 'resetAll' });

  /** After consent: read the profile, then either a gate or the two questions + ranked options. */
  const personalize = useCallback(() => {
    if (!result) return;
    const blocks: { kind: 'profile' | 'gate' | 'questions' | 'recommendations' | 'agent_text'; text?: string }[] = [{ kind: 'profile' }];
    if (result.gate) {
      blocks.push({ kind: 'gate' });
      dispatch({ type: 'addBlocks', blocks, patch: { consented: true, stage: 'gated' } });
    } else {
      blocks.push(
        { kind: 'agent_text', text: 'Two quick questions. I pre-filled the amount from your balances; change either answer and the ranking updates.' },
        { kind: 'questions' },
        { kind: 'recommendations' },
      );
      dispatch({ type: 'addBlocks', blocks, patch: { consented: true, stage: 'recommend', answers } });
    }
  }, [result, answers]);

  const askConsent = (lead?: string) => {
    if (s.variant === 'upfront') {
      dispatch({
        type: 'addBlocks',
        blocks: [{ kind: 'agent_text', text: lead ?? OFFER_TEXT }, { kind: 'consent_upfront' }],
        patch: { stage: 'consent' },
      });
      trace('disclosure', 'Shown: upfront disclosure panel', { ids: DATA_DISCLOSURES, variant: 'upfront' });
    } else {
      dispatch({ type: 'addBlocks', blocks: [{ kind: 'consent_progressive', text: lead }], patch: { stage: 'consent' } });
      trace('disclosure', 'Shown: short data-consent line', { ids: ['data_consent'], variant: 'progressive' });
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !persona) return;
    dispatch({ type: 'addBlocks', blocks: [{ kind: 'user', text }], patch: { busy: true } });
    const settings = { mode: s.mode, apiKey: s.apiKey, model: s.model };
    const { intent, log, fallback } = await classify(text, settings);
    if (log) trace('model', `Intent call ${log.ok ? 'ok' : 'failed'} (${log.ms} ms)`, { ...log });
    trace('intent', `${intent.isYield ? `Yield intent: ${intent.kind}` : 'Not a yield question'} via ${intent.source}${fallback ? ` — ${fallback}` : ''}`, {
      text,
      matched: intent.matched,
    });
    // Open questions go to the model with all customer data, the ranking and the catalog.
    // Only the first yield question starts the scripted Flow A (literal answer, then consent).
    // Scripted mode keeps the canned replies.
    if (!intent.isYield || s.stage !== 'idle') {
      const scripted = !intent.isYield
        ? 'In this prototype I can help with savings and earning more on cash. Try asking about savings rates or where to put extra money.'
        : s.consented
          ? 'Your ranked options are above. Change the amount or timing and the ranking updates right away.'
          : 'The options are listed above. Say yes to the data question and I can rank them for you.';
      const reply = await answerQuestion(text, recentTurns(s.blocks), buildAnswerContext({
        persona,
        accounts,
        derived: derived!,
        answers: s.consented ? answers : null,
        result: s.consented ? result : null,
        consented: s.consented,
        holdings: s.holdings[persona.id] ?? [],
        catalog,
      }), settings);
      if (reply.log) trace('model', `Answer call ${reply.log.ok ? 'ok' : 'failed'} (${reply.log.ms} ms)`, { ...reply.log });
      if (reply.fallback) trace('model', reply.fallback);
      if (reply.note) trace('model', reply.note);
      dispatch({
        type: 'addBlocks',
        blocks: [reply.text ? { kind: 'agent_text', text: reply.text, data: { source: 'model', note: reply.note } } : { kind: 'agent_text', text: scripted }],
        patch: { busy: false },
      });
      return;
    }
    dispatch({ type: 'set', patch: { busy: false } });
    dispatch({ type: 'addBlocks', blocks: [{ kind: 'literal', text: literalAnswer(intent.kind, catalog) }], patch: { intentKind: intent.kind, entry: 'ask', stage: 'answered' } });
    if (s.variant === 'upfront') askConsent();
    else {
      dispatch({ type: 'addBlocks', blocks: [{ kind: 'general_options' }] });
    }
  };

  const showGeneralThenRank = () => askConsent();

  const acceptNudge = () => {
    if (!activeNudge || !derived) return;
    trace('nudge', `Accepted nudge: ${activeNudge.id}${activeNudge.forced ? ' (forced by demo control)' : ''}`, activeNudge.values);
    dispatch({ type: 'set', patch: { entry: 'nudge', forcedNudge: null } });
    dispatch({ type: 'addBlocks', blocks: [{ kind: 'user', text: 'Show me' }] });
    askConsent(`Here's what about ${money(derived.movable)} could earn. ${OFFER_TEXT}`);
  };

  const dismissNudge = () => {
    if (!activeNudge || !persona) return;
    const until = addDaysIso(config.demo_date, config.nudges.suppress_days);
    dispatch({ type: 'suppress', personaId: persona.id, nudge: activeNudge.id, until });
    trace('nudge', `Dismissed nudge: ${activeNudge.id}; suppressed until ${until}`);
  };

  const forceNudge = (id: NudgeId) => {
    dispatch({ type: 'resetChat' });
    dispatch({ type: 'set', patch: { forcedNudge: id, chatOpen: true } });
  };

  const acceptConsent = () => {
    const ids = s.variant === 'upfront' ? DATA_DISCLOSURES : ['data_consent'];
    trace('disclosure', `Accepted: ${ids.join(', ')}`, { ids, variant: s.variant, accepted_at: now() });
    personalize();
  };
  const declineConsent = () => {
    trace('disclosure', 'Declined data consent', { variant: s.variant });
    dispatch({
      type: 'addBlocks',
      blocks: [
        { kind: 'agent_text', text: "No problem. Here are the general options without using your data. You can ask me to rank them any time." },
        ...(s.variant === 'upfront' ? [{ kind: 'general_options' as const }] : []),
      ],
      patch: { stage: 'answered' },
    });
  };

  const updateAnswers = (patch: Partial<Answers>) => {
    if (!answers) return;
    dispatch({ type: 'setAnswers', answers: { ...answers, ...patch } });
  };

  const selectedOption = useMemo(
    () => (s.action && result ? result.ranked.find((o) => o.productId === s.action!.productId) ?? null : null),
    [s.action, result],
  );

  const choose = (productId: string) => {
    const o = result?.ranked.find((x) => x.productId === productId);
    if (!o) return;
    const steps = actionSteps(o);
    trace('action', `Chose ${o.shortName} (rank ${o.rank})`, { productId, steps });
    dispatch({
      type: 'addBlocks',
      blocks: [{ kind: 'user', text: `I'll go with the ${o.shortName.toLowerCase()}.` }, { kind: 'action' }],
      patch: { stage: 'action', action: { productId, steps, index: 0, finalAccepted: false, agreementsAccepted: false } },
    });
  };

  const actionPatch = (patch: Partial<NonNullable<State['action']>>) => s.action && set({ action: { ...s.action, ...patch } });
  const actionBack = () => s.action && s.action.index > 0 && set({ action: { ...s.action, index: s.action.index - 1 } });
  const cancelAction = () => {
    trace('action', 'Cancelled action flow');
    dispatch({ type: 'addBlocks', blocks: [{ kind: 'agent_text', text: 'Cancelled. Nothing moved. Your options are still above.' }], patch: { stage: 'recommend', action: null } });
  };

  const actionNext = () => {
    if (!s.action || !selectedOption || !persona || !derived || !answers) return;
    const step = s.action.steps[s.action.index];
    if (step === 'open_2') trace('action', 'Simulated: opened Self-Directed Investing account');
    if (step === 'final_disclosure') {
      trace('disclosure', 'Accepted: final disclosure before order', { ids: [...selectedOption.disclosureIds, 'order_final'], accepted_at: now() });
    }
    if (step !== 'confirm') {
      if (s.action.steps[s.action.index + 1] === 'final_disclosure') {
        trace('disclosure', 'Shown: final disclosure before order', { ids: [...selectedOption.disclosureIds, 'order_final'] });
      }
      set({ action: { ...s.action, index: s.action.index + 1 } });
      return;
    }
    // Confirm: simulate the order and record the holding.
    const o = selectedOption;
    const holding = buildHolding(o, answers, derived);
    const lump = holding.amount;
    const monthly = holding.monthly;
    dispatch({ type: 'addHolding', personaId: persona.id, holding });
    trace('action', `Simulated order placed: ${money(lump)} into ${o.shortName}${monthly ? ` + ${money(monthly)}/month redirected` : ''}`, { ...holding });
    dispatch({ type: 'addBlocks', blocks: [{ kind: 'confirmation', data: { holding } }], patch: { stage: 'done', action: null } });
  };

  // Disclosure log for progressive per-card notices (shown when a brokered product is ranked).
  const loggedNotices = useRef(new Set<string>());
  useEffect(() => {
    if (s.variant !== 'progressive' || s.stage !== 'recommend' || !result) return;
    for (const o of result.ranked) {
      const ids = o.disclosureIds.filter((d) => d !== 'deposit_general' && d !== 'cd_penalty');
      if (!ids.length || loggedNotices.current.has(o.productId)) continue;
      loggedNotices.current.add(o.productId);
      trace('disclosure', `Shown on card: ${disclosures.items[ids[0]]?.title ?? ids[0]} (${o.shortName})`, { ids, variant: 'progressive' });
    }
  }, [s.variant, s.stage, result]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s.blocks.length) loggedNotices.current.clear();
  }, [s.blocks.length]);

  // Explanations: template instantly; in model mode, one model call per ranking (debounced).
  const rankedKey = result && s.consented ? JSON.stringify(result.ranked.map((o) => [o.productId, o.annualDollars, o.rank])) + s.mode + s.model : '';
  useEffect(() => {
    if (!rankedKey || !result) return;
    let cancelled = false;
    const settings = { mode: s.mode, apiKey: s.apiKey, model: s.model };
    const t = setTimeout(
      async () => {
        if (s.mode === 'model') set({ explaining: true });
        const { texts, log, fallback } = await explainAll(result.ranked, settings);
        if (cancelled) return;
        if (log) trace('model', `Explanation call ${log.ok ? 'ok' : 'failed'} (${log.ms} ms)`, { ...log });
        if (fallback) trace('model', fallback);
        set({ explanations: texts, explaining: false, explainKey: rankedKey });
      },
      s.mode === 'model' ? 400 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rankedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Cash-options page: its own answers, consent, ranking and action flow ----------
  const page = s.page;
  const setPage = (patch: Partial<PageState>) => dispatch({ type: 'setPage', patch });
  const pageDefaults = useMemo(() => (persona && derived ? defaultOverrides(persona, derived) : null), [persona, derived]);
  const pageOverrides = page.overrides ?? pageDefaults;
  const pageDerived = useMemo(
    () => (persona && derived && pageOverrides ? applyOverrides(persona, derived, pageOverrides) : null),
    [persona, derived, pageOverrides],
  );
  const pageAnswers = page.answers ?? (persona && derived ? defaultAnswers(persona, derived) : null);
  const pageResult = useMemo(
    () => (persona && pageDerived && pageAnswers ? rank(persona, pageDerived, pageAnswers, catalog, config) : null),
    [persona, pageDerived, pageAnswers],
  );
  const pageSelected = page.action && pageResult ? pageResult.ranked.find((o) => o.productId === page.action!.productId) ?? null : null;

  const openView = (view: State['view']) => {
    if (view === 'cash' && s.view !== 'cash') trace('action', 'Page: opened cash options page');
    set({ view });
  };
  const pageConsent = () => {
    const ids = s.variant === 'upfront' ? DATA_DISCLOSURES : ['data_consent'];
    trace('disclosure', `Page: accepted ${ids.join(', ')}`, { ids, variant: s.variant, surface: 'page', accepted_at: now() });
    setPage({ consented: true, declined: false });
  };
  const pageDecline = () => {
    trace('disclosure', 'Page: declined data consent', { variant: s.variant, surface: 'page' });
    setPage({ declined: true });
  };
  const pageShow = () => {
    if (!pageResult) return;
    trace('action', `Page: showed options${pageResult.gate ? ` (gate: ${pageResult.gate.id})` : ''}`, {
      answers: pageAnswers,
      inputs: pageOverrides,
      changed_from_account_data: pageDefaults && pageOverrides ? Object.keys(pageOverrides).filter((k) => pageOverrides[k as keyof Overrides] !== pageDefaults[k as keyof Overrides]) : [],
      top: pageResult.topKey,
    });
    if (s.variant === 'progressive') {
      const ids = [...new Set(pageResult.ranked.flatMap((o) => o.disclosureIds.filter((d) => d !== 'deposit_general' && d !== 'cd_penalty')))];
      if (ids.length) trace('disclosure', `Page: shown on cards: ${ids.map((id) => disclosures.items[id]?.title ?? id).join('; ')}`, { ids, variant: 'progressive', surface: 'page' });
    }
    setPage({ shown: true });
  };
  const setOverrides = (patch: Partial<Overrides>) => pageOverrides && setPage({ overrides: { ...pageOverrides, ...patch } });
  const resetPageInputs = () => {
    trace('action', 'Page: reset inputs to account data');
    setPage({ answers: null, overrides: null });
  };
  const restartPage = () => dispatch({ type: 'resetPage' });

  const pageFlow: Flow = {
    id: 'page',
    derived: pageDerived,
    answers: pageAnswers,
    result: pageResult,
    canChoose: !page.action && !page.confirmation,
    locked: !!page.action || !!page.confirmation,
    explanations: page.explanations,
    explaining: page.explaining,
    action: page.action,
    selectedOption: pageSelected,
    updateAnswers: (patch) => pageAnswers && setPage({ answers: { ...pageAnswers, ...patch } }),
    choose: (productId) => {
      const o = pageResult?.ranked.find((x) => x.productId === productId);
      if (!o) return;
      const steps = actionSteps(o);
      trace('action', `Page: chose ${o.shortName} (rank ${o.rank})`, { productId, steps });
      setPage({ action: { productId, steps, index: 0, finalAccepted: false, agreementsAccepted: false } });
    },
    actionPatch: (patch) => page.action && setPage({ action: { ...page.action, ...patch } }),
    actionBack: () => page.action && page.action.index > 0 && setPage({ action: { ...page.action, index: page.action.index - 1 } }),
    cancelAction: () => {
      trace('action', 'Page: cancelled action flow');
      setPage({ action: null });
    },
    actionNext: () => {
      const a = page.action;
      const o = pageSelected;
      if (!a || !o || !persona || !pageDerived || !pageAnswers) return;
      const step = a.steps[a.index];
      if (step === 'open_2') trace('action', 'Page: simulated opening Self-Directed Investing account');
      if (step === 'final_disclosure') trace('disclosure', 'Page: accepted final disclosure before order', { ids: [...o.disclosureIds, 'order_final'], surface: 'page', accepted_at: now() });
      if (step !== 'confirm') {
        if (a.steps[a.index + 1] === 'final_disclosure') trace('disclosure', 'Page: shown final disclosure before order', { ids: [...o.disclosureIds, 'order_final'], surface: 'page' });
        setPage({ action: { ...a, index: a.index + 1 } });
        return;
      }
      const holding = buildHolding(o, pageAnswers, pageDerived);
      dispatch({ type: 'addHolding', personaId: persona.id, holding });
      trace('action', `Page: simulated order placed: ${money(holding.amount)} into ${o.shortName}${holding.monthly ? ` + ${money(holding.monthly)}/month redirected` : ''}`, { ...holding });
      setPage({ action: null, confirmation: holding });
    },
  };

  const pageRankedKey =
    pageResult && page.consented && page.shown ? 'page' + JSON.stringify(pageResult.ranked.map((o) => [o.productId, o.annualDollars, o.rank])) + s.mode + s.model : '';
  useEffect(() => {
    if (!pageRankedKey || !pageResult) return;
    let cancelled = false;
    const settings = { mode: s.mode, apiKey: s.apiKey, model: s.model };
    const t = setTimeout(
      async () => {
        if (s.mode === 'model') setPage({ explaining: true });
        const { texts, log, fallback } = await explainAll(pageResult.ranked, settings);
        if (cancelled) return;
        if (log) trace('model', `Page: explanation call ${log.ok ? 'ok' : 'failed'} (${log.ms} ms)`, { ...log });
        if (fallback) trace('model', `Page: ${fallback}`);
        setPage({ explanations: texts, explaining: false });
      },
      s.mode === 'model' ? 600 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pageRankedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatFlow: Flow = {
    id: 'chat',
    derived,
    answers: s.answers,
    result,
    canChoose: s.stage === 'recommend',
    locked: s.stage === 'action' || s.stage === 'done',
    explanations: s.explanations,
    explaining: s.explaining,
    action: s.action,
    selectedOption,
    updateAnswers,
    choose,
    actionNext,
    actionBack,
    actionPatch,
    cancelAction,
  };

  const value: Ctx = {
    s,
    set,
    persona,
    derived,
    result,
    nudges,
    activeNudge,
    accounts,
    selectPersona,
    resetChat,
    resetAll,
    sendMessage,
    acceptNudge,
    dismissNudge,
    forceNudge,
    showGeneralThenRank,
    acceptConsent,
    declineConsent,
    updateAnswers,
    choose,
    actionPatch,
    actionNext,
    actionBack,
    cancelAction,
    selectedOption,
    chatFlow,
    pageFlow,
    page,
    pageOverrides,
    pageDefaults,
    openView,
    pageConsent,
    pageDecline,
    pageShow,
    setOverrides,
    resetPageInputs,
    restartPage,
  };
  return <AdvisorCtx.Provider value={value}>{children}</AdvisorCtx.Provider>;
}
