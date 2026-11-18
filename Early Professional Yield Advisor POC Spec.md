# Early Professional Yield Advisor: POC Spec

Nov 16, 2026 · @Michael

## Purpose and scope

The POC shows a chat agent that helps an early professional customer (under 40, income above $83,000) put idle cash into a better-yielding Chase product, with a ranked, personalized recommendation and a simulated one-step action.

It exists to answer three questions for the sponsors (Ann and Sean) and for legal review:

1. Does a ranked, personalized recommendation feel more useful than a product list?
2. How much disclosure will customers tolerate before they get personalized advice?
3. Does showing trade-offs and outside rates build trust or lose the sale?

**In scope**

- Existing Chase customers only, in the chat channel.
- Cash and yield products: Chase Savings, CDs, premium deposit, money market funds, Treasury bills.
- Two entry points: the customer asks, and a proactive nudge.
- Simulated customer profiles and transactions. No real customer data.
- Web prototype for demo on a laptop.

**Out of scope for this version**

- Non-customers and a public tool.
- Retirement accounts, portfolio allocation, and any advice beyond cash placement.
- The membership bundle and its high-yield savings account.
- Product changes such as instant availability of fund balances.
- The wealth-transfer and heir-planning work.
- Real account opening, real orders, real authentication.

## Decisions already made

| Decision | Choice | Why |
| --- | --- | --- |
| Advice depth | Personalized (path B from the Nov 13 meeting), with disclosures | Sean: a generic list is marketing. The disclosure experience is part of what we test. |
| Trade-offs | Every option shows its cons, and the screen shows what outside savings accounts pay | We do not want this to look like bait and switch. This segment checks the numbers. |
| Entry points | Both: the customer asks, and a proactive nudge | Bonus and tax season bring cash that customers may not ask about. |
| Ranking | Deterministic rules; the model only detects intent and writes the explanation | Legal can audit a rules table. They cannot audit a model's judgment. |
| Data | Simulated profiles and transactions | The prototype is built off the Chase network. |
| Platform | Web, single page, no backend | Fast to iterate and easy to demo from one laptop. |

## User flows

Both flows end in the same recommendation screen. They differ only in how the conversation starts.

### Flow A: the customer asks

1. The customer types a yield question in chat, in their own words. Examples: "do you have a high yield savings account", "where should I put my bonus", "what's your savings rate".
2. The agent detects yield intent and answers the literal question first. If they asked for a high-yield savings account, it says plainly that Chase Savings pays 0.01% and that there are other Chase options that pay more.
3. The agent offers to personalize: "I can rank these for your situation using your Chase accounts."
4. Disclosure and consent step (see Disclosures; two variants).
5. The agent reads the profile: balances, monthly inflow and outflow, state, existing accounts, card debt.
6. The agent asks at most two questions: how much to set aside (pre-filled with its estimate), and when the money is needed (anytime, a date within 12 months, or more than 12 months).
7. The agent shows ranked options. Each has a reason tied to this customer, the after-tax yield, the dollars per year, the trade-offs, and the number of steps to act.
8. Below the ranked options, the agent shows what top outside savings accounts pay on the same amount.
9. The customer picks an option. The prototype simulates the action: open a Self-Directed Investing account if needed, then place the order or open the CD.
10. Confirmation: what happened, when the money is available again, and how to reverse it.

### Flow B: proactive nudge

1. A trigger fires on the simulated data (see below).
2. The customer sees one dismissible card where chat starts: "You have about $X sitting in checking earning nothing. Want to see what it could earn?"
3. Accepting drops the customer into Flow A at step 4, with the amount pre-filled.
4. Dismissing suppresses nudges for that trigger for 90 days.

**Nudge triggers**

| Trigger | Rule |
| --- | --- |
| Large deposit | A single deposit at least twice the customer's typical paycheck (bonus, tax refund) |
| Idle balance | Checking balance above three times average monthly outflow for 60 days |
| Money leaving | Recurring transfers to a known outside savings or brokerage institution |

No nudge fires when the debt gate in the ranking logic applies. A customer carrying card debt should not be nudged toward a 3.5% product.

## Personas and simulated data

Five personas, each chosen because it should produce a different top recommendation. If two personas get the same answer, the ranking is not using the data.

| Persona | Profile | Cash position | Expected top result | Tests |
| --- | --- | --- | --- | --- |
| Priya, 31 | New York, NY. Salary $165,000. Has Self-Directed Investing with $22,000 in ETFs. | $48,000 in checking, no debt | Treasury or government money market fund | State-tax benefit changes the ranking |
| Devon, 27 | Austin, TX. Salary $95,000. No brokerage account. | $14,000 checking, $6,000 Chase Savings | Prime money market fund, with account opening as an extra step | Whether opening an account kills the recommendation |
| Elena, 36 | Columbus, OH. Salary $140,000. A $60,000 bonus just landed. Buying a house in nine months. | $82,000 in checking | CD or Treasury bill matched to the purchase date; premium deposit if eligible | Time horizon; large-deposit nudge |
| Jordan, 34 | Chicago, IL. Salary $210,000. | $4,000 checking; $11,000 revolving on a Sapphire card | No product. Keep the buffer and pay down the card. | The tool can say "don't move it" |
| Sam, 29 | San Francisco, CA. Salary $130,000. Unused Self-Directed Investing account. | $9,000 checking; sends $2,000 a month to an outside savings account | Government money market fund, shown honestly against the outside rate | Retention; money-leaving nudge |

**Data per persona** (one JSON file each)

- `profile`: name, age, state, estimated gross income, filing status (assume single unless stated).
- `accounts`: type, balance, and for cards the revolving balance and APR.
- `has_brokerage`: true or false, with holdings if true.
- `transactions`: six months, generated. Include payroll deposits every two weeks, rent or mortgage, card payments, subscriptions, everyday spending, and the persona's distinguishing event (bonus, outside transfers, interest charges).
- `external_links`: outside accounts the customer has linked, if any.

Derived values the agent computes and can show: typical paycheck, average monthly outflow, buffer, movable amount, estimated federal and state marginal rates.

## Product catalog

The catalog is one config file with an as-of date shown on screen. Rates are a dated snapshot, not a live feed. Values marked "verify" must be confirmed from Chase sources before the demo.

| Product | Type | Yield (snapshot) | Insured | Needs brokerage | Access |
| --- | --- | --- | --- | --- | --- |
| Chase Savings | Deposit | 0.01% APY | FDIC | No | Instant |
| Chase CD | Deposit | Verify by term | FDIC | No | Locked to term; early withdrawal penalty |
| Premium deposit | Brokered deposit | Verify rate, minimum and terms | Verify | Verify | Verify |
| Prime money market fund (MJLXX) | Fund | 3.54% 7-day yield, Nov 3 | No | Yes | About one business day |
| Government money market fund (MJGXX) | Fund | 3.46% 7-day yield, verify date | No | Yes | About one business day |
| Treasury money market fund | Fund | Verify ticker and yield | No | Yes | About one business day |
| Treasury bill | Security | Verify by term | Backed by the U.S. government | Yes | At maturity, or sell early at market price |
| Outside benchmark: top online savings | Comparison only | 4.20% to 4.40% APY | FDIC | n/a | Transfer of a day or more |
| Outside benchmark: well-known online savings | Comparison only | About 3.50% APY | FDIC | n/a | Transfer of a day or more |

**Fields per product**

`id`, `name`, `type`, `yield`, `yield_basis` (APY or 7-day yield), `as_of`, `minimum`, `insured`, `needs_brokerage`, `days_to_cash`, `locks_until_maturity`, `state_tax_exempt_share` (0 to 1), `steps_to_act`, `tradeoffs` (list), `disclosure_ids` (list), `source_url`.

The two benchmark rows are never ranked and never actionable. They appear in a separate comparison strip.

## Ranking logic

Ranking is a pure function of the persona data, the customer's two answers, and the catalog. The same inputs always give the same order. The model never changes the order.

**Step 1: gates.** Checked first. If one applies, the agent says so and shows no ranked products.

| Gate | Rule | Agent response |
| --- | --- | --- |
| Card debt | Revolving card balance with an APR above the best available yield | Paying down the card earns more than any option here. Show the dollar comparison. |
| Thin buffer | Checking balance below one month of average outflow | Keep the money where it is. Offer to check again after the next paycheck. |

**Step 2: movable amount.** Default is checking balance minus a buffer of 1.5 times average monthly outflow, rounded down to the nearest $500. The customer can change it.

**Step 3: eligibility.** Drop products whose minimum is above the movable amount, and products that lock money past the customer's stated date. If the customer said "anytime", drop anything that locks.

**Step 4: after-tax yield.** For each remaining product:

```latex
y_{after} = y \times \left(1 - t_{fed} - t_{state} \times (1 - e)\right)
```

where y is the product's yield, t\_fed and t\_state are the customer's estimated marginal rates, and e is the product's state-tax-exempt share. Annual dollars are the movable amount times the after-tax yield. Marginal rates come from a simple bracket lookup on estimated income and state. This ignores the federal deduction for state tax, which is fine for a prototype.

**Step 5: order.** Sort by after-tax annual dollars, highest first. When two products are within 0.10 points of after-tax yield, prefer the one with fewer steps to act, then the insured one.

**Step 6: outside comparison.** Run the two benchmark rows through the same formula and show them in the comparison strip with the dollar difference against the top Chase option.

**Worked example (illustrative rates).** Priya moves $30,000 and pays about 24% federal and 10% state and city tax. Assume the Treasury fund yields 3.40%.

| Option | Yield | After-tax yield | Dollars per year |
| --- | --- | --- | --- |
| Treasury money market fund | 3.40% | 2.58% | $775 |
| Prime money market fund | 3.54% | 2.34% | $701 |
| Outside: well-known online savings | 3.50% | 2.31% | $693 |
| Outside: top online savings | 4.30% | 2.84% | $851 |

The honest message for Priya: the Treasury fund beats the well-known savings accounts and keeps her money at Chase, and the highest-paying online banks would earn her about $76 a year more.

**Rule trace.** Every recommendation stores the gates checked, the inputs, and the numbers behind each rank. The demo can show this in a side panel for legal and compliance.

## Disclosures and trade-offs

The prototype builds the disclosure step two ways, switchable from the demo controls, so legal and test users can react to both. All disclosure wording in the prototype is placeholder text, labeled as such. Legal supplies the real language.

| Variant | How it works | What it tests |
| --- | --- | --- |
| Upfront | One screen before any personalized advice: consent to use account data, a plain statement that some options are investments and not deposits, and links to full documents | Whether a single gate causes drop-off |
| Progressive | General options first with no personal data. "Rank these for me" asks for data consent. Product-specific disclosure appears on the card when a brokered product is ranked. Full disclosure comes before the order. | Whether spreading disclosures out feels lighter, and whether legal accepts it |

Both variants record what was shown and accepted, with a timestamp, in the rule trace.

**Trade-offs shown on every card.** These are part of the recommendation, not fine print. Each card shows them at the same text size as the benefits.

| Product | Trade-offs the card must show |
| --- | --- |
| Chase Savings | Pays far less than every other option on this screen |
| CD | Money is locked for the term; early withdrawal costs interest; rate is fixed, so you miss any rise |
| Premium deposit | Minimum balance; terms to verify |
| Money market funds | An investment, not a deposit. Not FDIC-insured. Aims to hold $1.00 a share but can lose value. Yield changes daily. Takes about a business day to reach checking. Needs a brokerage account. |
| Prime fund, in addition | Holds corporate and bank debt, not only government debt. No meaningful state-tax benefit. |
| Treasury bill | Full value only at maturity; selling early can return less; needs a brokerage account |

**Outside comparison strip.** Always visible under the ranked options once advice is personalized. It names the category ("top online savings accounts"), the rate range, the as-of date, the customer's dollars per year at that rate, and what the customer would give up or gain by staying: one login, faster movement between cash and investments, FDIC insurance on the outside account.

## Screens

One page with a main area and a collapsible demo panel. Lay it out the way a signed-in online-banking site is laid out: a top navigation bar, an accounts overview as the landing view, and chat opening as a side panel over it, so the feature reads as part of a signed-in session and not a standalone tool. Style it as a conventional retail-bank site: a restrained blue, white and gray palette, a plain sans-serif typeface, account tiles as cards, generous white space, and no fintech-style gradients or playful illustration. No sign-in, enrollment or other authentication pages are needed; the prototype starts already signed in as the chosen persona. Use a placeholder brand with no bank's logo, name or wordmark, and keep a visible "Prototype, simulated data" label on every screen. Put all colors, type and spacing in one theme file so the firm's own design system can be applied later inside the firm's environment.

| Screen | Contents |
| --- | --- |
| Persona picker | Five cards: name, age, city, one-line situation. Picking one loads the data and resets the chat. |
| Account snapshot | Small header strip: accounts and balances for the chosen persona, so the audience can see what the agent sees. |
| Nudge card | Shown at the top of chat when a trigger applies. Headline with the dollar figure, "Show me" and "Not now". |
| Chat | Free-text input plus three suggested prompts. Agent messages, customer messages, and inline components for the steps below. |
| Disclosure step | Upfront variant: one panel with consent checkbox. Progressive variant: a short consent line, then per-card notices. |
| Two questions | Amount (pre-filled, editable) and timing (anytime, pick a date, more than 12 months) as inline controls, not typed answers. |
| Recommendation cards | One card per ranked option. Rank, product name, one-sentence reason for this customer, after-tax yield, dollars per year, trade-offs, steps to act, "Choose this". The top card is expanded; the rest are collapsed. |
| Comparison strip | Outside benchmark rates, dollars per year, and the difference against the top option. |
| Gate message | Replaces the cards when a gate applies. Shows the reasoning and the dollar comparison. |
| Action flow | Simulated steps: open Self-Directed Investing if needed (two screens at most), confirm amount, final disclosure, confirm. |
| Confirmation | What moved, the expected yield, when the money can be back in checking, and how to undo it. |
| Rule trace panel | In the demo panel: gates, inputs, per-product numbers, disclosures shown. |

## Build notes

**Structure.** A single-page web app with no backend. Four parts, kept separate so each can be replaced:

| Part | Responsibility |
| --- | --- |
| Data | Persona JSON files, the product catalog, tax bracket tables, placeholder disclosure text |
| Rules engine | Pure functions: derive cash-flow figures, check gates, filter, compute after-tax yield, rank, build the rule trace |
| Conversation layer | Detects yield intent, drives the step sequence, writes the explanation text |
| Interface | Screens listed above, plus the demo panel |

**Role of the model.** The model does two things only: classify whether a message is a yield question, and write the short explanation for each card. It receives the ranked result and the facts for that card and may not add numbers or products that are not in its input. Every figure on screen comes from the rules engine.

**Scripted mode.** The prototype must also run with no model call: keyword intent matching and template explanations filled from the same data. This keeps the demo working offline and gives a baseline to compare the model's wording against.

**Demo panel controls**

- Persona selector.
- Disclosure variant: upfront or progressive.
- Mode: model or scripted.
- Fire a nudge trigger on demand.
- Show or hide the rule trace.
- Reset.

**Configuration.** Rates, minimums, buffer multiple, tie-break threshold, nudge thresholds and tax tables all live in config files, not in code, so a rate change or a legal request is an edit to data.

**Reuse.** Check the heir-planning prototype for simulated-customer code that can be adapted for the data layer.

## Open questions and items to verify

**Facts to confirm from Chase sources before the demo**

- [ ] Premium deposit: rate, minimum, whether it needs a brokerage account, insurance status.
- [ ] Current CD rates by term, including relationship rates.
- [ ] The money market fund lineup available in Self-Directed Investing, with tickers, current yields and minimums.
- [ ] Treasury bill yields by term and how a customer buys one online.
- [ ] How long a fund sale takes to reach Chase checking, including the daily cutoff time.
- [ ] The state-tax-exempt share of income for each government and Treasury fund, and which states set a minimum threshold before any of it is exempt.

**Questions for Ann and Sean**

- [ ] Can the comparison strip name outside banks, or only the category?
- [ ] Is estimating a customer's tax bracket from payroll deposits acceptable, or should the agent ask?
- [ ] What does the chat platform expose today for intent detection and for inserting interactive components?
- [ ] Should the nudge appear only in chat, or also on the app home screen?
- [ ] Who decides the buffer rule and the debt gate: product, or legal?

**Questions for Michelle (legal)**

- [ ] What is the minimum disclosure before the agent may say "this is the best fit for you"?
- [ ] Is the progressive variant acceptable in principle?
- [ ] Does showing an outside rate create any obligation or risk?
- [ ] Does the debt gate ("pay down your card first") count as advice that needs its own disclosure?

## Demo acceptance checklist

The first draft is ready to show when all of these are true.

- [ ] All five personas load and each produces a different top result, matching the personas table.
- [ ] Jordan gets the debt-gate message and no product cards.
- [ ] Typing "do you have a high yield savings account" starts Flow A, and the agent states the Chase Savings rate plainly.
- [ ] Elena sees the large-deposit nudge; Sam sees the money-leaving nudge; Jordan sees none.
- [ ] Both disclosure variants work and can be switched without reloading.
- [ ] Every card shows trade-offs at the same size as benefits.
- [ ] The comparison strip shows outside rates and the dollar difference for every persona who gets ranked options.
- [ ] Changing the amount or the timing re-ranks immediately.
- [ ] The simulated action completes for a customer with a brokerage account and for one without.
- [ ] The rule trace shows the inputs and numbers behind each rank.
- [ ] Scripted mode runs the full flow with no model call.
- [ ] Every rate on screen shows its as-of date, and the page is labeled as a prototype with simulated data.
