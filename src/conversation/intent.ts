// Yield-intent detection. Scripted mode uses keywords; model mode asks the model and falls back here.
export type IntentKind = 'hysa' | 'rate' | 'placement' | 'product' | 'general';
export interface Intent {
  isYield: boolean;
  kind: IntentKind | null;
  source: 'keywords' | 'model';
  matched?: string;
}

const RULES: { kind: IntentKind; patterns: RegExp[] }[] = [
  { kind: 'hysa', patterns: [/high[\s-]*yield/i, /\bhysa\b/i, /better (savings|rate)/i] },
  { kind: 'placement', patterns: [/where should i (put|keep|park)/i, /what (should|do) i do with/i, /\bbonus\b/i, /tax refund/i, /extra (cash|money)/i, /idle (cash|money)/i, /(put|park) (my )?(cash|money|savings)/i, /earn more/i] },
  { kind: 'product', patterns: [/\bcds?\b/i, /certificate of deposit/i, /money market/i, /t[\s-]?bills?/i, /treasur(y|ies)/i, /premium deposit/i] },
  { kind: 'rate', patterns: [/savings rate/i, /interest rate/i, /\bapy\b/i, /\byield\b/i, /how much interest/i, /what.*(pay|earn).*savings/i] },
  { kind: 'general', patterns: [/\bsavings?\b/i, /\binterest\b/i, /\bgrow my (money|cash)\b/i] },
];

export function detectIntentKeywords(text: string): Intent {
  for (const r of RULES) {
    for (const p of r.patterns) {
      const m = text.match(p);
      if (m) return { isYield: true, kind: r.kind, source: 'keywords', matched: m[0] };
    }
  }
  return { isYield: false, kind: null, source: 'keywords' };
}

export const INTENT_SYSTEM_PROMPT = `You classify one chat message sent to a retail bank's assistant.
Decide whether the customer is asking about earning more on cash: savings rates, high-yield savings, CDs, money market funds, Treasury bills, or where to put idle cash, a bonus or a tax refund.
Reply with JSON only, no prose: {"is_yield": true|false, "kind": "hysa"|"rate"|"placement"|"product"|"general"|null}
- hysa: asks for a high-yield savings account
- rate: asks what a savings/interest rate is
- placement: asks where to put money
- product: asks about a specific product (CD, money market fund, T-bill)
- general: other yield-related question
Use null kind when is_yield is false.`;

export function parseModelIntent(raw: string): Intent | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j.is_yield !== 'boolean') return null;
    const kinds: IntentKind[] = ['hysa', 'rate', 'placement', 'product', 'general'];
    const kind = kinds.includes(j.kind) ? (j.kind as IntentKind) : j.is_yield ? 'general' : null;
    return { isYield: j.is_yield, kind, source: 'model' };
  } catch {
    return null;
  }
}
