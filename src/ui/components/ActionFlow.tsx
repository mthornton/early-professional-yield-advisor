import { disclosures } from '../../data';
import { longDate, money, pct } from '../../conversation/format';
import { availableLabel, useAdvisor } from '../AdvisorContext';
import { useFlow } from '../flow';
import type { Block, Holding } from '../store';
import { PlaceholderTag } from './Blocks';

const STEP_TITLES: Record<string, string> = {
  open_1: 'Open Self-Directed Investing (1 of 2)',
  open_2: 'Open Self-Directed Investing (2 of 2)',
  amount: 'Confirm amount',
  final_disclosure: 'Before you confirm',
  confirm: 'Review and confirm',
};

export function ActionFlow({ bare }: { bare?: boolean } = {}) {
  const { persona } = useAdvisor();
  const { id, derived, answers, action: a, selectedOption: o, actionNext, actionBack, actionPatch, cancelAction } = useFlow();
  if (!a || !o || !persona || !derived || !answers) {
    return null;
  }
  const step = a.steps[a.index];
  const amount = answers.amount;
  const monthly = answers.redirectRecurring ? derived.recurringOutside.reduce((x, r) => x + r.monthlyAmount, 0) : 0;
  const fromChecking = Math.min(amount, Math.max(0, derived.checking - derived.buffer));
  const fromSavings = Math.min(derived.savings, amount - fromChecking);
  let canNext = true;
  if (step === 'open_2') canNext = a.agreementsAccepted;
  if (step === 'final_disclosure') canNext = a.finalAccepted;
  const verb = o.productId === 'chase_cd' ? 'Open CD' : o.productId === 'chase_savings' ? 'Transfer' : o.productId === 'premium_deposit' ? 'Move to Premium Deposit' : 'Place order';

  const body = (
      <div className="panel action">
        <div className="steps-bar">
          {a.steps.map((st, i) => (
            <span key={st} className={`step-dot ${i < a.index ? 'done' : i === a.index ? 'on' : ''}`} title={STEP_TITLES[st]} />
          ))}
          <span className="tiny muted">Simulated, nothing real moves</span>
        </div>
        <div className="panel-title">{STEP_TITLES[step]}</div>

        {step === 'open_1' && (
          <div>
            <p>We'll open a J.P. Morgan Self-Directed Investing account using your Chase profile.</p>
            <ul className="facts">
              <li>Name: {persona.profile.name} (simulated)</li>
              <li>
                Address on file: {persona.profile.city}, {persona.profile.state}
              </li>
              <li>Account type: Individual, cash account (no margin)</li>
              <li>Funding: linked Chase checking</li>
            </ul>
          </div>
        )}
        {step === 'open_2' && (
          <div>
            <p>{disclosures.items.brokerage_account.short}</p>
            <div className="disclosure-full">{disclosures.items.brokerage_account.full}</div>
            <PlaceholderTag />
            <label className="check">
              <input type="checkbox" checked={a.agreementsAccepted} onChange={(e) => actionPatch({ agreementsAccepted: e.target.checked })} />I agree to the account agreement and
              electronic delivery (placeholder).
            </label>
          </div>
        )}
        {step === 'amount' && (
          <div>
            <table className="compare">
              <tbody>
                <tr>
                  <td>Product</td>
                  <td>{o.name}</td>
                </tr>
                <tr>
                  <td>Amount now</td>
                  <td>{money(amount)}</td>
                </tr>
                <tr>
                  <td>From</td>
                  <td>
                    Checking {money(Math.max(0, fromChecking))}
                    {fromSavings > 0 ? ` + Chase Savings ${money(fromSavings)}` : ''}
                  </td>
                </tr>
                {monthly > 0 && (
                  <tr>
                    <td>Monthly</td>
                    <td>Redirect {money(monthly)} on the 2nd of each month (instead of the outside transfer)</td>
                  </tr>
                )}
                {o.maturityDate && (
                  <tr>
                    <td>Matures</td>
                    <td>{longDate(o.maturityDate)}</td>
                  </tr>
                )}
                <tr>
                  <td>Checking left after</td>
                  <td>{money(derived.checking - Math.max(0, fromChecking))}</td>
                </tr>
              </tbody>
            </table>
            <p className="tiny muted">To change the amount, cancel this step and edit {id === 'page' ? 'your information' : 'the questions above'}.</p>
          </div>
        )}
        {step === 'final_disclosure' && (
          <div>
            {[...o.disclosureIds, 'order_final'].map((id) => (
              <div key={id} className="disclosure-item">
                <strong>{disclosures.items[id].title}.</strong> {disclosures.items[id].full}
              </div>
            ))}
            <PlaceholderTag />
            <label className="check">
              <input type="checkbox" checked={a.finalAccepted} onChange={(e) => actionPatch({ finalAccepted: e.target.checked })} />I have read this and understand the risks.
            </label>
          </div>
        )}
        {step === 'confirm' && (
          <div>
            <p>
              {verb}: <strong>{money(amount)}</strong> into {o.name}
              {monthly > 0 ? `, plus ${money(monthly)} a month` : ''}.
            </p>
            <p>
              Expected: about <strong>{money(o.annualDollars)}</strong> a year after tax ({pct(o.afterTaxYield)}). Money back in checking: {availableLabel(o)}.
            </p>
          </div>
        )}

        <div className="row gap mt">
          {a.index > 0 && (
            <button className="btn btn-secondary" onClick={actionBack}>
              Back
            </button>
          )}
          <button className="btn btn-primary" disabled={!canNext} onClick={actionNext}>
            {step === 'confirm' ? verb : step === 'open_2' ? 'Open account' : 'Continue'}
          </button>
          <button className="btn btn-link" onClick={cancelAction}>
            Cancel
          </button>
        </div>
      </div>
  );
  return bare ? body : <div className="msg agent wide">{body}</div>;
}

export function Confirmation({ block, holding, bare }: { block?: Block; holding?: Holding; bare?: boolean }) {
  const h = holding ?? (block!.data!.holding as Holding);
  const body = (
      <div className="panel confirm">
        <div className="panel-title">Done (simulated)</div>
        <ul className="facts">
          {h.openedBrokerage && <li>Opened a Self-Directed Investing account.</li>}
          <li>
            Moved {money(h.amount)} into {h.name}
            {h.fromSavings > 0 ? ` (${money(h.fromChecking)} from checking, ${money(h.fromSavings)} from Chase Savings)` : ' from checking'}.
          </li>
          {h.monthly > 0 && <li>Set up a {money(h.monthly)} monthly transfer into the same fund. Stop your outside transfer separately if you want to.</li>}
          <li>
            Expected: about {money(h.annualDollars)} a year after tax ({pct(h.afterTaxYield)}). Yields can change.
          </li>
          <li>Money back in checking: {h.availableLabel}.</li>
          <li>To undo: {h.undoLabel}</li>
        </ul>
        <div className="tiny muted">Your account tiles have been updated. This is a simulation; no real order was placed.</div>
      </div>
  );
  return bare ? body : <div className="msg agent wide">{body}</div>;
}
