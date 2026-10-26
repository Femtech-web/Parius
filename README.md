# Parius

Freelancers can end up doing work they never priced and chasing payments they thought had already been agreed. An extra request is accepted in chat, a payment date is promised on a call, and feedback arrives in another thread. By the time the work is ready to hand over, the freelancer has to piece together what changed, what the client approved and what is still owed. Asking for the extra payment can then become a difficult conversation about decisions neither person has clearly recorded.

In [one freelancer’s account from our research](https://www.reddit.com/r/freelance/comments/1ozc3zq/), a $2,000 landing page grew from 20 to 43 hours while the payment stayed the same. A shared record of the original scope and each approved change would give both people something concrete to return to before more work begins.

Parius brings that record into a shared workspace for the freelancer and client. Their conversation sits beside the approved agreement, milestones, files and invoices. The freelancer can check a new request against the agreement and prepare a clear reply before accepting more work. Payment promises stay beside the invoice, follow-up drafts use the recorded balance, and final files are released when the agreed conditions are met.

Useful decisions can carry into later work too. Parius suggests lessons from eligible scope reviews, and the freelancer confirms, edits or dismisses them. Confirmed lessons are stored through Walrus Memory and recalled in relevant later reviews, including after a new session, so the freelancer does not have to explain the same preference each time.

**Working proof:** confirmed Mainnet Walrus storage and recall, a two-account Sui Testnet payment and successful final-file download, and a separate **0.01 USDC Testnet agent payment through MPP**, checked by Tatum and reconciled without duplicate credit. See the [recorded acceptance evidence](docs/TESTING.md#recorded-live-agent-run--26-october-2026).

## How a project works

1. **The freelancer starts a project and invites the client.** They can copy a private invitation link or email it. The client signs in with Google or email, then accepts the invitation. They do not need a wallet to join or collaborate.
2. **They discuss the work in Conversation.** Both can send messages. Once an agreement is active, the freelancer can click **Review scope** on a request. Parius compares that message with the agreement and relevant confirmed memories. The review and reply draft are private to the freelancer.
3. **The freelancer proposes the agreement.** It describes the deliverables, included work, exclusions, price, revision rounds and payment terms. Both people must approve the same version before it becomes active. The client can reject a pending proposal or discuss changes; the freelancer publishes the revised version. The existing agreement stays active until both approve its replacement.
4. **The freelancer breaks delivery into milestones.** Each milestone can have a due date, preview files, final files and a related invoice. The freelancer starts and submits the milestone; the client accepts it or requests changes. Milestones can also be planned before agreement approval, but planning does not change the agreed scope or authorize payment.
5. **The freelancer shares files and issues invoices.** Shared attachments and previews are available to both people. Final deliverables can stay locked until the agreed conditions are met. Invoice drafts are private; issuing an invoice makes it visible to the client. Invoice totals cannot exceed the approved project price.
6. **The client pays, and the payment is checked.** For Sui USDC, the client connects and verifies a wallet, reviews the payment and signs the transaction. Tatum checks the blockchain evidence. The freelancer reconciles the verified receipt with the invoice. Payments received elsewhere can be recorded manually and remain clearly labelled as manual.
7. **The freelancer releases the final files.** With the required milestone acceptance and any linked invoice payment recorded, the freelancer explicitly releases the final. The client can then download it. A locked file does not stop the client from paying its invoice.
8. **Parius keeps the history and the useful lessons.** Activity records shared project events. Memory lets the freelancer confirm, edit, dismiss, correct or exclude lessons that may help with later requests.

A freelancer can withdraw a pending proposal; a client can reject it. An active or previously active agreement cannot be withdrawn or rejected. Changes need a new version and fresh approval from both people.

## Help with replies and payment follow-ups

Parius helps with the conversations that are easy to put off:

- **Respond to extra work.** A scope review can draft a reply explaining what falls outside the agreement and suggesting a separate proposal. Use the reply draft, adjust it in the message composer and send it when ready.
- **Follow up on an invoice.** Open **Promises & follow-ups → Draft follow-up**. Parius prepares a private message using the recorded outstanding balance, due date and any payment promise, with AI-assisted wording. Edit it, save it, then review and explicitly send it into the project conversation under your own name.
- **Keep the facts straight.** AI does not choose the amount owed or invent a payment promise. If invoice or promise facts change, the old follow-up needs refreshing. Retrying the same send does not post the message twice.

For example, instead of starting a payment reminder from a blank box, the freelancer gets a draft that names the invoice, states the recorded balance and asks when payment can be expected. The client cannot see the draft until it is sent. If AI wording is unavailable, Parius labels the template fallback.

## What the memory is for

Suppose the agreement covers a portfolio website and excludes e-commerce. The client asks for a shopping cart and checkout.

The freelancer requests a scope review. Parius points to the exclusion in the agreement and suggests discussing a separate change proposal. From that review, it can suggest a lesson:

> Before accepting an extra feature, ask for a separately priced change proposal.

The freelancer can edit and confirm that lesson, or dismiss it. Confirmed lessons go through Walrus storage and indexing. A later review recalls relevant stored lessons and can use them when suggesting a response—even after a new session.

- **Why did Parius suggest this?** shows the agreement, request and any confirmed lessons cited by the review.
- **Memory** shows suggested and confirmed lessons, their storage state and available storage evidence. Lessons default to this project; the freelancer must explicitly choose a general preference for use across their projects.
- **Compare suggestions** runs two fresh reviews with the same agreement, request, model and settings. The only changed input is recalled historical lessons. Similar answers are valid; a wording difference alone does not prove an improvement.

Walrus is the persistent memory service, not a bot continuously reading the chat. Scope reviews are requested by the freelancer. The current automatic lesson suggestions come from completed scope reviews that identify extra work or ambiguity; this is not unrestricted extraction of every conversation detail.

## Files, invoices and promises are different things

| Item              | What it means                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Shared attachment | A reference file both project members can download.                                               |
| Milestone preview | Work the client can download and inspect before accepting it.                                     |
| Final deliverable | The finished handoff file. Client downloads require the agreed conditions and freelancer release. |
| Invoice           | The amount being requested, based on an approved agreement. It can relate to a milestone.         |
| Payment promise   | A stated intention to pay an amount on a date. It never counts as received money.                 |
| Receipt           | A recorded payment, explicitly distinguished as manual or blockchain verified.                    |

For example: **share a preview → client accepts the milestone → client pays → freelancer reconciles the receipt → freelancer releases the final → client downloads**. An issued invoice can also be paid before milestone acceptance. Payment alone does not bypass the file's other conditions.

Manual receipt mistakes can be reversed from their history row. The original record remains in the audit trail and the balance is recalculated; reversing a record does not send a refund. Parius does not automatically send reminders or collect payments.

## What runs underneath

| Technology                                  | Its job in Parius                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Next.js, React, TypeScript and Tailwind CSS | The application and server endpoints.                                                            |
| Supabase                                    | Sign-in, project records, permissions, live messages and private file storage.                   |
| Groq                                        | Scope analysis and assisted follow-up wording.                                                   |
| Walrus Memory / MemWal                      | Storage and recall of confirmed lessons, using the Mainnet relayer.                              |
| Sui, dApp Kit and Enoki                     | Wallet ownership, user-signed USDC payments and supported gas sponsorship.                       |
| Tatum                                       | Independent Sui transaction verification.                                                        |
| Resend                                      | Explicit invitation emails; it can also supply SMTP for Supabase sign-in emails.                 |
| Supabase Cron                               | Calls the background worker after deployment to progress memory jobs and clean up removed files. |

The application uses Sui Testnet for the current payment walkthrough. Walrus Memory uses its Mainnet service separately. Google sign-in to Parius, an Enoki Google wallet and a Slush wallet are separate connections; using the same email does not make their wallet addresses interchangeable.

## Run locally

Requirements: Node.js 22.8 or later, pnpm 10.30.2, and `unzip` for the font download.

```bash
pnpm install --frozen-lockfile
pnpm fonts
cp .env.example .env.local
```

On a fresh checkout, fill in `.env.local` using [the setup guide](docs/SETUP.md), apply the SQL migrations in filename order, then start:

```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Use the same hostname throughout sign-in and testing. Do not overwrite an existing `.env.local`.

For an interface walkthrough, open [/preview](http://localhost:3000/preview). It uses fictional data and does not save actions or demonstrate live integrations. For real collaboration, configure Supabase and use two separate accounts.

For background processing, keep this running in a second terminal:

```bash
pnpm jobs:watch
```

## Verify the build

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The tests exercise agreement permissions, signatures, receipt accounting, private files, memory attribution, history pagination, background jobs and related failure cases. They do not replace the two-account, real-wallet walkthrough in [Testing](docs/TESTING.md).

## Current status and boundaries

The core collaboration, learning, file and payment flows are implemented. Live lesson storage, recall and paired comparisons have been exercised. On 26 October 2026, the two-account Sui Testnet walkthrough reached a `0.01 USDC` transfer checked by Tatum and reconciled by the freelancer. The shared Activity log shows the follow-up sent and final file released, and the client confirmed successfully downloading the final TXT after payment. Production deployment, scheduler activation and the remaining acceptance checks are still pending. See the [walkthrough and recorded evidence](docs/TESTING.md#recorded-testnet-walkthrough--26-october-2026).

## Testnet payment and handoff

After the client approves a transfer, **Check saved digest with Tatum** verifies its saved transaction ID. The separate **Already sent a transfer? (backup)** form accepts an ID copied from a wallet; it is not needed when the saved payment is already verified. Neither check sends another payment.

1. **Freelancer:** open **Payments**, then **Refresh history** on the invoice.
2. Find **Tatum matched · awaiting reconciliation** and click **Review & reconcile receipt**.
3. If there is no active manual receipt for that same payment, keep **No matching manual receipt** selected, then click **Confirm receipt allocation**. In our walkthrough, the disposable manual records were already reversed. If a real payment was also recorded manually, select that matching record so it is replaced rather than counted twice.
4. For the fully paid walkthrough invoice, expect **0.01 USDC received**, **0 remaining**, and **PAID**. Reconciliation records the payment against the invoice; it does not send money again.
5. In **Files**, choose **Release final**, review the conditions, tick the confirmation and click **Release final**. The milestone must already be accepted and any linked invoice condition satisfied.
6. **Client:** refresh Files and download the final deliverable.

The [complete Testnet test guide](docs/TESTING.md) starts with project creation and covers learning, files, manual receipts, promises, wallet payment and final handoff. Complete and record it before a Mainnet payment run. Walrus Memory already uses its Mainnet service; that is separate from moving invoice payments to Mainnet.

## Submission and next steps

For Total Recall, target Smart Agents for Real Life, with the confirmed learning loop also supporting the Best Walrus Memory prize. The [official rules](https://thewalrussessions.wal.app/tatum-total-recall), checked 26 October 2026, require Mainnet Walrus Memory writes, at least ten Mainnet memories, relevant Tatum RPC usage, a published learning/integration blog, a working demo and public repo. Submission includes a 2–3 minute video and closes **10 November 2026 at 17:00 UTC**. Integration and technical quality each carry 30%; creativity and presentation each carry 20%. These are requirements and judging criteria, not a promise of a prize.

Before submission:

- [ ] Review evidence for at least **ten useful completed Mainnet memories**, then demonstrate relevant recall in a fresh session. The 26 October app-record check found one completed lesson with storage references; this does not establish the ten-memory requirement.
- [x] Complete the paid final-file handoff: the client confirmed downloading the final TXT after payment and release.
- [ ] Finish the remaining two-account permission, failure and narrow-screen/keyboard checks in [Testing](docs/TESTING.md).
- [ ] Deploy the app, configure the production sign-in/wallet callbacks, activate the scheduled worker and prove a real job completes with the local runner stopped.
- [ ] Make the submission repository public after reviewing its contents. The configured GitHub repository was private at the 26 October check. Include the submission version, reproducible setup and reviewed evidence, with credentials and private notes excluded.
- [ ] Publish the integration/learning blog, record the **2–3 minute demo**, and complete the submission form with the required account/project identifiers and links.

The required Mainnet integration is Walrus Memory. A Mainnet invoice or agent payment is not listed as a separate requirement in the checked rules. If demonstrating one, use reviewed network/provider settings, a fresh invoice and an explicitly authorized real transaction. The supplied agent runner remains Testnet-only.

MCP connectivity and a bounded Sui MPP invoice-payment flow are implemented. They are optional additions to the currently verified event requirements. On 26 October 2026, a separate live agent run paid a fresh 0.01 Testnet USDC invoice through the MPP flow, passed Tatum verification and freelancer reconciliation, and returned the saved result on retry without a second transfer or credit. [Transaction evidence](https://testnet.suivision.xyz/txblock/FyU8Vy52Dya6JyNBnxxXBAJGj3EZCsXz5qWfBu9vpkoh). Notifications remain planned.

## Let an agent help with one project

In **Payments → Connect a project agent**, create a one-hour key. The agent can read that project's approved agreement, milestones, invoices and latest 30 messages through MCP. It cannot read personal memories or private AI reviews, send messages, change terms, reconcile payments or release files. Revoke the key whenever needed.

For a payment, the client first reviews one invoice request in Parius. They can then create a key limited to that request. A dedicated local Testnet agent wallet must match the reviewed sender. The payment runner previews the MPP challenge; it only signs and sends when given an explicit amount, recipient, network, request ID and execution flag. Parius receives the signed payment proof, checks the transfer through Tatum, and saves the matched receipt. The freelancer then reconciles it and explicitly releases the final file, as in the normal flow.

This uses **MPP's Sui `charge` method**, with the community suimpp client adapter. It does not implement x402. Wallet secrets remain in the local agent environment. See [agent setup](docs/SETUP.md#project-agents-mcp-and-mpp) and [agent acceptance tests](docs/TESTING.md#agent-acceptance-mcp-and-mpp).

## Product boundaries

Parius does not hold funds in escrow, resolve formal disputes, or automatically approve agreements, send replies, sign payments or release final files. AI advice does not change the shared project facts. Private scope reviews, follow-up drafts and memories are not shown to the client.

Requesting permanent memory deletion immediately excludes the lesson from Parius recall and redacts linked private content locally. Remote Walrus deletion remains pending account-owner handling; the app does not claim completed remote erasure.

## Documentation

The app includes [user documentation at `/docs`](http://localhost:3000/docs) and a shorter [Product guide at `/guide`](http://localhost:3000/guide). These explain the freelancer/client flow in plain language. The repository documents below cover setup, architecture and acceptance testing.

- [Setup and deployment](docs/SETUP.md): credentials, authentication, migrations, wallets and background scheduling.
- [Architecture](docs/ARCHITECTURE.md): where records live, permissions and the learning/payment paths.
- [Testing](docs/TESTING.md): a two-account walkthrough with concrete inputs and expected results.
- [Demo brief](docs/DEMO.md): the story, timing and verified evidence for the motion demo.

Source lives in `src/`, database changes in `supabase/migrations/`, operational helpers in `scripts/`, and automated checks in `tests/`. Satoshi is downloaded from Fontshare with `pnpm fonts`; the font binary is excluded from the repository and its supplied license must be retained.
