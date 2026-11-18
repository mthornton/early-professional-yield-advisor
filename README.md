# Early Professional Yield Advisor: POC

A single-page web prototype with no backend, built from `Early Professional Yield Advisor POC Spec.md`. All customer data is simulated.

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm test           # rules engine + conversation tests (acceptance checks for personas, gates, nudges)
```

**Model mode** calls OpenRouter from the browser. In the demo panel, choose *Model*, pick a model or type any OpenRouter model ID, and paste a key. The key is kept in memory only. You can also put `VITE_OPENROUTER_API_KEY=...` in an uncommitted `.env.local` file. Vite reads that file only at startup, so restart `npm run dev` after editing it. A key loaded this way survives page reloads; a pasted key does not. With no key, or when a call fails, the app falls back to scripted text, and the rule trace logs why.

In Model mode, any chat message except the first savings question goes to the model along with everything the app knows. That includes the profile, accounts, all transactions, derived figures (including spending by month), the product catalog, outside rate categories and disclosure text. The first savings question still starts the scripted Flow A. The ranking and the customer's answers are passed only after data consent, and the prompt keeps the model from ranking differently from the engine. Answers carry a "model answer" tag. Any figure the model calculated that isn't in the data is flagged on the message and in the trace (see `src/conversation/answer.ts`).

## Two interfaces

- **Chat:** the right-side panel, opened from **Chat** or **Ask a question**.
- **Cash options page:** opened from **Plan & track** in the top nav, the "Earn more on your cash" tile on Accounts, or **Interface** in the demo panel.
  1. The customer agrees to data use. The upfront or progressive disclosure variant applies here too.
  2. They review a form pre-filled from their accounts: amount, timing, the monthly outside transfer, state, income, and card balance and APR. Each field shows whether it still matches the account data or was changed by the customer.
  3. They choose **Show my options**. The ranked cards, outside comparison, gates and order steps are the same components the chat uses.

The two interfaces keep separate answers, consent and rankings. A simulated order from either one updates the shared account balances, and both interfaces (and the rules engine) then see the new balances. Page events appear in the event log with a "Page:" prefix. The rule trace follows whichever interface is in front.

## Where things live

| Part | Files |
| --- | --- |
| Data | `src/data/catalog.json` (rate snapshot, as-of dates, `verify` notes), `config.json` (buffer, tie-break, nudge thresholds, model list), `taxTables.json`, `disclosures.json` (placeholder text), `personas/*.json` |
| Persona generator | `scripts/generate-personas.mjs`. Deterministic; regenerate with `npm run gen:personas`. |
| Rules engine | `src/engine/`: pure functions (`derive.ts`, `rank.ts`, `nudges.ts`, `tax.ts`) |
| Conversation layer | `src/conversation/`: keyword intent, templates, OpenRouter client, and a number guard that rejects model text containing figures not in its input |
| Interface | `src/ui/`. All colors, type and spacing are in `src/styles/theme.css`. |

## Decisions that differ from the spec text (agreed 2026-11-16)

- Rates were looked up on 2026-11-16, and each product shows its own as-of date. Anything still unconfirmed shows a "Verify before demo" line on its card.
- Sam's expected top result is the Treasury money market fund on a monthly redirect of his $2,000 outside transfer. Priya's is a lump sum in the same fund.
- Devon's Chase Savings balance counts as movable.
- Copy uses real Chase product names. There is no Chase logo or visual identity.

## Known simplifications

- Federal and state rates come from a simple bracket lookup on gross income, single filer.
- The tie-break rule (within 0.10 points, prefer fewer steps, then insured) can place a lower-dollar option above a higher one. For Elena, the 8-month CD ranks above the Treasury money market fund. The card and the trace both note when this happens.
- T-bill dollars are annualized even when the bill matures sooner.
