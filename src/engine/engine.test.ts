import { describe, expect, it } from 'vitest';
import { catalog, config, personaById, personas, taxTables } from '../data';
import { afterTaxYield, defaultAnswers, deriveFigures, evaluateNudges, primaryNudge, rank } from '.';

function run(id: string, override: Partial<ReturnType<typeof defaultAnswers>> = {}) {
  const p = personaById(id);
  const d = deriveFigures(p, config, taxTables);
  const a = { ...defaultAnswers(p, d), ...override };
  const r = rank(p, d, a, catalog, config);
  const nudges = evaluateNudges(p, d, r.gates, config);
  return { p, d, a, r, nudges, nudge: primaryNudge(nudges, config, new Set()) };
}

describe('personas produce the expected, distinct top results', () => {
  const expected: Record<string, string> = {
    priya: 'mmf_treasury:lump',
    devon: 'mmf_prime:lump',
    elena: 'tbill:lump',
    jordan: 'gate:card_debt',
    sam: 'mmf_treasury:recurring',
  };
  for (const [id, key] of Object.entries(expected)) {
    it(`${id} → ${key}`, () => {
      const { r, d, a } = run(id);
      expect(r.topKey, JSON.stringify({ d, a, ranked: r.ranked.map((o) => [o.productId, o.afterTaxYield]) })).toBe(key);
    });
  }
  it('all five top results differ', () => {
    const keys = personas.map((p) => run(p.id).r.topKey);
    expect(new Set(keys).size).toBe(5);
  });
});

describe('gates', () => {
  it('Jordan gets the debt gate and no product cards', () => {
    const { r } = run('jordan');
    expect(r.gate?.id).toBe('card_debt');
    expect(r.ranked).toHaveLength(0);
    expect(Number(r.gate!.values.saved_per_1000_paid_down)).toBeGreaterThan(Number(r.gate!.values.earned_per_1000_in_best_option));
  });
});

describe('nudges', () => {
  it('Elena sees the large-deposit nudge', () => expect(run('elena').nudge?.id).toBe('large_deposit'));
  it('Sam sees the money-leaving nudge', () => expect(run('sam').nudge?.id).toBe('money_leaving'));
  it('Jordan sees none', () => expect(run('jordan').nudge).toBeNull());
});

describe('ranking mechanics', () => {
  it('matches the spec worked example formula', () => {
    const rates = { federal: 0.24, state: 0.1, local: 0, stateLocal: 0.1, stateName: 'X' };
    expect(afterTaxYield(3.4, rates, 1)).toBeCloseTo(2.584, 3);
    expect(afterTaxYield(3.54, rates, 0)).toBeCloseTo(2.336, 3);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(run('priya').r)).toBe(JSON.stringify(run('priya').r));
  });
  it('anytime drops locking products; a date admits them', () => {
    const anytime = run('elena', { timing: 'anytime' }).r.ranked.map((o) => o.productId);
    expect(anytime).not.toContain('tbill');
    expect(anytime).not.toContain('chase_cd');
    const dated = run('elena').r.ranked;
    const bill = dated.find((o) => o.productId === 'tbill')!;
    expect(bill.maturityDate! <= '2027-08-14').toBe(true);
  });
  it('changing the amount below the Premium Deposit minimum drops it', () => {
    expect(run('elena').r.ranked.some((o) => o.productId === 'premium_deposit')).toBe(true);
    expect(run('elena', { amount: 20000 }).r.ranked.some((o) => o.productId === 'premium_deposit')).toBe(false);
  });
  it('Devon needs to open a brokerage account for the top option', () => {
    const top = run('devon').r.ranked[0];
    expect(top.needsAccountOpening).toBe(true);
  });
  it('every ranked persona has benchmark rows with a dollar difference', () => {
    for (const id of ['priya', 'devon', 'elena', 'sam']) {
      const { r } = run(id);
      expect(r.benchmarks).toHaveLength(2);
      for (const b of r.benchmarks) expect(Number.isFinite(b.differenceVsTop)).toBe(true);
    }
  });
});
