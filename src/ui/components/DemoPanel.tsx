import { useState } from 'react';
import { config, personas } from '../../data';
import type { NudgeId } from '../../engine/types';
import { longDate, money, pct, ratePct } from '../../conversation/format';
import { useAdvisor } from '../AdvisorContext';

export function DemoPanel() {
  const a = useAdvisor();
  const { s, set } = a;
  const [force, setForce] = useState<NudgeId>('large_deposit');
  const [customModel, setCustomModel] = useState('');
  if (!s.demoOpen) {
    return (
      <button className="demo-tab" onClick={() => set({ demoOpen: true })}>
        Demo controls ▸
      </button>
    );
  }
  return (
    <aside className="demo" aria-label="Demo controls">
      <div className="demo-head">
        <strong>Demo controls</strong>
        <button className="btn btn-link demo-link" onClick={() => set({ demoOpen: false })}>
          ◂ Hide
        </button>
      </div>
      <div className="demo-note">Not part of the customer experience.</div>

      <label className="demo-field">
        <span>Persona</span>
        <select value={s.personaId ?? ''} onChange={(e) => a.selectPersona(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.profile.name}, {p.profile.age} — {p.profile.city}
            </option>
          ))}
        </select>
        <button className="btn btn-link demo-link" onClick={() => set({ pickerOpen: true })}>
          Open persona picker
        </button>
      </label>

      <div className="demo-field">
        <span>Interface</span>
        <div className="demo-seg">
          <button className={s.chatOpen ? 'on' : ''} disabled={!s.personaId} onClick={() => set({ chatOpen: !s.chatOpen })}>
            Chat {s.chatOpen ? 'open' : ''}
          </button>
          <button className={s.view === 'cash' ? 'on' : ''} disabled={!s.personaId} onClick={() => a.openView(s.view === 'cash' ? 'accounts' : 'cash')}>
            Cash options page
          </button>
        </div>
        <span className="demo-hint">Each keeps its own answers and consent. Simulated orders from either update the account tiles.</span>
      </div>

      <div className="demo-field">
        <span>Disclosure variant</span>
        <div className="demo-seg">
          {(['upfront', 'progressive'] as const).map((v) => (
            <button
              key={v}
              className={s.variant === v ? 'on' : ''}
              onClick={() => {
                set({ variant: v });
                a.resetChat();
                a.restartPage();
              }}
            >
              {v === 'upfront' ? 'Upfront' : 'Progressive'}
            </button>
          ))}
        </div>
        <span className="demo-hint">Switching restarts the chat and the page for this persona.</span>
      </div>

      <div className="demo-field">
        <span>Mode</span>
        <div className="demo-seg">
          {(['scripted', 'model'] as const).map((m) => (
            <button key={m} className={s.mode === m ? 'on' : ''} onClick={() => set({ mode: m })}>
              {m === 'scripted' ? 'Scripted' : 'Model'}
            </button>
          ))}
        </div>
        {s.mode === 'model' && (
          <>
            <select value={config.model.model_options.includes(s.model) ? s.model : '__custom'} onChange={(e) => e.target.value !== '__custom' && set({ model: e.target.value })}>
              {config.model.model_options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            <div className="row gap">
              <input placeholder="Custom OpenRouter model id" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
              <button className="btn btn-small" disabled={!customModel.trim()} onClick={() => set({ model: customModel.trim() })}>
                Use
              </button>
            </div>
            <div className="demo-hint">Using: {s.model}</div>
            <input type="password" placeholder="OpenRouter API key (kept in memory only)" value={s.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })} autoComplete="off" />
            {!s.apiKey && <div className="demo-warn">No key: model mode falls back to scripted text.</div>}
          </>
        )}
      </div>

      <div className="demo-field">
        <span>Fire a nudge on demand</span>
        <div className="row gap">
          <select value={force} onChange={(e) => setForce(e.target.value as NudgeId)}>
            <option value="large_deposit">Large deposit</option>
            <option value="idle_balance">Idle balance</option>
            <option value="money_leaving">Money leaving</option>
          </select>
          <button className="btn btn-small" disabled={!s.personaId} onClick={() => a.forceNudge(force)}>
            Fire
          </button>
        </div>
      </div>

      <div className="row gap demo-field">
        <label className="demo-check">
          <input type="checkbox" checked={s.showTrace} onChange={(e) => set({ showTrace: e.target.checked })} /> Show rule trace
        </label>
      </div>
      <div className="row gap">
        <button className="btn btn-small" onClick={a.resetChat} disabled={!s.personaId}>
          Restart chat
        </button>
        <button className="btn btn-small" onClick={a.restartPage} disabled={!s.personaId}>
          Restart page
        </button>
        <button className="btn btn-small" onClick={a.resetAll}>
          Reset everything
        </button>
      </div>

      {s.showTrace && <TracePanel />}
    </aside>
  );
}

function TracePanel() {
  const { s, persona, nudges, chatFlow, pageFlow } = useAdvisor();
  // Follow whichever interface is in front: the chat when it's open, otherwise the page when it's showing.
  const onPage = s.view === 'cash' && !s.chatOpen;
  const f = onPage ? pageFlow : chatFlow;
  const { derived, result } = f;
  if (!persona || !derived) return <div className="trace muted">Choose a persona to see the rule trace.</div>;
  const answers = onPage ? (s.page.consented ? f.answers : null) : s.answers;
  return (
    <div className="trace">
      <h3>Rule trace · {onPage ? 'cash options page' : 'chat'}</h3>
      <div className="trace-sec">
        <h4>Inputs (derived from simulated data)</h4>
        <dl>
          <dt>Checking / savings</dt>
          <dd>
            {money(derived.checking)} / {money(derived.savings)}
          </dd>
          <dt>Typical paycheck</dt>
          <dd>{money(derived.typicalPaycheck)}</dd>
          <dt>Avg monthly outflow</dt>
          <dd>{money(derived.avgMonthlyOutflow)}</dd>
          <dt>Buffer (×{config.ranking.buffer_months})</dt>
          <dd>{money(derived.buffer)}</dd>
          <dt>Movable (default)</dt>
          <dd>{money(derived.movable)}</dd>
          <dt>Tax: fed / state+local</dt>
          <dd>
            {ratePct(derived.tax.federal)} / {ratePct(derived.tax.stateLocal)}
            {derived.tax.fundThreshold ? ` (fund 50% rule)` : ''}
          </dd>
          <dt>Card revolving</dt>
          <dd>{derived.cardRevolving ? `${money(derived.cardRevolving)} @ ${ratePct(derived.cardApr)}` : 'none'}</dd>
          <dt>Outside transfers</dt>
          <dd>{derived.recurringOutside.length ? derived.recurringOutside.map((r) => `${money(r.monthlyAmount)}/mo (${r.kind})`).join(', ') : 'none'}</dd>
          <dt>Answers</dt>
          <dd>
            {answers
              ? `${money(answers.amount)}, ${answers.timing}${answers.timing === 'date' ? ` ${answers.date}` : ''}${answers.redirectRecurring ? ', redirect monthly' : ''}`
              : 'not yet given (defaults shown below)'}
          </dd>
        </dl>
      </div>

      <div className="trace-sec">
        <h4>Gates</h4>
        {result?.gates.map((g) => (
          <div key={g.id} className={`trace-row ${g.applies ? 'hit' : ''}`}>
            <strong>{g.id}</strong>: {g.applies ? 'APPLIES' : 'pass'} — {g.rule}
            <div className="mono">{Object.entries(g.values).map(([k, v]) => `${k}=${v}`).join(' · ')}</div>
          </div>
        ))}
      </div>

      <div className="trace-sec">
        <h4>Nudge triggers</h4>
        {nudges.map((n) => (
          <div key={n.id} className={`trace-row ${n.fired ? 'hit' : ''}`}>
            <strong>{n.id}</strong>: {n.fired ? 'fires' : 'no'} — {n.detail}
          </div>
        ))}
      </div>

      {result && !result.gate && (
        <>
          <div className="trace-sec">
            <h4>Ranked (y × (1 − t_fed − t_state × (1 − e)))</h4>
            <table className="trace-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>y</th>
                  <th>e</th>
                  <th>after</th>
                  <th>$/yr</th>
                  <th>steps</th>
                </tr>
              </thead>
              <tbody>
                {result.ranked.map((o) => (
                  <tr key={o.productId} title={o.tieBreakNote ?? ''}>
                    <td>{o.rank}</td>
                    <td>
                      {o.shortName}
                      {o.tieBreakNote ? ' *' : ''}
                    </td>
                    <td>{pct(o.yield)}</td>
                    <td>
                      {o.exemptShareApplied}
                      {o.exemptShareApplied !== o.exemptShare ? ` (${o.exemptShare})` : ''}
                    </td>
                    <td>{pct(o.afterTaxYield, 3)}</td>
                    <td>{money(o.annualDollars)}</td>
                    <td>{o.steps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.ranked.some((o) => o.tieBreakNote) && (
              <div className="demo-hint">* {result.ranked.filter((o) => o.tieBreakNote).map((o) => `${o.shortName}: ${o.tieBreakNote}`).join('; ')}</div>
            )}
          </div>
          <div className="trace-sec">
            <h4>Excluded</h4>
            {result.excluded.length ? result.excluded.map((x) => <div key={x.productId}>{x.name}: {x.reason}</div>) : <div>none</div>}
          </div>
          <div className="trace-sec">
            <h4>Outside benchmarks (never ranked)</h4>
            {result.benchmarks.map((b) => (
              <div key={b.id}>
                {b.name}: {pct(b.yield)} → {pct(b.afterTaxYield, 3)} → {money(b.annualDollars)} ({b.differenceVsTop >= 0 ? '+' : '−'}
                {money(Math.abs(b.differenceVsTop))} vs top)
              </div>
            ))}
          </div>
        </>
      )}

      <div className="trace-sec">
        <h4>Event log (disclosures, model calls, actions)</h4>
        {s.trace.length === 0 && <div className="muted">Nothing yet.</div>}
        {s.trace.map((t, i) => (
          <div key={i} className={`trace-log ${t.kind}`}>
            <span className="mono">{new Date(t.at).toLocaleTimeString()}</span> <span className="kind">{t.kind}</span> {t.detail}
          </div>
        ))}
      </div>
      <div className="demo-hint">Simulated date {longDate(config.demo_date)}.</div>
    </div>
  );
}
