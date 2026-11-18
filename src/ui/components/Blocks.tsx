import { useState } from 'react';
import { catalog, config, disclosures } from '../../data';
import type { BillTerm, CdTerm } from '../../engine/types';
import { addMonths, addDaysIso } from '../../engine';
import { asOf, money, pct } from '../../conversation/format';
import { gateText, profileSummary } from '../../conversation/explain';
import { useAdvisor } from '../AdvisorContext';
import { useFlow } from '../flow';
import type { Block } from '../store';
import { Recommendations } from './Recommendations';
import { ActionFlow, Confirmation } from './ActionFlow';

export function PlaceholderTag() {
  return <span className="placeholder-tag">{disclosures.placeholder_label}</span>;
}

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'user':
      return (
        <div className="msg user">
          <div className="bubble">{block.text}</div>
        </div>
      );
    case 'agent_text':
    case 'literal':
      return (
        <div className="msg agent">
          <div className="bubble">
            {block.text}
            {block.data?.source === 'model' && (
              <div className="answer-meta">
                <span className="src-tag model">model answer</span>
                {typeof block.data.note === 'string' && <span title={block.data.note}>{block.data.note}</span>}
              </div>
            )}
          </div>
        </div>
      );
    case 'general_options':
      return <GeneralOptions />;
    case 'consent_upfront':
      return <ConsentUpfront />;
    case 'consent_progressive':
      return <ConsentProgressive lead={block.text} />;
    case 'profile':
      return <ProfileRead />;
    case 'gate':
      return <GateMessage />;
    case 'questions':
      return <Questions />;
    case 'recommendations':
      return <Recommendations />;
    case 'action':
      return <ActionFlow />;
    case 'confirmation':
      return <Confirmation block={block} />;
  }
}

function GeneralOptions() {
  const { showGeneralThenRank, s } = useAdvisor();
  const rows = catalog.products.map((p) => {
    let rate: string;
    if (p.id === 'chase_cd') {
      const best = (p.terms as CdTerm[]).reduce((a, b) => (b.tiers[0].apy > a.tiers[0].apy ? b : a));
      rate = `Up to ${pct(best.tiers[0].apy)} APY (${best.months}-month)`;
    } else if (p.id === 'tbill') {
      const t = p.terms as BillTerm[];
      rate = `${pct(t[0].yield)}–${pct(t[t.length - 1].yield)} (4 to 52 weeks)`;
    } else rate = `${pct(p.yield!)} ${p.yield_basis}`;
    return { p, rate };
  });
  return (
    <div className="msg agent wide">
      <div className="panel">
        <div className="panel-title">Chase cash options (general, not personalized)</div>
        <ul className="general-list">
          {rows.map(({ p, rate }) => (
            <li key={p.id}>
              <div className="row between">
                <strong>{p.short_name}</strong>
                <span>{rate}</span>
              </div>
              <div className="tiny muted">
                {asOf(p.as_of)} · {p.insured === 'FDIC' ? 'FDIC-insured' : p.insured === 'us_government' ? 'Backed by the U.S. government' : 'Investment, not FDIC-insured'} ·{' '}
                {p.needs_brokerage ? 'Needs Self-Directed Investing' : 'No new account type'}
              </div>
            </li>
          ))}
        </ul>
        {!s.consented && s.stage !== 'consent' && (
          <button className="btn btn-primary" onClick={showGeneralThenRank}>
            Rank these for me
          </button>
        )}
      </div>
    </div>
  );
}

function ConsentUpfront() {
  const { acceptConsent, declineConsent, s } = useAdvisor();
  const [checked, setChecked] = useState(false);
  const active = s.stage === 'consent';
  return (
    <div className="msg agent wide">
      <div className="panel disclosure-panel">
        <div className="panel-title">Before I personalize anything</div>
        <PlaceholderTag />
        {['data_consent', 'investments_not_deposits', 'advice_basis'].map((id) => (
          <div key={id} className="disclosure-item">
            <strong>{disclosures.items[id].title}.</strong> {disclosures.items[id].short}
          </div>
        ))}
        <div className="doc-links">
          {disclosures.documents.map((d) => (
            <a key={d.label} href={d.href} onClick={(e) => e.preventDefault()}>
              {d.label}
            </a>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={checked || !active} disabled={!active} onChange={(e) => setChecked(e.target.checked)} />
          I agree to let Chase use my account data to rank options, and I understand some options are investments, not deposits.
        </label>
        {active && (
          <div className="row gap">
            <button className="btn btn-primary" disabled={!checked} onClick={acceptConsent}>
              Continue
            </button>
            <button className="btn btn-secondary" onClick={declineConsent}>
              No thanks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentProgressive({ lead }: { lead?: string }) {
  const { acceptConsent, declineConsent, s } = useAdvisor();
  const active = s.stage === 'consent';
  return (
    <div className="msg agent">
      <div className="bubble">
        {lead && <p>{lead}</p>}
        <p>{disclosures.items.data_consent.short}</p>
        <PlaceholderTag />
        {active ? (
          <div className="row gap mt">
            <button className="btn btn-primary" onClick={acceptConsent}>
              Agree and rank
            </button>
            <button className="btn btn-secondary" onClick={declineConsent}>
              Not now
            </button>
          </div>
        ) : (
          <div className="tiny muted mt">{s.consented ? 'You agreed.' : ''}</div>
        )}
      </div>
    </div>
  );
}

function ProfileRead() {
  const { derived, persona } = useAdvisor();
  if (!derived || !persona) return null;
  return (
    <div className="msg agent wide">
      <div className="panel">
        <div className="panel-title">Here's what I looked at</div>
        <ul className="facts">
          {profileSummary(derived, persona.has_brokerage).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="tiny muted">Tax rates are estimates from your deposits and state, not tax advice.</div>
      </div>
    </div>
  );
}

export function GateMessage({ bare }: { bare?: boolean } = {}) {
  const { result, id } = useFlow();
  if (!result?.gate) return null;
  const g = gateText(result.gate);
  const v = result.gate.values;
  const body = (
      <div className="panel gate">
        <div className="panel-title">{g.headline}</div>
        {g.body.filter((p) => id === 'chat' || !p.endsWith('?')).map((p) => (
          <p key={p}>{p}</p>
        ))}
        {result.gate.id === 'card_debt' && (
          <table className="compare">
            <thead>
              <tr>
                <th>Put $1,000 toward…</th>
                <th>Per year</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Your card balance ({v.card_apr_pct}% APR)</td>
                <td className="pos">Saves {money(Number(v.saved_per_1000_paid_down))}</td>
              </tr>
              <tr>
                <td>Best cash option here ({v.best_available_after_tax_pct}% after tax)</td>
                <td>Earns {money(Number(v.earned_per_1000_in_best_option))}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="disclosure-inline">
          {disclosures.items.debt_gate.short} <PlaceholderTag />
        </div>
      </div>
  );
  return bare ? body : <div className="msg agent wide">{body}</div>;
}

function Questions() {
  const { derived, result, updateAnswers, answers: a, locked } = useFlow();
  if (!a || !derived) return null;
  const minDate = addDaysIso(config.demo_date, 7);
  const maxDate = addMonths(config.demo_date, 12);
  const monthly = derived.recurringOutside.reduce((x, r) => x + r.monthlyAmount, 0);
  return (
    <div className="msg agent wide">
      <div className="panel questions">
        <label className="q">
          <span className="q-label">1. How much do you want to set aside?</span>
          <div className="row gap">
            <span className="prefix">$</span>
            <input
              type="number"
              min={0}
              step={500}
              value={a.amount}
              disabled={locked}
              onChange={(e) => updateAnswers({ amount: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <span className="tiny muted">
            My estimate: {money(derived.movable)}. That's checking{derived.savings ? ' plus Chase Savings' : ''} minus a {money(derived.buffer)} cushion (1.5 months of
            spending), rounded down.
          </span>
        </label>
        <fieldset className="q" disabled={locked}>
          <legend className="q-label">2. When might you need it?</legend>
          <div className="seg">
            {(
              [
                ['anytime', 'Anytime'],
                ['date', 'By a date (within 12 months)'],
                ['over_12', 'More than 12 months'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`seg-opt ${a.timing === k ? 'on' : ''}`}>
                <input type="radio" name="timing" checked={a.timing === k} onChange={() => updateAnswers({ timing: k, date: k === 'date' ? a.date ?? maxDate : a.date })} />
                {label}
              </label>
            ))}
          </div>
          {a.timing === 'date' && (
            <input type="date" min={minDate} max={maxDate} value={a.date ?? ''} onChange={(e) => updateAnswers({ date: e.target.value })} />
          )}
        </fieldset>
        {monthly > 0 && (
          <label className="check">
            <input type="checkbox" checked={a.redirectRecurring} disabled={locked} onChange={(e) => updateAnswers({ redirectRecurring: e.target.checked })} />
            Also show redirecting the {money(monthly)}/month I send to an outside savings account
          </label>
        )}
        {result && !result.gate && result.ranked.length === 0 && <div className="warn">Nothing fits those answers. Try a larger amount or a later date.</div>}
      </div>
    </div>
  );
}
