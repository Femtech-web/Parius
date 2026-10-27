# Test one project from start to finish

Use fictional project content, two accounts and Sui Testnet. Automated tests check the rules; this walkthrough checks that the actual services and screens work together.

## Prepare

- Finish [Setup](SETUP.md), including all migrations and the local worker.
- Use `http://localhost:3000` throughout. Browser profile **A** is the freelancer; profile **B** is the client. Use different email accounts and different payment-wallet addresses.
- Keep `pnpm dev` running and `pnpm jobs:watch` in a second terminal.
- Create three small text files: `notes.txt` containing `Project reference notes`, `preview.txt` containing `Portfolio website preview`, and `final.txt` containing `Portfolio website final delivery`.
- Fund the client's Sui Testnet wallet with faucet SUI and Circle's Sui Testnet USDC. The freelancer wallet receives payment and does not need a balance just to receive.

Record passes and failures as you go. Do not use the fictional `/preview` route for these checks; it does not save actions.

## 1. Start and invite

**A:** sign in and create a project named **Website walkthrough**, with **Client or company name = Forma Studio** and **Project summary = A five-page portfolio website**. Click **Create project** and open it.

Click **Invite client**. Copy the generated link, or enter B's email and explicitly send the invitation. **B:** open that actual link in profile B, sign in, then click **Accept invitation**. Both accounts should see the same project and their correct role labels. No new invitation is needed just because B had to sign in first.

Send one message from each account. Each person's own messages should appear on the right. Refresh: the messages remain without duplicates.

**A:** click the logo, then **Open workspace**. Expect Projects without another sign-in. Opening `/login` while signed in should return to the workspace. Test sign-out later; it should prevent further protected-page access.

## 2. Agree on the work

**A:** in **Agreement → Propose terms**, use:

| Field                    | Value                                     |
| ------------------------ | ----------------------------------------- |
| Agreement title          | `Website walkthrough — portfolio website` |
| Total price              | `0.01`                                    |
| Currency                 | `USDC`                                    |
| Included revision rounds | `1`                                       |

Use this scope text:

```text
DELIVERABLES
Design and build five portfolio pages: Home, About, Work, Project detail and Contact.

INCLUDED
Responsive layouts, a contact form and one revision round.

OUTSIDE THIS SCOPE
E-commerce, product pages, shopping cart and checkout. Additional work requires a separately approved change proposal.

PAYMENT TERMS
Final files are released after client acceptance and payment of the final invoice.
```

Publish. Approve this exact version as A, then as B. Only after both approvals should version 1 become active.

**A:** click **Propose changes**, change the total to `0.12`, and publish. Version 1 must remain active. Inspect the differences as B, then **Reject proposal** as B, or **Withdraw proposal** as A. Do not activate version 2 in this walkthrough; later values use the approved `0.01 USDC` total. Active version 1 must not offer withdrawal/rejection.

## 3. Check scope and learn

**B:** send `Could we also add a shopping cart and checkout?`

**A:** click **Review scope** beneath that message. Expect an advisory scope result against agreement v1. Open **Why did Parius suggest this?** and check that the source quotes actually match the agreement and request. Using a suggested reply should fill an editable draft; it must not send automatically.

Open **Memory**. Confirm or edit the suggested extra-work lesson to:

> Before accepting an extra feature, ask for a separately priced change proposal.

Keep it scoped to this project. Refresh: there should be one confirmed lesson, not duplicate suggestions. Leave the worker running until it reaches **Stored on Walrus**, with storage evidence. Confirmation, waiting and indexing are intermediate states, not storage success.

Close and reopen the project. **B:** send `Can the website also include product pages?` **A:** review this new request. Check whether Walrus recalls the relevant lesson and whether the review cites it. Open **Compare suggestions** and run the paired comparison. Expect both complete panels with the same agreement/request context. Similar answers are acceptable. An unavailable provider or cooldown must be shown honestly; wait for the retry countdown rather than clicking repeatedly.

For a separate control check, correct or exclude a disposable lesson and request a new review. Old text must not be used as an active lesson. A permanent deletion request should show local exclusion with remote deletion pending, not claim immediate erasure from Walrus. These reviews and lessons must remain invisible to B.

## 4. Deliver a milestone and share a preview

**A:** in **Milestones → Add milestone**, use **Deliverable = Portfolio website delivery**, with a due date a few days ahead. Click **Start milestone**, then **Submit for review**.

In **Files → Upload file**, upload `notes.txt` as **Shared attachment**, then `preview.txt` as **Milestone preview** linked to **Portfolio website delivery**. **B:** download both, inspect the preview, then accept the milestone in **Milestones**. Only B should be able to accept or request changes.

Try a harmless unsupported file type and a file larger than 10 MB. Expect rejection without a ready shared file. Remove a disposable attachment and check that new downloads fail while other ready files remain available. Previously downloaded copies remain on your computer; an already issued signed URL can last up to 60 seconds. The worker should eventually clear any cleanup-pending state.

## 5. Issue an invoice and upload a locked final

**A:** in **Payments → Payment wallet**, connect and verify the freelancer's receiving wallet. Verify the real address before issuing. This ownership signature does not pay anything.

Click **Draft invoice** and enter:

| Field             | Value                                 |
| ----------------- | ------------------------------------- |
| Invoice title     | `Website walkthrough — final invoice` |
| Amount (USDC)     | `0.01`                                |
| Due date          | A few days ahead                      |
| Related milestone | `Portfolio website delivery`          |

Save the private draft. **B:** it must not be visible yet. **A:** click **Review & issue**, supply the freelancer's actual Sui receiving address, check **testnet**, then issue. **B:** refresh and check **0.01 USDC outstanding**. Reuse this invoice; do not create another full-price invoice.

**A:** upload `final.txt` as **Final deliverable** linked to that milestone and issued invoice. Choose **Client acceptance and linked invoice paid**. For the exact approved release clause, paste:

> Final files are released after client acceptance and payment of the final invoice.

Confirm the conditions match the agreement, then click **Upload locked final**. **B:** the final must not be downloadable. B can still pay the invoice; the lock controls the file, not payment.

## 6. Check manual records, promises and a follow-up

Payment history should load automatically beneath each issued invoice. Expect records, a loading/error state or **No payment records yet**, without opening a disclosure. Use **Refresh history** to update it and the earlier-record controls to page through longer histories.

**A:** on the invoice, click **Record received payment**. Use **Amount = 0.002 USDC**, today's received date and **Reference = Disposable ledger test**. This is a fictional manual entry; no funds move. Expect **0.002 received / 0.008 remaining**, clearly labelled manual. Click **Reverse manual record → Reverse record**. Expect **0 received / 0.01 remaining**, with reversal history preserved.

In **Promises & follow-ups → Record a reported promise**, enter **0.01 USDC** and tomorrow's date. **B:** open **Payment promise** and click **Confirm this promise**. Neither confirmation nor the promise changes the invoice balance or due date.

**A:** click **Draft follow-up**. Before editing, check that its invoice name, outstanding balance, due date and any promise attribution match the saved records. Expect **AI-assisted wording**, or an explicitly labelled template if AI assistance was unavailable. Edit it to `Hi, checking in on the 0.01 USDC final invoice. Please let me know when payment is sent.`, and save. Refresh to check persistence. **B:** no unsent draft should appear. **A:** click **Review & send**, check the confirmation box, then **Send follow-up** once. Both should see exactly one message under A's name. Retrying that same send must not duplicate it. If promise/receipt facts change before sending a draft, refresh and prepare a new draft when the old one is marked stale.

## 7. Pay and release

**B:** connect and verify the funded client wallet. Check it is the intended address on Testnet. Refresh: the previously authorized connection should restore without signing anything. If the wallet cannot restore, reconnect it; a saved ownership proof does not need repeating for that same address/network. On the invoice, click **Review & pay**. Review the recipient, network, token and `0.01 USDC` amount. Confirming these instructions alone must not move funds.

Continue to wallet checkout. First cancel a wallet prompt; no paid status should appear. Then intentionally approve one `0.01 USDC` test transfer. Review the fee option shown; use the available sponsored or self-funded path. Do not change the invoice amount to satisfy sponsorship.

Have Parius check the actual transaction through Tatum using **Check saved digest with Tatum**. A random or unrelated digest must not be credited. The **Already sent a transfer? (backup)** form is for pasting a transaction ID from an already-sent transfer. Skip it when the saved payment is already verified; neither verification action sends funds.

Finish the handoff explicitly:

1. **A:** click **Refresh history** on this invoice.
2. Find **Tatum matched · awaiting reconciliation**, then click **Review & reconcile receipt**.
3. Since step6 reversed the disposable manual entry, choose **No matching manual receipt**, then **Confirm receipt allocation**. If a real transfer was also manually recorded, select that matching active record for replacement instead; do not double-count it.
4. Expect **0.01 USDC received / 0 remaining / PAID**. Retry verification/refresh: it must not create another transfer or credit the receipt twice.
5. **A:** in Files, click **Release final**, check the conditions, tick the confirmation and click **Release final** in the dialog.
6. **B:** refresh Files, download `final.txt`, and verify its contents. Before acceptance, payment and release were all complete, that final must have remained unavailable.

Inspect Activity for the relevant shared project events. It must not expose A's private reviews or unsent drafts.

## 8. Finish the checks

Repeat key actions on a narrow/mobile viewport. Check keyboard access to tabs, selects, dialogs and help. Refresh on Payments and Files: the selected tab should remain open, with `tab=payments` or `tab=files` in the URL. Browser Back/Forward should restore previous tabs. Load earlier activity/messages/payment history where available and verify that totals do not depend on which page is loaded. Sign out and confirm protected pages require sign-in again.

Before release, repeat the relevant flow on the deployed app and confirm the scheduled worker progresses a real job with the local runner stopped. Local success does not prove deployed scheduling.

## Automated checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The SQL tests execute real migrations in embedded PostgreSQL with test authentication roles; they are not a hosted Supabase acceptance test. Signature tests exercise cryptographic checks, but do not approve a user's live wallet. Provider-backed behavior, actual email delivery, a real test transfer and the two-party final download still need the walkthrough above.

Record: **date/environment → passed steps → failed step and observed behavior → not tested yet**. Do not report the whole application passed from one successful screenshot or provider probe.

## Recorded Testnet walkthrough — 26 October 2026

This records the observed manual walkthrough, not a claim that every test above passed.

| Area                          | Observed evidence                                                                                                                                       | Status                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Project and client onboarding | Separate client accepted the invitation; both roles appeared in the project.                                                                            | Observed in user screenshots/reports.                                                                                        |
| Agreement versions            | Version 1 approved; a version 2 price change was published and withdrawn while version 1 remained active.                                               | Observed in user screenshots/reports.                                                                                        |
| Learning                      | Confirmed lesson reached Stored on Walrus through the Mainnet memory service; later review recalled/cited it; paired comparison displayed both results. | Observed in user screenshots.                                                                                                |
| Wallet setup                  | Client and freelancer used separate Sui Testnet addresses with ownership proofs. Client faucet balances were checked read-only.                         | Observed.                                                                                                                    |
| Manual ledger                 | Disposable manual entries are shown as reversed and distinct from blockchain receipts.                                                                  | Observed in user screenshots.                                                                                                |
| AI-assisted follow-up         | A private invoice follow-up displayed generated wording and saved invoice facts.                                                                        | Draft generation observed; later shared Activity shows a reviewed follow-up was sent.                                        |
| Real Testnet payment          | The `0.01 USDC` payment reached Tatum verified, then Receipt reconciled on the freelancer side.                                                         | Observed in the 12:19 and 12:24 screenshots.                                                                                 |
| Invoice settlement display    | Expected `0.01 received / 0 remaining / PAID` after reconciliation.                                                                                     | Confirm the invoice summary; the latest screenshot shows the reconciled receipt, not the summary.                            |
| Final release and download    | Freelancer releases the linked final; client downloads and checks it.                                                                                   | Freelancer release is visible in shared Activity; the client confirmed successfully downloading the final TXT after payment. |
| Remaining controls/deployment | Remaining access/duplicate/mobile checks and scheduled worker in deployment.                                                                            | Not fully accepted from current evidence.                                                                                    |

The full transaction ID and memory job/blob references remain visible in the app. Capture reviewed explorer links, storage references and the final download result with the demo evidence; no private account identifiers or secrets are required in this document.

## Before a Mainnet payment run

- Complete the Testnet handoff and remaining failure/access checks. Keep Testnet evidence labelled Testnet.
- Use a deliberately reviewed Mainnet environment: matching Sui network, Tatum endpoint/key, wallets and any Enoki sponsorship settings. Mainnet payments use real assets and fees.
- Create a fresh invoice/payment request with the intended Mainnet recipient and canonical USDC asset. Do not try to edit an issued Testnet invoice into a Mainnet one.
- The user explicitly approves the amount and wallet transaction. Repeat verification, reconciliation, balance and final-download checks.
- Record date, app deployment, network, amount, transaction explorer link, Tatum result, invoice result and release/download result. Mark failures and untested controls separately. No Mainnet invoice-payment run has been recorded here yet.

Before submission, separately verify at least ten completed Mainnet Walrus memories and demonstrate useful recall across sessions. These are memory-service requirements; they do not turn a Testnet invoice transaction into a Mainnet payment. See the current [event rules](https://thewalrussessions.wal.app/tatum-total-recall).

## Agent acceptance: MCP and MPP

Use a fresh disposable Testnet invoice. Do not repay the already reconciled walkthrough invoice. Follow [agent setup](SETUP.md#project-agents-mcp-and-mpp) for the exact configuration and execution command.

1. Create a **Read project only** key. Connect an MCP client and list its three tools. `project_context` must show only that project and role-visible invoices. It must not include personal memories, private AI reviews or file contents. Calling an unregistered send/release tool must fail. Revoke the key: the next tool call must fail too.
2. Fund a dedicated local agent wallet with **at least 0.01 canonical Testnet USDC and some Testnet SUI**. As client, verify that wallet's address and confirm a fresh **0.01 USDC** request. Create a key bound to that request. The local agent wallet is the sender; the freelancer's verified receiving wallet is the recipient.
3. Run `pnpm agent:payment --url http://localhost:3000` with that key. Expect HTTP 402-derived instructions showing the reviewed amount, token, recipient, sender binding and expiry. No payment must be sent in preview mode.
4. Run with `--execute` and the exact reviewed network, recipient, amount, request ID and one journal path. Expect one transaction and then **matched**, with a saved digest and MPP receipt. If Tatum is temporarily unavailable, retain the journal and retry the same request; do not make another transfer.
5. Retry with that same journal. Expect the saved result, no second transfer and no duplicate credit. Wrong wallet, altered amount/recipient, expired/revoked key, another request or a second digest must fail. These failures must never claim paid status.
6. As freelancer, refresh payment history, reconcile the matched receipt once, and check the exact invoice balance. Release the eligible final explicitly. As client, download and check it. Agent access must not perform either freelancer action.

Automated tests exercise the real MCP SDK and real suimpp proof credentials, cryptographic signatures, HMAC tampering, provider errors, SQL permissions, key expiry/revocation, invoice draft privacy and digest reservations. Settlement is simulated in the offline protocol tests. The separate hosted check tests Supabase and the running app without transferring funds. Record a real funded transaction separately before claiming an on-chain agent-payment demonstration.

### Recorded live agent run — 26 October 2026

A separate isolated QA project used a dedicated, user-funded Testnet wallet and a fresh **0.01 USDC** invoice. The user explicitly authorized that one payment and the bounded gas fee. No existing user invoice or wallet was used for execution.

- Hosted MCP discovery, the local stdio bridge, project context and payment handoff passed against the running app and applied Supabase migration 16.
- The HTTP 402 MPP challenge matched the reviewed sender, recipient, canonical USDC token, amount and expiry. The local runner used a real suimpp credential and Sui signature.
- The signed transaction was journaled before broadcast. [View the Testnet transaction](https://testnet.suivision.xyz/txblock/FyU8Vy52Dya6JyNBnxxXBAJGj3EZCsXz5qWfBu9vpkoh).
- Tatum matched the receipt. Freelancer reconciliation produced exactly **10000 atomic USDC units received / 0 remaining** on the QA invoice.
- Revoking the completed QA connection caused both MCP and MPP endpoints to return HTTP 401.
- Repeating reconciliation returned the same record. Re-running the same payment request returned the saved matched result; the ledger contained one Sui receipt, with no second transfer initiated by the retry.
- The offline suite passed **93 tests** at this checkpoint. Wrong proof, tampered challenge, read-only access, expiry/revocation, provider failure and replay checks are tested separately from the funded transaction.

This proves the recorded Testnet MCP/MPP payment path. It is not Mainnet agent acceptance or a claim that all deployed or final-download checks passed.

## Mainnet memory storage verification

The [recorded report](evidence/memory/mainnet-storage.json) contains ten completed Mainnet storage jobs with matching saved blobs and provider owner/namespace checks. This verifies storage independently of the UI status. It does not, by itself, establish that a later review used a lesson usefully.

With the local server credentials configured, rerun the read-only verifier for a project you administer:

```bash
pnpm exec tsx scripts/check-mainnet-memories.mts <project-uuid>
```

The command does not write memories or send funds. It exits unsuccessfully if fewer than ten distinct ready blobs are verified or a record fails verification. Add `--save` only after reviewing the lesson text for publication: that option replaces `docs/evidence/memory/mainnet-storage.json` with a report containing lesson text and storage references, without credentials.

## Record a fresh-session learning example

Use the existing two accounts and the project containing the confirmed lessons. Keep its active agreement, invoice and files unchanged. This check does not need another payment or another stored lesson.

1. As freelancer, confirm the relevant lesson says **Stored on Walrus**. For the recorded example, use the preference for one concise paragraph ending with one concrete next step.
2. Sign out and sign back in as the same freelancer. Reopen the project. This is the browser-session demonstration; opening an old review is insufficient.
3. As client, send a new demo request: `Could we add a members-only area where customers sign in? Please explain what we need to decide next.` Label it as a demo scenario when presenting it.
4. As freelancer, select **Review scope** on this new message. Open **Why did Parius suggest this?** and inspect **Confirmed lessons cited in this review**. Check the quotation against the stored lesson and its blob evidence.
5. Open **Review suggested reply**. Inspect the actual effect: does it respect the writing preference, offer a concrete next step and avoid inventing a price or approval? Keep the agreement unchanged; do not send the draft unless you intend to.
6. Run **Compare suggestions** once and expand its cited lessons and run details. Capture both replies and the relevant citation. Similar scope decisions are expected when the agreement already answers the scope question.
7. Save the request, agreement version, exact lesson quotation, both outputs, model/context details and screenshots. Report the useful effect specifically; do not claim general improvement from a wording change alone. If the relevant lesson is not recalled/cited or the preference is not followed, record that result rather than presenting the expected behaviour as observed.

The [fresh-process evidence](evidence/memory/fresh-process-review.json) already exercises the real recall and paired-review code against the stored project lessons. It shows a concise reply replacing a longer email while preserving the scope decision. That record is a separate integration check, not a recording of the sign-out/sign-in steps above.

For a client demonstration alongside this workflow, follow the [AI client guide](AGENT_GUIDE.md). Its MCP tools expose project context, not private Memory; do not present the external client's project summary as proof of Walrus recall.

### Recorded browser learning walkthrough — 27 October 2026

The tester reported completing sign-out/sign-in and supplied six screenshots of the new members-only-area request, its review, cited lessons, reply and paired comparison. The [browser evidence summary](evidence/memory/browser-review.md) records the visible results and their limits. Five lessons were recalled; two were cited, including the confirmed concise-reply preference. The comparison shows a multi-paragraph baseline email and a single-paragraph memory-enabled reply, with the same scope conclusion.

The visible source quotations and comparison checks support provenance, but one explanation overstates the agreement: it describes the members-only feature as explicitly listed outside scope although the displayed clause does not name it. Treat this as an explanation-quality issue, not a failed storage/recall check. Preserve the accurate conclusion as an inference from the listed deliverables and general additional-work clause. A rerun is required before presenting corrected wording as observed.

## Remote OAuth client acceptance

Apply migration `202610270001_agent_oauth.sql` and deploy the OAuth routes with the canonical public app URL. Follow the [client-by-client connection guide](AGENT_GUIDE.md#2-choose-your-ai-client) for the installed client rather than pasting a generic configuration into every product.

The automated OAuth tests exercise signed registration, exact callback validation, resource/scope binding, S256 PKCE, token encryption, issuer/audience/expiry validation, private code storage, atomic one-use exchange, outsider rejection and revocation. An official MCP SDK client completes discovery, dynamic registration and exchange against the protocol adapter. These checks use isolated data; they are not a claim that a particular ChatGPT, Claude, Codex or Cursor account has completed a live connection.

For a live check, start from the AI client's Connect/Sign in action, authenticate with the existing Parius account, choose one project and approve read-only access. Confirm that the project's agreement, milestone states and role-visible invoice amounts/statuses match Parius. The bounded context includes reconciled ledger totals for each visible invoice, but no receipt-by-receipt ledger. Check `payment_status` and `remaining_atomic` using the invoice decimals; lifecycle `status: issued` alone does not mean unpaid. If totals cannot be loaded, the tool fails rather than guessing. Revoke the connection in Parius and ask for a fresh tool call, which must fail authorization. Reconnect after one hour rather than expecting refresh tokens. OAuth read access does not authorize a payment; the existing one-request Testnet MPP procedure remains separate.

### Recorded Claude header connection — 27 October 2026

The [Claude connection evidence](evidence/agents/claude-connection.md) records successful hosted tool discovery and two project-context calls supplied by the tester. It also records the missing-ledger-summary issue found during that run and the exact post-deployment retest. This was bearer-header authentication, not OAuth acceptance.

## Testnet and Mainnet payment modes

Migration 18 adds a project payment network and a locked mode after first invoice issuance. Offline tests cover freelancer-only changes, client/outsider rejection, immutable mode after issuing or voiding an invoice, canonical Mainnet asset selection, cross-network invoice rejection, provider credential isolation and explicit Mainnet agent execution opt-in. Both Testnet and Mainnet MPP credential flows use the real SDK with simulated settlement.

For live Mainnet acceptance, configure both network providers as described in [Setup](SETUP.md#enable-testnet-and-mainnet-together), use a separate small Mainnet project and deliberately approve the exact real-funds transaction. Save its explorer link, Tatum match, reconciliation and any intended final download. A supported Mainnet code path or passing offline test is not evidence of a funded Mainnet transfer; existing funded evidence above remains Testnet.
