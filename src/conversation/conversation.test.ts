import { describe, expect, it } from 'vitest';
import { detectIntentKeywords } from './intent';
import { literalAnswer, templateExplanation } from './explain';
import { checkNumbers } from './guard';
import { parseExplanations } from './agent';
import { catalog, config, personaById, taxTables } from '../data';
import { defaultAnswers, deriveFigures, rank } from '../engine';

describe('intent keywords', () => {
  it.each([
    ['do you have a high yield savings account', 'hysa'],
    ['where should I put my bonus', 'placement'],
    ["what's your savings rate", 'rate'],
    ['what are your CD rates', 'product'],
  ])('%s → %s', (text, kind) => {
    const i = detectIntentKeywords(text);
    expect(i.isYield).toBe(true);
    expect(i.kind).toBe(kind);
  });
  it('ignores unrelated messages', () => expect(detectIntentKeywords('how do I order checks').isYield).toBe(false));
});

describe('literal answer', () => {
  it('states the Chase Savings rate plainly for an HYSA question', () => {
    const t = literalAnswer('hysa', catalog);
    expect(t).toContain('Chase Savings pays 0.01% APY');
    expect(t).toMatch(/isn't a high-yield/);
  });
});

describe('model reply parsing', () => {
  it('reads fenced JSON', () => {
    expect(parseExplanations('```json\n{"explanations":{"a":"x","b":"y"}}\n```', ['a', 'b'])).toEqual({ a: 'x', b: 'y' });
  });
  it('salvages complete entries from a truncated reply', () => {
    expect(parseExplanations('{"explanations":{"a":"first \\"one\\"","b":"cut off he', ['a', 'b'])).toEqual({ a: 'first "one"' });
  });
  it('returns null when nothing usable', () => expect(parseExplanations('Sorry, I cannot help.', ['a'])).toBeNull());
});

describe('templates and guard', () => {
  it('every ranked card gets a non-empty template explanation', () => {
    for (const id of ['priya', 'devon', 'elena', 'sam']) {
      const p = personaById(id);
      const d = deriveFigures(p, config, taxTables);
      const r = rank(p, d, defaultAnswers(p, d), catalog, config);
      for (const o of r.ranked) expect(templateExplanation(o).length).toBeGreaterThan(10);
    }
  });
  it('rejects invented numbers and accepts input numbers', () => {
    const input = { dollars_per_year: 986, facts: [{ state_rate_pct: 9.88 }] };
    expect(checkNumbers('About $986 a year, at your 9.88% rate.', input).ok).toBe(true);
    expect(checkNumbers('About $1,050 a year.', input).ok).toBe(false);
  });
});

describe('open-answer context', () => {
  it('carries accounts, transactions, catalog and, after consent, the ranking', async () => {
    const { buildAnswerContext } = await import('./answer');
    const p = personaById('sam');
    const d = deriveFigures(p, config, taxTables);
    const answers = defaultAnswers(p, d);
    const result = rank(p, d, answers, catalog, config);
    const base = { persona: p, accounts: p.accounts, derived: d, holdings: [], catalog };
    const before = buildAnswerContext({ ...base, answers: null, result: null, consented: false });
    expect(before.transactions_last_6_months.length).toBe(p.transactions.length);
    expect(before.chase_products.length).toBe(catalog.products.length);
    expect(before.ranking).toBeNull();
    const after = buildAnswerContext({ ...base, answers, result, consented: true });
    expect(after.ranking!.options_in_rank_order[0].productId).toBe('mmf_treasury');
  });
});
