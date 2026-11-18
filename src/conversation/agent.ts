// Conversation layer entry points. The model does two things only: classify intent and write
// card explanations. Everything else is template text filled from the rules engine.
import type { RankedOption } from '../engine/types';
import { detectIntentKeywords, INTENT_SYSTEM_PROMPT, parseModelIntent, type Intent } from './intent';
import { cardFactsForModel, EXPLAIN_SYSTEM_PROMPT, templateExplanation } from './explain';
import { checkNumbers } from './guard';
import { chat, type ModelCallLog } from './openrouter';
import { config } from '../data';

export type Mode = 'scripted' | 'model';
export interface ModelSettings {
  mode: Mode;
  apiKey: string;
  model: string;
}

export interface Explained {
  text: string;
  source: 'template' | 'model';
  note?: string;
}

export async function classify(text: string, s: ModelSettings): Promise<{ intent: Intent; log?: ModelCallLog; fallback?: string }> {
  const kw = detectIntentKeywords(text);
  if (s.mode === 'scripted') return { intent: kw };
  if (!s.apiKey) return { intent: kw, fallback: 'No OpenRouter key; used keywords' };
  try {
    const { text: out, log } = await chat(s.apiKey, s.model, INTENT_SYSTEM_PROMPT, text, 'intent');
    const parsed = parseModelIntent(out);
    if (!parsed) return { intent: kw, log, fallback: 'Unparseable model reply; used keywords' };
    return { intent: parsed, log };
  } catch (e) {
    return { intent: kw, log: (e as { log?: ModelCallLog }).log, fallback: `Model call failed (${(e as Error).message}); used keywords` };
  }
}

/**
 * Reads {"explanations": {id: text}} from a model reply. Tolerates code fences and surrounding prose,
 * and salvages complete entries from a reply that was cut off mid-object.
 */
export function parseExplanations(raw: string, ids: string[]): Record<string, string> | null {
  const body = raw.replace(/```(?:json)?/gi, '');
  const m = body.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const obj = (j.explanations ?? j) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const id of ids) if (typeof obj[id] === 'string') out[id] = obj[id] as string;
      if (Object.keys(out).length) return out;
    } catch {
      /* fall through to salvage */
    }
  }
  const out: Record<string, string> = {};
  for (const id of ids) {
    const hit = body.match(new RegExp(`"${id}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (hit) {
      try {
        out[id] = JSON.parse(`"${hit[1]}"`);
      } catch {
        out[id] = hit[1];
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function explainAll(
  ranked: RankedOption[],
  s: ModelSettings,
): Promise<{ texts: Record<string, Explained>; log?: ModelCallLog; fallback?: string }> {
  const templates: Record<string, Explained> = {};
  for (const o of ranked) templates[o.productId] = { text: templateExplanation(o), source: 'template' };
  if (s.mode === 'scripted' || !ranked.length) return { texts: templates };
  if (!s.apiKey) return { texts: templates, fallback: 'No OpenRouter key; used templates' };

  const input = ranked.map(cardFactsForModel);
  try {
    const { text, log } = await chat(
      s.apiKey,
      s.model,
      EXPLAIN_SYSTEM_PROMPT,
      JSON.stringify({ cards: input }),
      'explanations',
      config.model.explanation_max_tokens,
    );
    const parsed = parseExplanations(text, input.map((c) => c.productId));
    if (!parsed) {
      return {
        texts: templates,
        log,
        fallback: `Unparseable model reply (finish_reason: ${log.finish ?? 'unknown'}); used templates. Reply began: ${text.slice(0, 160)}`,
      };
    }
    const out: Record<string, Explained> = {};
    const rejected: string[] = [];
    for (const card of input) {
      const t = (parsed[card.productId] ?? '').trim();
      const check = checkNumbers(t, card);
      if (!t || t.length > config.model.max_explanation_chars || !check.ok) {
        out[card.productId] = {
          ...templates[card.productId],
          note: !t ? 'Model gave no text' : !check.ok ? `Model added numbers not in its input (${check.unknown.join(', ')})` : 'Model text too long',
        };
        rejected.push(card.productId);
      } else {
        out[card.productId] = { text: t, source: 'model' };
      }
    }
    return { texts: out, log, fallback: rejected.length ? `Template used for ${rejected.join(', ')}` : undefined };
  } catch (e) {
    return { texts: templates, log: (e as { log?: ModelCallLog }).log, fallback: `Model call failed (${(e as Error).message}); used templates` };
  }
}
