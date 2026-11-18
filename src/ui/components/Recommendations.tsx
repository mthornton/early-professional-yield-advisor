import { useEffect, useState } from 'react';
import { disclosures } from '../../data';
import type { RankedOption } from '../../engine/types';
import { asOf, longDate, money, pct } from '../../conversation/format';
import { factSentence, templateExplanation } from '../../conversation/explain';
import { useAdvisor } from '../AdvisorContext';
import { useFlow } from '../flow';
import { PlaceholderTag } from './Blocks';

function benefits(o: RankedOption): string[] {
  const out: string[] = [];
  const stateFact = o.facts.find((f) => f.code === 'state_tax_free');
  if (stateFact) out.push(factSentence(stateFact));
  if (o.insured === 'FDIC') out.push('FDIC-insured up to applicable limits.');
  if (o.insured === 'us_government') out.push('Backed by the U.S. government when held to maturity.');
  if (o.maturityDate) out.push(`Rate locked until ${longDate(o.maturityDate)}.`);
  else if (o.daysToCash === 0) out.push('Money available instantly.');
  else out.push('No lock-up; sell any business day.');
  if (o.facts.some((f) => f.code === 'has_account')) out.push('Uses the Self-Directed Investing account you already have.');
  if (o.productId === 'chase_cd' || o.productId === 'chase_savings') out.push('Stays in your Chase banking accounts.');
  return out;
}

function Card({ o, expanded, onToggle }: { o: RankedOption; expanded: boolean; onToggle: () => void }) {
  const { s } = useAdvisor();
  const { explanations, explaining, canChoose, choose } = useFlow();
  const ex = explanations[o.productId];
  const reason = ex?.text ?? templateExplanation(o);
  const notices = s.variant === 'progressive' ? o.disclosureIds.filter((d) => !['deposit_general', 'cd_penalty'].includes(d)) : [];
  return (
    <article className={`rec-card ${o.rank === 1 ? 'top' : ''} ${expanded ? 'open' : ''}`}>
      <button className="rec-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="rank">{o.rank}</span>
        <span className="rec-name">
          {o.shortName}
          {o.rank === 1 && <span className="badge">Best fit for you</span>}
        </span>
        <span className="rec-head-nums">
          <strong>{money(o.annualDollars)}</strong>
          <span className="tiny muted">/yr after tax</span>
        </span>
        <span className="chev" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className="rec-body">
          <div className="tiny muted">{o.name}</div>
          <p className="reason">
            {explaining && s.mode === 'model' ? <span className="muted">Writing explanation…</span> : reason}
            {s.mode === 'model' && ex && (
              <span className={`src-tag ${ex.source}`} title={ex.note ?? ''}>
                {ex.source === 'model' ? 'model wording' : `template${ex.note ? ' (model rejected)' : ''}`}
              </span>
            )}
          </p>
          <div className="metrics">
            <div>
              <div className="metric-label">After-tax yield</div>
              <div className="metric">{pct(o.afterTaxYield)}</div>
              <div className="tiny muted">
                {pct(o.yield)} {o.yieldBasis}, {asOf(o.asOf)}
              </div>
            </div>
            <div>
              <div className="metric-label">{o.recurringDollars > 0 ? 'First year, lump sum + monthly' : `Per year on ${money(o.amountBasis)}`}</div>
              <div className="metric">{money(o.annualDollars)}</div>
              {o.recurringDollars > 0 && (
                <div className="tiny muted">
                  {money(o.lumpDollars)} lump sum + {money(o.recurringDollars)} from monthly transfers (first year)
                </div>
              )}
            </div>
            <div>
              <div className="metric-label">Steps to act</div>
              <div className="metric">{o.steps}</div>
              {o.needsAccountOpening && <div className="tiny muted">Includes opening Self-Directed Investing</div>}
            </div>
          </div>
          <div className="procon">
            <div>
              <div className="procon-title">Why it fits</div>
              <ul>
                {benefits(o).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="procon-title">Trade-offs</div>
              <ul>
                {o.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          {notices.length > 0 && (
            <div className="notice">
              {notices.map((id) => (
                <div key={id}>
                  <strong>{disclosures.items[id].title}:</strong> {disclosures.items[id].short}
                </div>
              ))}
              <PlaceholderTag />
            </div>
          )}
          {o.tieBreakNote && <div className="tiny muted">Ranking note: {o.tieBreakNote}.</div>}
          {o.verify.length > 0 && <div className="verify">Verify before demo: {o.verify.join('; ')}</div>}
          <button className="btn btn-primary" disabled={!canChoose} onClick={() => choose(o.productId)}>
            Choose this
          </button>
        </div>
      )}
    </article>
  );
}

export function Recommendations({ bare }: { bare?: boolean } = {}) {
  const { result } = useFlow();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const topId = result?.ranked[0]?.productId;
  useEffect(() => {
    setOpen({});
  }, [topId]);
  if (!result || result.gate) return null;
  const top = result.ranked[0];
  const recs = (
      <div className="recs">
        {result.ranked.map((o) => (
          <Card
            key={o.productId}
            o={o}
            expanded={open[o.productId] ?? o.rank === 1}
            onToggle={() => setOpen({ ...open, [o.productId]: !(open[o.productId] ?? o.rank === 1) })}
          />
        ))}
        {top && <ComparisonStrip />}
      </div>
  );
  return bare ? recs : <div className="msg agent wide">{recs}</div>;
}

function ComparisonStrip() {
  const { result } = useFlow();
  if (!result) return null;
  const top = result.ranked[0];
  const topNeedsBroker = top.steps > 1 && top.productId !== 'chase_cd';
  return (
    <section className="compare-strip" aria-label="Outside comparison">
      <div className="panel-title">
        What outside savings accounts pay on the same {top.recurringDollars > 0 ? 'money (lump sum + monthly, first year)' : money(top.amountBasis)}
      </div>
      <table className="compare">
        <thead>
          <tr>
            <th>Category</th>
            <th>Rate</th>
            <th>After tax</th>
            <th>Per year</th>
            <th>vs. {top.shortName.toLowerCase()}</th>
          </tr>
        </thead>
        <tbody>
          {result.benchmarks.map((b) => (
            <tr key={b.id}>
              <td>
                {b.name}
                <div className="tiny muted">{asOf(b.asOf)}</div>
              </td>
              <td>{b.yieldLow ? `${pct(b.yieldLow)}–${pct(b.yieldHigh!)}` : `about ${pct(b.yield)}`} APY</td>
              <td>{pct(b.afterTaxYield)}</td>
              <td>{money(b.annualDollars)}</td>
              <td className={b.differenceVsTop > 0 ? 'neg' : 'pos'}>
                {b.differenceVsTop > 0 ? `${money(b.differenceVsTop)} more outside` : `${money(-b.differenceVsTop)} less outside`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="procon">
        <div>
          <div className="procon-title">Staying with Chase</div>
          <ul>
            <li>One login for banking and investing.</li>
            {topNeedsBroker && <li>Faster moves between cash and investments in one place.</li>}
          </ul>
        </div>
        <div>
          <div className="procon-title">Going outside</div>
          <ul>
            <li>The highest-paying online banks may pay more, as shown above.</li>
            {top.insured === 'none' && <li>Outside savings accounts are FDIC-insured; a money market fund is not.</li>}
            <li>Transfers between banks take a day or more.</li>
          </ul>
        </div>
      </div>
      <div className="tiny muted">
        {disclosures.items.outside_comparison.short} After-tax figures use the same estimated tax rates. Dollar figures use the midpoint where a range is shown. <PlaceholderTag />
      </div>
    </section>
  );
}
