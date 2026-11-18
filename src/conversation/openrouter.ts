// Minimal OpenRouter chat-completions client. Called from the browser; the key lives only in memory
// (or comes from VITE_OPENROUTER_API_KEY in an uncommitted .env.local).
import { config } from '../data';

export interface ModelCallLog {
  model: string;
  purpose: string;
  ms: number;
  ok: boolean;
  error?: string;
  finish?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function chat(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  purpose: string,
  maxTokens = 400,
  prior: ChatTurn[] = [],
): Promise<{ text: string; log: ModelCallLog }> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.model.timeout_ms);
  try {
    const res = await fetch(config.model.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Yield Advisor POC',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          ...prior,
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const text: string = j.choices?.[0]?.message?.content ?? '';
    const finish: string | undefined = j.choices?.[0]?.finish_reason;
    if (!text) throw new Error(`Empty response (finish_reason: ${finish})`);
    return { text, log: { model, purpose, ms: Math.round(performance.now() - started), ok: true, finish } };
  } catch (e) {
    const error = e instanceof Error ? (e.name === 'AbortError' ? 'Timed out' : e.message) : String(e);
    throw Object.assign(new Error(error), {
      log: { model, purpose, ms: Math.round(performance.now() - started), ok: false, error } as ModelCallLog,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const envKey: string = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ?? '';
