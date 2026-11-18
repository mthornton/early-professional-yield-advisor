import { config, personas } from '../../data';
import { money, longDate } from '../../conversation/format';
import { useAdvisor } from '../AdvisorContext';
import type { Account } from '../../engine/types';

export function PrototypeBanner() {
  return (
    <div className="prototype-banner" role="note">
      <strong>{config.brand.prototype_label}.</strong> Not a real bank site. No real customer data, accounts or orders. Disclosure text is placeholder.
    </div>
  );
}

export function TopNav() {
  const { persona, set, s, openView } = useAdvisor();
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◆
          </span>
          <span className="brand-name">{config.brand.product_label}</span>
          <span className="tag-prototype">Prototype</span>
        </div>
        <nav className="topnav-links" aria-label="Main">
          <button className={`navlink ${s.view === 'accounts' ? 'active' : ''}`} onClick={() => openView('accounts')}>
            Accounts
          </button>
          <a>Pay &amp; transfer</a>
          <a>Investments</a>
          <button className={`navlink ${s.view === 'cash' ? 'active' : ''}`} onClick={() => persona && openView('cash')} disabled={!persona}>
            Plan &amp; track
          </button>
          <a>Security</a>
        </nav>
        <div className="topnav-right">
          {persona && <span className="signed-in">Signed in as {persona.profile.name} (simulated)</span>}
          <button className="btn btn-ghost-light" onClick={() => set({ chatOpen: !s.chatOpen })} disabled={!persona}>
            {s.chatOpen ? 'Close chat' : 'Chat'}
          </button>
        </div>
      </div>
    </header>
  );
}

const typeLabel: Record<Account['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit card',
  brokerage: 'Investments',
};

export function AccountsOverview() {
  const { persona, accounts, set, activeNudge, openView, derived } = useAdvisor();
  if (!persona) return null;
  const recent = persona.transactions.filter((t) => t.account_id === 'chk').slice(-8).reverse();
  const deposits = accounts.filter((a) => a.type !== 'credit_card').reduce((s, a) => s + a.balance, 0);
  return (
    <main className="overview">
      <div className="overview-head">
        <div>
          <h1>Good morning, {persona.profile.name}</h1>
          <p className="muted">
            {persona.profile.city}, {persona.profile.state} · Simulated data through {longDate(persona.period.end)}
          </p>
        </div>
        <div className="overview-total">
          <span className="muted">Total balances</span>
          <strong>{money(deposits)}</strong>
        </div>
      </div>

      <section className="tiles" aria-label="Accounts">
        {accounts.map((a) => (
          <article key={a.id} className="tile">
            <div className="tile-type">{typeLabel[a.type]}</div>
            <div className="tile-name">{a.name}</div>
            <div className="tile-balance">{money(a.balance)}</div>
            <div className="tile-meta">
              {a.type === 'credit_card'
                ? (a.revolving_balance ?? 0) > 0
                  ? `Carried balance ${money(a.revolving_balance!)} · ${((a.apr ?? 0) * 100).toFixed(2)}% APR`
                  : 'Current balance · paid in full monthly'
                : a.type === 'brokerage'
                  ? 'Self-Directed Investing'
                  : 'Available balance'}
            </div>
          </article>
        ))}
      </section>

      {derived && derived.movable > 0 && (
        <button className="promo-tile" onClick={() => openView('cash')}>
          <span>
            <strong>Earn more on your cash</strong>
            <span className="muted"> · Compare Chase options for money you don't need day to day.</span>
          </span>
          <span className="promo-cta">See your options →</span>
        </button>
      )}

      {activeNudge && (
        <button className="home-chat-hint" onClick={() => set({ chatOpen: true })}>
          You have a new message in chat →
        </button>
      )}

      <section className="activity">
        <h2>Recent checking activity</h2>
        <table>
          <tbody>
            {recent.map((t, i) => (
              <tr key={i}>
                <td className="muted">{longDate(t.date)}</td>
                <td>{t.description}</td>
                <td className={t.amount < 0 ? 'amt neg' : 'amt pos'}>
                  {t.amount < 0 ? '−' : '+'}
                  {money(Math.abs(t.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export function PersonaPicker() {
  const { selectPersona, s, set } = useAdvisor();
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose a persona">
      <div className="modal">
        <div className="modal-head">
          <h2>Choose a simulated customer</h2>
          {s.personaId && (
            <button className="btn btn-link" onClick={() => set({ pickerOpen: false })}>
              Close
            </button>
          )}
        </div>
        <p className="muted">Each persona is built to produce a different recommendation. Picking one loads their data and resets the chat.</p>
        <div className="persona-grid">
          {personas.map((p) => (
            <button key={p.id} className={`persona-card ${s.personaId === p.id ? 'selected' : ''}`} onClick={() => selectPersona(p.id)}>
              <div className="persona-avatar" aria-hidden>
                {p.profile.name[0]}
              </div>
              <div className="persona-name">
                {p.profile.name}, {p.profile.age}
              </div>
              <div className="persona-city">
                {p.profile.city}, {p.profile.state}
              </div>
              <div className="persona-situation">{p.profile.situation}</div>
            </button>
          ))}
        </div>
        <p className="tiny muted">{config.brand.prototype_label}.</p>
      </div>
    </div>
  );
}
