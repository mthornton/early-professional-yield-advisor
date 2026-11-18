// Generates the five simulated persona JSON files in src/data/personas/.
// Deterministic: a fixed seed per persona, so every run gives identical data.
// Run: npm run gen:personas
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'personas');
mkdirSync(OUT, { recursive: true });

const START = new Date('2026-05-17T12:00:00Z');
const END = new Date('2026-11-15T12:00:00Z'); // demo date is 2026-11-16

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const round2 = (n) => Math.round(n * 100) / 100;

function eachDay(fn) {
  for (let d = new Date(START); d <= END; d = addDays(d, 1)) fn(d);
}
function monthlyOn(day, fn) {
  eachDay((d) => {
    if (d.getUTCDate() === day) fn(d);
  });
}
function biweeklyFridays(lastPayday) {
  const out = [];
  for (let d = new Date(lastPayday); d >= START; d = addDays(d, -14)) out.push(new Date(d));
  return out.reverse();
}

const EVERYDAY_MERCHANTS = [
  'GROCERY MARKET', 'PHARMACY', 'COFFEE SHOP', 'RESTAURANT', 'RIDESHARE', 'HARDWARE STORE',
  'GAS STATION', 'BOOKSTORE', 'DELI', 'CLOTHING STORE', 'ONLINE RETAIL', 'GYM DAY PASS',
];

function buildPersona(spec) {
  const rnd = mulberry32(spec.seed);
  const tx = [];
  const add = (date, description, amount, category, account_id = 'chk') =>
    tx.push({ date: iso(date), account_id, description, amount: round2(amount), category });

  // Payroll every two weeks, last one on Friday 2026-11-13.
  for (const d of biweeklyFridays(new Date(`${spec.lastPayday ?? '2026-11-13'}T12:00:00Z`))) {
    add(d, `PAYROLL DIRECT DEP ${spec.employer}`, spec.netPaycheck, 'payroll');
  }
  monthlyOn(1, (d) => add(d, spec.housing.desc, -spec.housing.amount, 'housing'));
  monthlyOn(20, (d) => {
    const amt = spec.cardPayment * (0.85 + rnd() * 0.3);
    add(d, `${spec.cardName} AUTOPAY`, -amt, 'card_payment');
  });
  for (const bill of spec.bills) {
    monthlyOn(bill.day, (d) => {
      const amt = bill.vary ? bill.amount * (0.8 + rnd() * 0.4) : bill.amount;
      add(d, bill.desc, -amt, bill.category ?? 'bill');
    });
  }
  // Everyday debit spending: a few purchases a week summing to roughly the monthly target.
  eachDay((d) => {
    if (rnd() < 0.5) {
      const amt = (spec.everydayMonthly / 15) * (0.4 + rnd() * 1.2);
      const m = EVERYDAY_MERCHANTS[Math.floor(rnd() * EVERYDAY_MERCHANTS.length)];
      add(d, `DEBIT CARD PURCHASE ${m}`, -amt, 'everyday');
    }
  });
  for (const t of spec.monthlyTransfers ?? []) {
    monthlyOn(t.day, (d) => add(d, t.desc, -t.amount, t.category));
    if (t.toAccount) monthlyOn(t.day, (d) => add(d, t.inDesc, t.amount, 'transfer_internal', t.toAccount));
  }
  for (const e of spec.events ?? []) add(new Date(`${e.date}T12:00:00Z`), e.desc, e.amount, e.category, e.account_id);
  for (const e of spec.cardEvents ?? []) {
    monthlyOn(e.day, (d) => add(d, e.desc, e.amount, e.category, e.account_id));
  }

  tx.sort((a, b) => (a.date === b.date ? a.amount - b.amount : a.date < b.date ? -1 : 1));

  // Back-solve opening balances so each account ends at its target balance.
  const accounts = spec.accounts.map((a) => ({ ...a }));
  for (const a of accounts) {
    if (a.type === 'credit_card' || a.type === 'brokerage') continue;
    const net = tx.filter((t) => t.account_id === a.id).reduce((s, t) => s + t.amount, 0);
    a.opening_balance = round2(a.balance - net);
    let running = a.opening_balance;
    let min = running;
    for (const t of tx.filter((t) => t.account_id === a.id)) {
      running = round2(running + t.amount);
      t.balance_after = running;
      min = Math.min(min, running);
    }
    if (min < 0) throw new Error(`${spec.id}: ${a.id} goes negative (${min})`);
  }

  return {
    id: spec.id,
    profile: spec.profile,
    accounts,
    has_brokerage: spec.has_brokerage,
    brokerage_holdings: spec.brokerage_holdings ?? [],
    external_links: spec.external_links ?? [],
    demo_answers: spec.demo_answers,
    period: { start: iso(START), end: iso(END) },
    transactions: tx,
  };
}

const personas = [
  {
    id: 'priya',
    seed: 101,
    profile: {
      name: 'Priya', age: 31, city: 'New York', state: 'NY', locality: 'NYC',
      estimated_gross_income: 165000, filing_status: 'single',
      situation: 'High earner in New York City with $48k sitting in checking.',
    },
    employer: 'NORTHWIND ANALYTICS',
    netPaycheck: 4050,
    housing: { desc: 'ZELLE PAYMENT TO LANDLORD RENT', amount: 3600 },
    cardName: 'CHASE CARD', cardPayment: 2000,
    bills: [
      { day: 8, desc: 'CON EDISON UTILITY', amount: 150, vary: true, category: 'utilities' },
      { day: 12, desc: 'STREAMING SERVICE', amount: 23, category: 'subscription' },
      { day: 15, desc: 'MOBILE PHONE CARRIER', amount: 40, category: 'subscription' },
    ],
    everydayMonthly: 900,
    monthlyTransfers: [
      { day: 3, desc: 'TRANSFER TO J.P. MORGAN SELF-DIRECTED INVESTING', amount: 1000, category: 'transfer_brokerage_internal' },
    ],
    accounts: [
      { id: 'chk', type: 'checking', name: 'Chase Total Checking', balance: 48000 },
      { id: 'card', type: 'credit_card', name: 'Chase Freedom Unlimited', balance: 1840, revolving_balance: 0, apr: 0.2049 },
      { id: 'sdi', type: 'brokerage', name: 'Self-Directed Investing', balance: 22000 },
    ],
    has_brokerage: true,
    brokerage_holdings: [
      { symbol: 'VTI', name: 'Total U.S. stock market ETF', value: 15400 },
      { symbol: 'VXUS', name: 'Total international stock ETF', value: 6600 },
    ],
    demo_answers: { timing: 'anytime' },
  },
  {
    id: 'devon',
    seed: 202,
    profile: {
      name: 'Devon', age: 27, city: 'Austin', state: 'TX',
      estimated_gross_income: 95000, filing_status: 'single',
      situation: 'Saving steadily in Chase Savings at 0.01%. No brokerage account.',
    },
    employer: 'LONGHORN LOGISTICS',
    netPaycheck: 2700,
    housing: { desc: 'APARTMENT RENT ACH', amount: 1650 },
    cardName: 'CHASE CARD', cardPayment: 1400,
    bills: [
      { day: 5, desc: 'AUTO LOAN PAYMENT', amount: 420, category: 'loan' },
      { day: 9, desc: 'AUSTIN ENERGY UTILITY', amount: 180, vary: true, category: 'utilities' },
      { day: 14, desc: 'MUSIC STREAMING', amount: 12, category: 'subscription' },
      { day: 17, desc: 'MOBILE PHONE CARRIER', amount: 33, category: 'subscription' },
    ],
    everydayMonthly: 700,
    monthlyTransfers: [
      { day: 2, desc: 'TRANSFER TO CHASE SAVINGS', amount: 300, category: 'transfer_internal', toAccount: 'sav', inDesc: 'TRANSFER FROM CHASE CHECKING' },
    ],
    accounts: [
      { id: 'chk', type: 'checking', name: 'Chase Total Checking', balance: 14000 },
      { id: 'sav', type: 'savings', name: 'Chase Savings', balance: 6000 },
      { id: 'card', type: 'credit_card', name: 'Chase Freedom Flex', balance: 1260, revolving_balance: 0, apr: 0.2149 },
    ],
    has_brokerage: false,
    demo_answers: { timing: 'anytime' },
  },
  {
    id: 'elena',
    seed: 303,
    profile: {
      name: 'Elena', age: 36, city: 'Columbus', state: 'OH',
      estimated_gross_income: 140000, filing_status: 'single',
      situation: 'A $60,000 bonus just landed. Buying a house in about nine months.',
    },
    employer: 'BUCKEYE HEALTH SYSTEMS',
    netPaycheck: 3660,
    housing: { desc: 'APARTMENT RENT ACH', amount: 2100 },
    cardName: 'CHASE CARD', cardPayment: 2300,
    bills: [
      { day: 6, desc: 'AUTO LOAN PAYMENT', amount: 450, category: 'loan' },
      { day: 10, desc: 'AEP OHIO UTILITY', amount: 200, vary: true, category: 'utilities' },
      { day: 13, desc: 'STREAMING SERVICE', amount: 23, category: 'subscription' },
      { day: 16, desc: 'MOBILE PHONE CARRIER', amount: 47, category: 'subscription' },
    ],
    everydayMonthly: 800,
    events: [
      { date: '2026-11-13', desc: 'PAYROLL DIRECT DEP BUCKEYE HEALTH SYSTEMS ANNUAL BONUS', amount: 60000, category: 'bonus', account_id: 'chk' },
    ],
    accounts: [
      { id: 'chk', type: 'checking', name: 'Chase Total Checking', balance: 82000 },
      { id: 'card', type: 'credit_card', name: 'Chase Sapphire Preferred', balance: 2140, revolving_balance: 0, apr: 0.2149 },
    ],
    has_brokerage: false,
    demo_answers: { timing: 'date', date: '2027-08-14', note: 'House closing' },
  },
  {
    id: 'jordan',
    seed: 404,
    profile: {
      name: 'Jordan', age: 34, city: 'Chicago', state: 'IL',
      estimated_gross_income: 210000, filing_status: 'single',
      situation: 'Strong income, but carrying $11,000 on a Sapphire card.',
    },
    employer: 'LAKESHORE CAPITAL PARTNERS',
    netPaycheck: 5170,
    housing: { desc: 'CONDO RENT ACH', amount: 3200 },
    cardName: 'CHASE SAPPHIRE', cardPayment: 4500, lastPayday: '2026-11-06',
    bills: [
      { day: 4, desc: 'STUDENT LOAN SERVICER', amount: 650, category: 'loan' },
      { day: 7, desc: 'AUTO LEASE PAYMENT', amount: 700, category: 'loan' },
      { day: 11, desc: 'COMED UTILITY', amount: 220, vary: true, category: 'utilities' },
      { day: 14, desc: 'STREAMING SERVICES BUNDLE', amount: 45, category: 'subscription' },
      { day: 18, desc: 'FITNESS CLUB MEMBERSHIP', amount: 75, category: 'subscription' },
      { day: 25, desc: 'TRAVEL BOOKING', amount: 900, vary: true, category: 'everyday' },
    ],
    everydayMonthly: 1500,
    cardEvents: [
      { day: 22, desc: 'INTEREST CHARGE ON PURCHASES', amount: -225, category: 'interest_charge', account_id: 'card' },
    ],
    accounts: [
      { id: 'chk', type: 'checking', name: 'Chase Total Checking', balance: 4000 },
      { id: 'card', type: 'credit_card', name: 'Chase Sapphire Reserve', balance: 11000, revolving_balance: 11000, apr: 0.2449 },
    ],
    has_brokerage: false,
    demo_answers: { timing: 'anytime' },
  },
  {
    id: 'sam',
    seed: 505,
    profile: {
      name: 'Sam', age: 29, city: 'San Francisco', state: 'CA',
      estimated_gross_income: 130000, filing_status: 'single',
      situation: 'Sends $2,000 a month to an outside savings account. Has an unused Self-Directed Investing account.',
    },
    employer: 'BAYVIEW SOFTWARE',
    netPaycheck: 3300,
    housing: { desc: 'APARTMENT RENT ACH', amount: 2800 },
    cardName: 'CHASE CARD', cardPayment: 1300,
    bills: [
      { day: 9, desc: 'PG&E UTILITY', amount: 150, vary: true, category: 'utilities' },
      { day: 15, desc: 'STREAMING SERVICE', amount: 18, category: 'subscription' },
      { day: 19, desc: 'MOBILE PHONE CARRIER', amount: 32, category: 'subscription' },
    ],
    everydayMonthly: 600,
    monthlyTransfers: [
      { day: 2, desc: 'ONLINE TRANSFER TO ALLY BANK SAVINGS XXXX4417', amount: 2000, category: 'transfer_outside' },
    ],
    accounts: [
      { id: 'chk', type: 'checking', name: 'Chase Total Checking', balance: 9000 },
      { id: 'card', type: 'credit_card', name: 'Chase Freedom Unlimited', balance: 980, revolving_balance: 0, apr: 0.2049 },
      { id: 'sdi', type: 'brokerage', name: 'Self-Directed Investing', balance: 0 },
    ],
    has_brokerage: true,
    external_links: [{ institution: 'ALLY BANK', type: 'savings', rate_category: 'bench_top_online' }],
    demo_answers: { timing: 'anytime', redirect_recurring: true },
  },
];

for (const p of personas) {
  const data = buildPersona(p);
  writeFileSync(join(OUT, `${p.id}.json`), JSON.stringify(data, null, 2) + '\n');
  const chk = data.accounts.find((a) => a.id === 'chk');
  console.log(`${p.id}: ${data.transactions.length} transactions, checking opening ${chk.opening_balance} -> ${chk.balance}`);
}
