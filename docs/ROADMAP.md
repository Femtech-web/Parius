# Where Parius goes next

Parius starts with a practical problem: a freelancer and client need a clear record of what they agreed, how the work changed and what has been paid. The current product brings that record into one workspace and lets the freelancer carry confirmed lessons into later scope reviews.

The plan after the hackathon is to make that workflow dependable in ordinary client work, then extend it where real use exposes a gap. The items below are intended directions, not shipped features or fixed delivery dates. Priorities may change with user feedback.

## Make the existing journey dependable

The first priority is reliability across the complete freelancer/client journey. That means repeatable browser checks for invitations, proposal approval, milestone review, invoices and final downloads, alongside the existing domain and database tests. Hosted worker recovery, clear errors, account recovery and tested backup/restore procedures matter before adding more workflow options.

Payment screens should make the next action obvious for each person: whether a wallet needs reconnecting, a transfer is awaiting verification, or the freelancer needs to reconcile a receipt. Memory should explain queued storage and indexing without leaving people guessing. We will evaluate these changes with real users rather than assuming fewer clicks always means a safer flow.

## Catch gaps between delivery and payment

A completed milestone should help the freelancer see whether the work has been invoiced. Future work includes surfacing completed-but-unbilled work, clearer revision usage, and a closer connection between a new request and its proposed scope or price change. These indicators must come from project records, with uncertainty made explicit when the necessary facts have not been recorded.

Reminders should remain considerate and controlled. Optional notifications and scheduled follow-up suggestions could help a freelancer avoid missed commitments, while respecting quiet hours, client confirmations and explicit sending preferences. They are not permission to send messages or collect money automatically.

## Make remembered experience more useful

Today, confirmed lessons inform later scope reviews. Next, we want to evaluate which lessons help, which become stale, and which should stay within one project. Clear correction, exclusion and account-owner deletion workflows should grow alongside recall, not be added after more information is stored.

Possible extensions include applying explicitly confirmed communication preferences to follow-up drafts and carrying approved general preferences across projects. We will measure usefulness with realistic requests, checked citations and human feedback. Storing more memories or producing different wording is not enough to claim better decisions.

## Improve payment readiness

The implemented browser and agent walkthroughs use Sui Testnet payments. Mainnet readiness needs its own provider configuration, asset checks, wallet/sponsorship testing and controlled real-transaction acceptance. The current local MPP runner deliberately refuses Mainnet; deployment alone does not enable it.

We want to make payment status and reconciliation clearer while retaining exact amounts, transaction replay protection and a visible distinction between manual records and verified transfers. Additional networks or payout methods should follow demonstrated customer needs. Escrow, fiat cash-out and dispute resolution are not current product capabilities or commitments in this roadmap.

## Give agents useful, bounded access

The current MCP tools read a scoped project, and the MPP flow can settle one explicitly reviewed Testnet invoice request. Future tools could prepare a proposed change or private follow-up for review, with clear permissions, expiration, revocation and an audit trail.

Private memory access would require its own explicit permission model; connecting an agent must not silently expose personal lessons. Any broader payment automation would need reviewed spending limits, exact beneficiaries, recovery rules and independent verification before implementation. The human remains responsible for approving terms and releasing final work.

## Grow from observed demand

Small teams, recurring client relationships and more flexible delivery structures may become useful later. We will first learn where the existing two-person workspace helps and where it becomes limiting. The measure of progress is whether users can understand their commitments and finish a project with fewer misunderstandings—not how many tabs, integrations or automation options we add.
