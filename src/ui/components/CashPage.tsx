// The non-chat interface: a "Cash options" page. The customer agrees to data use, reviews and corrects
// the figures pre-filled from their accounts, then gets the same ranked options the chat shows.
import { useEffect, useRef, useState } from 'react';
import { catalog, config, disclosures, taxTables } from '../../data';
import { addDaysIso, addMonths, type BillTerm, type CdTerm } from '../../engine';
import { asOf, money, pct, ratePct } from '../../conversation/format';
import { useAdvisor } from '../AdvisorContext';
import { FlowCtx, useFlow } from '../flow';
import type { Overrides } from '../store';
import { GateMessage, PlaceholderTag } from './Blocks';
import { Recommendations } from './Recommendations';
import { ActionFlow, Confirmation } from './ActionFlow';

export function CashPage() {
  const { persona, pageFlow, page, openView } = useAdvisor();
  if (!persona) return null;
  return (
    <FlowCtx.Provider value={pageFlow}>
      <main className="overview cash-page">
        <nav className="crumbs" aria-label="Breadcrumb">
          <button className="btn btn-link" onClick={() => openView('accounts')}>
            Accounts
          </button>
          <span aria-hidden>›</span>
          <span>Plan &amp; track</span>
          <span aria-hidden>›</span>
          <span>Cash options</span>
        </nav>
        <div className="overview-head">
          <div>
            <h1>Earn more on your cash</h1>
            <p className="muted">Compare Chase options for money you don't need day to day. Figures are estimates for illustration.</p>
          </div>
        </div>
        {!page.consented && !page.declined && <PageConsent />}
        {page.declined && !page.consented && <GeneralTable />}
        {page.consented && (
          <div className="cash-grid">
            <InputsForm />
            <Results />
          </div>
        )}
      </main>
    </FlowCtx.Provider>
  );
}

function PageConsent() {
  const { s, pageConsent, pageDecline } = useAdvisor();
  const [checked, setChecked] = useState(false);
  if (s.variant === 'progressive') {
    return (
      <section className="panel consent-card">
        <div className="panel-title">Use your Chase accounts to fill this in?</div>
        <p>{disclosures.items.data_consent.short}</p>
        <PlaceholderTag />
        <div className="row gap mt">
          <button className="btn btn-primary" onClick={pageConsent}>
            Agree and pre-fill
          </button>
          <button className="btn btn-secondary" onClick={pageDecline}>
            Just show general rates
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="panel consent-card disclosure-panel">
      <div className="panel-title">Before we personalize anything</div>
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
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I agree to let Chase use my account data to rank options, and I understand some options are investments, not deposits.
      </label>
      <div className="row gap">
        <button className="btn btn-primary" disabled={!checked} onClick={pageConsent}>
          Continue
        </button>
        <button className="btn btn-secondary" onClick={pageDecline}>
          Just show general rates
        </button>
      </div>
    </section>
  );
}

function GeneralTable() {
  const { restartPage } = useAdvisor();
  return (
    <section className="panel">
      <div className="panel-title">Chase cash options (general, not personalized)</div>
      <table className="compare">
        <thead>
          <tr>
            <th>Option</th>
            <th>Rate</th>
            <th>Protection</th>
            <th>Account needed</th>
          </tr>
        </thead>
        <tbody>
          {catalog.products.map((p) => {
            let rate: string;
            if (p.id === 'chase_cd') {
              const best = (p.terms as CdTerm[]).reduce((a, b) => (b.tiers[0].apy > a.tiers[0].apy ? b : a));
              rate = `Up to ${pct(best.tiers[0].apy)} APY (${best.months}-month)`;
            } else if (p.id === 'tbill') {
              const t = p.terms as BillTerm[];
              rate = `${pct(t[0].yield)}–${pct(t[t.length - 1].yield)}`;
            } else rate = `${pct(p.yield!)} ${p.yield_basis}`;
            return (
              <tr key={p.id}>
                <td>
                  <strong>{p.short_name}</strong>
                  <div className="tiny muted">{asOf(p.as_of)}</div>
                </td>
                <td>{rate}</td>
                <td>{p.insured === 'FDIC' ? 'FDIC-insured' : p.insured === 'us_government' ? 'U.S. government' : 'Investment, not FDIC-insured'}</td>
                <td>{p.needs_brokerage ? 'Self-Directed Investing' : 'None new'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div>
        <button className="btn btn-primary" onClick={restartPage}>
          Rank these using my accounts
        </button>
      </div>
    </section>
  );
}

/** "From your accounts" when the value still matches the account data, "Changed" otherwise. */
function Source({ changed }: { changed: boolean }) {
  return <span className={`src-pill ${changed ? 'changed' : ''}`}>{changed ? 'Changed by you' : 'From your accounts'}</span>;
}

function InputsForm() {
  const { persona, derived: rawDerived, pageOverrides: o, pageDefaults: def, setOverrides, resetPageInputs, page, pageShow } = useAdvisor();
  const { answers: a, derived: d, updateAnswers, locked } = useFlow();
  if (!persona || !rawDerived || !o || !def || !a || !d) return null;
  const changed = (k: keyof Overrides) => o[k] !== def[k];
  const anyChanged = (Object.keys(o) as (keyof Overrides)[]).some(changed) || a.amount !== rawDerived.movable;
  const minDate = addDaysIso(config.demo_date, 7);
  const maxDate = addMonths(config.demo_date, 12);
  const hasOutside = rawDerived.recurringOutside.length > 0;
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const tax = d.tax;
  return (
    <section className="panel cash-form" aria-label="Your information">
      <div className="row between">
        <div className="panel-title">Your information</div>
        {anyChanged && !locked && (
          <button className="btn btn-link" onClick={resetPageInputs}>
            Reset to account data
          </button>
        )}
      </div>
      <p className="tiny muted">We filled this in from your Chase accounts. Change anything that's out of date.</p>

      <fieldset className="form-group" disabled={locked}>
        <legend>The money</legend>
        <label className="field">
          <span className="field-label">
            Amount to set aside <Source changed={a.amount !== rawDerived.movable} />
          </span>
          <span className="money-input">
            <span>$</span>
            <input type="number" min={0} step={500} value={a.amount} onChange={(e) => updateAnswers({ amount: num(e.target.value) })} />
          </span>
          <span className="tiny muted">
            Suggested {money(rawDerived.movable)}: checking {money(rawDerived.checking)}
            {rawDerived.savings ? ` + Chase Savings ${money(rawDerived.savings)}` : ''}, minus a {money(rawDerived.buffer)} cushion (1.5 months of spending), rounded down.
          </span>
        </label>
        <div className="field">
          <span className="field-label">When might you need it?</span>
          <div className="seg">
            {(
              [
                ['anytime', 'Anytime'],
                ['date', 'By a date'],
                ['over_12', 'Not for 12+ months'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`seg-opt ${a.timing === k ? 'on' : ''}`}>
                <input type="radio" name="page-timing" checked={a.timing === k} onChange={() => updateAnswers({ timing: k, date: k === 'date' ? a.date ?? maxDate : a.date })} />
                {label}
              </label>
            ))}
          </div>
          {a.timing === 'date' && <input type="date" min={minDate} max={maxDate} value={a.date ?? ''} onChange={(e) => updateAnswers({ date: e.target.value })} />}
        </div>
        {hasOutside && (
          <div className="field">
            <span className="field-label">
              Monthly transfer to an outside savings account <Source changed={changed('monthly')} />
            </span>
            <span className="money-input">
              <span>$</span>
              <input type="number" min={0} step={100} value={o.monthly} onChange={(e) => setOverrides({ monthly: num(e.target.value) })} />
              <span className="tiny muted">a month</span>
            </span>
            <label className="check">
              <input type="checkbox" checked={a.redirectRecurring} onChange={(e) => updateAnswers({ redirectRecurring: e.target.checked })} />
              Include redirecting it to Chase
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="form-group" disabled={locked}>
        <legend>Taxes</legend>
        <label className="field">
          <span className="field-label">
            State you live in <Source changed={changed('state') || changed('nyc')} />
          </span>
          <select value={o.state} onChange={(e) => setOverrides({ state: e.target.value, nyc: e.target.value === 'NY' ? o.nyc : false })}>
            {Object.entries(taxTables.states).map(([code, st]) => (
              <option key={code} value={code}>
                {st.name}
              </option>
            ))}
          </select>
        </label>
        {o.state === 'NY' && (
          <label className="check">
            <input type="checkbox" checked={o.nyc} onChange={(e) => setOverrides({ nyc: e.target.checked })} />I live in New York City
          </label>
        )}
        <label className="field">
          <span className="field-label">
            Yearly income before tax <Source changed={changed('income')} />
          </span>
          <span className="money-input">
            <span>$</span>
            <input type="number" min={0} step={1000} value={o.income} onChange={(e) => setOverrides({ income: num(e.target.value) })} />
          </span>
          <span className="tiny muted">
            Estimated from your paychecks. Estimated tax rates: {ratePct(tax.federal)} federal, {ratePct(tax.stateLocal)} {tax.localName ? 'state and city' : 'state'}. Not tax advice.
          </span>
        </label>
      </fieldset>

      <fieldset className="form-group" disabled={locked}>
        <legend>Credit card</legend>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">
              Balance carried month to month <Source changed={changed('cardBalance')} />
            </span>
            <span className="money-input">
              <span>$</span>
              <input type="number" min={0} step={100} value={o.cardBalance} onChange={(e) => setOverrides({ cardBalance: num(e.target.value) })} />
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              APR <Source changed={changed('cardAprPct')} />
            </span>
            <span className="money-input">
              <input type="number" min={0} step={0.01} value={o.cardAprPct} onChange={(e) => setOverrides({ cardAprPct: num(e.target.value) })} />
              <span>%</span>
            </span>
          </label>
        </div>
        <span className="tiny muted">If you pay your card in full each month, leave the balance at $0.</span>
      </fieldset>

      <div className="form-group readonly">
        <span className="field-label">Self-Directed Investing account</span>
        <span>{persona.has_brokerage ? 'You have one. Options that need it are ready to use.' : "You don't have one yet. Options that need it include opening one (about 2 extra steps)."}</span>
      </div>

      {!page.shown && (
        <button className="btn btn-primary btn-block" onClick={pageShow}>
          Show my options
        </button>
      )}
      {page.shown && !locked && <div className="tiny muted">Your options update as you change anything here.</div>}
    </section>
  );
}

function Results() {
  const { page, restartPage, pageShow, s, openView } = useAdvisor();
  const { result, answers, action, explaining } = useFlow();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (action || page.confirmation) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [action?.index, action?.productId, page.confirmation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!page.shown) {
    return (
      <section className="cash-results empty">
        <div className="panel muted-panel">
          <div className="panel-title">Your options will appear here</div>
          <p className="muted">Check the details on the left, then choose Show my options. We'll rank Chase's cash options by what you'd keep after tax, and show what outside savings accounts pay on the same money.</p>
          <button className="btn btn-secondary" onClick={pageShow} disabled={!answers}>
            Show my options
          </button>
        </div>
      </section>
    );
  }
  if (!result || !answers) return null;
  return (
    <section className="cash-results" aria-label="Your options">
      <div ref={ref} />
      {page.confirmation ? (
        <>
          <Confirmation holding={page.confirmation} bare />
          <div className="row gap">
            <button className="btn btn-primary" onClick={() => openView('accounts')}>
              Back to accounts
            </button>
            <button className="btn btn-secondary" onClick={restartPage}>
              Start over
            </button>
          </div>
        </>
      ) : action ? (
        <ActionFlow bare />
      ) : result.gate ? (
        <GateMessage bare />
      ) : (
        <>
          <div className="results-head">
            <h2>
              Ranked for {money(answers.amount)}
              {answers.redirectRecurring && result.ranked[0]?.recurringDollars > 0 ? ' plus your monthly transfer' : ''}
            </h2>
            <span className="tiny muted">
              {s.mode === 'model' && explaining ? 'Writing explanations… · ' : ''}Ranked by after-tax dollars per year. Rates {asOf(catalog.snapshot_taken)}.
            </span>
          </div>
          {answers.amount <= 0 ? (
            <div className="warn">Enter an amount to set aside to see what it could earn. Your checking balance is at or below the suggested cushion right now.</div>
          ) : result.ranked.length === 0 ? (
            <div className="warn">Nothing fits those answers. Try a larger amount or a later date.</div>
          ) : (
            <Recommendations bare />
          )}
        </>
      )}
    </section>
  );
}
