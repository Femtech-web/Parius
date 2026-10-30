# Adversarial source and database review — 30 October 2026

A second, independent-pass review tried to break Parius from source and against the real migrations. It found **five issues and fixed all five**, plus two hygiene gaps. Each fix has a regression test that fails on the previous schema or code and passes now. Nothing in this review touched the live deployment, real funds or production data.

## Method

- Read every externally reachable route (MCP, agent payment, OAuth, file download, worker, auth callbacks) and every server action that uses the service-role client.
- Read every SQL function an ordinary signed-in user can call, then attacked them in PGlite with all migrations applied **under Supabase's default privileges**. Supabase grants new `public` tables and functions to `anon` and `authenticated` unless a migration revokes them; the earlier harness did not model that, so a missing revoke could not fail a test.
- Ran each attack as a real role (`anon`, freelancer, client, outsider, service) and checked the resulting database state, not only the error.

## Findings and fixes

| # | Severity | Attack | What happened before | Fix | Regression test |
| --- | --- | --- | --- | --- | --- |
| F-1 | Medium | One account requests sponsored gas for many invoices it controls (it can be freelancer and client via two sign-ups). | 10 reservations used the entire shared 0.5 SUI / 48 h sponsorship pool. Every other user lost sponsored gas for 48 hours at no cost to the attacker. | Per-account cap of 2 unreleased sponsored reservations per 48 h; the message offers wallet-paid gas. | [supabase-hardening](../../../tests/supabase-hardening.test.ts) · *one account cannot exhaust…* |
| F-2 | Medium | Any signed-in user floods messages, projects, agreement versions, milestones, invites or payment requests. | No per-account limit on these six writes. A script could insert 6 KB messages as fast as PostgREST accepts them and fill the database. | Per-account minute/hour budgets in the database (e.g. 20 messages/min, 5 projects/min). Failed calls roll back and spend nothing; an outsider cannot burn a member's budget. | *per-account write budgets…* |
| F-3 | Low–Medium | An agent submits a transaction that does not match the reviewed payment. | The agent route recorded every verification failure as `provider_unavailable`. The claim stayed `retryable` forever, the agent was told to keep retrying, and `create_agent_connection` refused any new delegation for that invoice. | Agent and browser paths now share one classifier: definitive mismatches are `rejected` (HTTP 409); provider problems stay retryable (503). | [agents](../../../tests/agents.test.ts) · *a mismatched transfer is rejected definitively…* |
| F-4 | Low | A client checks a transaction that has executed but has no checkpoint yet. | `success: false` and "no checkpoint yet" shared one code, which the browser path treated as a final mismatch. A just-executed payment checked too early could be permanently rejected for that request. | `failed_transaction` (final) is now separate from `unsettled_transaction` (retryable). | Same agent test |
| F-5 | Low | The same transaction digest is claimed against two payment requests (browser path). | Both claims could reach `verified`. The ledger's unique `(network, digest)` still allowed only one credit, but the second invoice showed a verified receipt that could never be reconciled. The agent path already blocked this. | Claims for a digest already verified/credited elsewhere are refused (after the membership check, so the result reveals nothing to outsiders), and a partial unique index makes two simultaneous verifications impossible. | *a transfer matched to one payment request…* |
| H-1 | Hygiene | Write to `invoice_balances` as `authenticated`. | Write grants remained from Supabase defaults. Not exploitable: an aggregate view cannot be written. | Revoked; select only. | *Supabase default grants leave no…* |
| H-2 | Hygiene | Call workspace functions as `anon`. | Six early functions were executable by `anon`. Each rejected a missing user, so nothing happened. | Revoked from `anon`. The test now asserts that **no** `public` function is anonymous and no `public` table is client-writable or missing RLS. | Same test |

All database fixes are in [migration 202610300001](../../../supabase/migrations/202610300001_abuse_limits.sql). Application fixes are in [payment domain](../../../src/features/payments/domain.ts), [agent payment](../../../src/features/agents/payment.ts) and [payment actions](../../../src/features/payments/server/payment-actions.ts).

## Attacks that failed (no change needed)

- **Claiming someone else's payment.** Naming an unowned wallet as payer is refused; the wallet must have a signed ownership proof. Receipt matching requires exact sender, recipient, canonical USDC type, amount, request time window and exactly one debit/credit pair.
- **Signing something other than the reviewed payment.** The server compares the exact signed bytes and digest with the stored plan; a sponsor may change gas only.
- **OAuth.** Codes are single-use and bound to client, callback, resource and PKCE verifier inside one database transaction. OAuth tokens can never carry payment delegation. The consent page shows the callback origin.
- **Files.** No storage read policy exists for the bucket; restrictive policies block broader ones; each download rechecks membership, release and ledger.
- **Redirects and filters.** Login `next` accepts only internal paths. The one interpolated PostgREST filter uses a validated UUID behind RLS.
- **Worker.** Timing-safe secret comparison; job functions are service-only.

## Verification

Local, Node 23.5.0 / pnpm 10.30.2, on top of the uncommitted security changes described in the [hardening report](2026-10-30-hardening.md):

| Check | Result |
| --- | --- |
| New tests against the previous schema | 4 of 4 database tests fail, as expected |
| `pnpm test` (three runs) | 121 passed, 0 failed each run |
| `pnpm lint`, `pnpm typecheck` | Exit 0 |
| `pnpm build --webpack` | Exit 0 |

One earlier run in this session had a single failure that did not recur in eight later runs and could not be captured. It is recorded here rather than ignored.

## Not done by this review

- **Not deployed.** Migration 202610300001 must be applied to the hosted Supabase project and the app redeployed before these fixes are live. Then repeat a small hosted check: send a message, create an agreement, prepare one Testnet payment.
- The sponsorship cap raises the cost of exhaustion; it does not stop many sign-ups (Sybil accounts). Gas sponsorship stays optional and wallet-paid gas always works.
- Budgets are per account in the database. IP-level and platform rate limits were not reviewed.
- No independent audit, dependency-advisory scan or secret-history scan was part of this review.
