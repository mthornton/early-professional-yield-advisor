// The model may not add numbers that are not in its input. Any figure in its text that isn't
// in the allowed set causes the template text to be used instead.

function normalize(s: string): string {
  return s.replace(/[$,%]/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(\.\d+)?/g) ?? []).map(normalize);
}

function collect(v: unknown, out: Set<string>) {
  if (typeof v === 'number') {
    out.add(normalize(String(v)));
    out.add(normalize(v.toFixed(2)));
    out.add(normalize(Math.round(v).toString()));
  } else if (typeof v === 'string') {
    for (const n of numbersIn(v)) out.add(n);
    // dates like 2027-05-17 also allow the day and year as written in prose
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      out.add(String(Number(m[1])));
      out.add(String(Number(m[3])));
    }
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collect(x, out));
}

export function allowedNumbers(input: unknown): Set<string> {
  const s = new Set<string>(['1', '2']); // "one or two", "1 step" style counting is harmless
  collect(input, s);
  return s;
}

export function checkNumbers(text: string, input: unknown): { ok: boolean; unknown: string[] } {
  const allowed = allowedNumbers(input);
  const unknown = numbersIn(text).filter((n) => !allowed.has(n));
  return { ok: unknown.length === 0, unknown };
}
