import { AdvisorProvider, useAdvisor } from './AdvisorContext';
import { AccountsOverview, PersonaPicker, PrototypeBanner, TopNav } from './components/Shell';
import { ChatPanel } from './components/ChatPanel';
import { CashPage } from './components/CashPage';
import { DemoPanel } from './components/DemoPanel';

function Layout() {
  const { s, persona, set } = useAdvisor();
  return (
    <div className={`app ${s.demoOpen ? 'with-demo' : ''} ${s.chatOpen ? 'with-chat' : ''}`}>
      <DemoPanel />
      <div className="site">
        <PrototypeBanner />
        <TopNav />
        {persona ? (
          s.view === 'cash' ? <CashPage /> : <AccountsOverview />
        ) : (
          <main className="overview">
            <p className="muted">Choose a simulated customer to start.</p>
          </main>
        )}
        {persona && !s.chatOpen && (
          <button className="chat-launcher" onClick={() => set({ chatOpen: true })}>
            Ask a question
          </button>
        )}
        {s.chatOpen && <ChatPanel />}
      </div>
      {s.pickerOpen && <PersonaPicker />}
    </div>
  );
}

export default function App() {
  return (
    <AdvisorProvider>
      <Layout />
    </AdvisorProvider>
  );
}
