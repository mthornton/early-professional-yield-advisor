import { useEffect, useRef, useState } from 'react';
import { config } from '../../data';
import { money } from '../../conversation/format';
import { useAdvisor } from '../AdvisorContext';
import { FlowCtx } from '../flow';
import { BlockView } from './Blocks';

const SUGGESTED = ['Do you have a high yield savings account?', 'Where should I put my bonus?', "What's your savings rate?"];

function nudgeCopy(id: string, movable: number, values: Record<string, number | string>) {
  const base = `You have about ${money(movable)} sitting in checking earning nothing. Want to see what it could earn?`;
  if (id === 'large_deposit') return { kicker: `A ${money(Number(values.largest_deposit))} deposit just landed.`, body: base };
  if (id === 'money_leaving')
    return {
      kicker: `About ${money(Number(values.monthly))} a month goes to an outside savings account.`,
      body: `You also have about ${money(movable)} sitting in checking earning nothing. Want to see what it could earn, with outside rates shown side by side?`,
    };
  return { kicker: 'Your checking balance has stayed high for 60 days.', body: base };
}

export function ChatPanel() {
  const { s, set, persona, derived, accounts, activeNudge, acceptNudge, dismissNudge, sendMessage, chatFlow } = useAdvisor();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [s.blocks.length, s.action?.index]);
  if (!persona || !derived) return null;

  const showNudge = activeNudge && s.blocks.length === 0;
  const copy = activeNudge ? nudgeCopy(activeNudge.id, derived.movable, activeNudge.values) : null;
  const submit = () => {
    const t = text;
    setText('');
    void sendMessage(t);
  };

  return (
    <FlowCtx.Provider value={chatFlow}>
    <aside className="chat" aria-label="Chat">
      <div className="chat-head">
        <div>
          <div className="chat-title">Chat</div>
          <div className="tiny muted">{config.brand.prototype_label}</div>
        </div>
        <button className="btn btn-link" onClick={() => set({ chatOpen: false })} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="snapshot" aria-label="What the agent can see">
        <span className="snapshot-label">Agent sees:</span>
        {accounts.map((a) => (
          <span key={a.id} className="chip">
            {a.name.replace('Chase ', '')}: {money(a.type === 'credit_card' ? a.revolving_balance ?? 0 : a.balance)}
            {a.type === 'credit_card' ? ' carried' : ''}
          </span>
        ))}
      </div>

      <div className="chat-body">
        {showNudge && copy && (
          <div className="nudge-card">
            {activeNudge.forced && <div className="demo-flag">Forced by demo control</div>}
            <div className="nudge-kicker">{copy.kicker}</div>
            <div className="nudge-head">{copy.body}</div>
            <div className="row gap">
              <button className="btn btn-primary" onClick={acceptNudge}>
                Show me
              </button>
              <button className="btn btn-secondary" onClick={dismissNudge}>
                Not now
              </button>
            </div>
          </div>
        )}

        {s.blocks.length === 0 && (
          <div className="msg agent">
            <div className="bubble">Hi {persona.profile.name}. How can I help today?</div>
          </div>
        )}

        {s.blocks.map((b) => (
          <BlockView key={b.id} block={b} />
        ))}
        {s.busy && (
          <div className="msg agent">
            <div className="bubble muted">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {s.blocks.length === 0 && (
        <div className="suggested">
          {SUGGESTED.map((q) => (
            <button key={q} className="chip-btn" onClick={() => void sendMessage(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question" aria-label="Message" />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || s.busy}>
          Send
        </button>
      </form>
    </aside>
    </FlowCtx.Provider>
  );
}
