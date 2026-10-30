# Independent security review brief

Parius coordinates a freelancer and client around approved work, invoices, private files and confirmed AI lessons. Review the [threat model](../THREAT_MODEL.md) first, then the [security testing guide](SECURITY_TESTING.md) and [recorded live acceptance](evidence/security/2026-10-30-live.md). These maintainer-run results are inputs to a review. They do not establish independent assurance.

## Review target

Baseline source: `a9c2a1decd2dbe82ac2af45b2f36a945cffa2b11`. Security documentation and bounded-body changes currently accompany that baseline as local changes. Before commissioning a review, commit the final checkout and give the reviewer its exact revision and diff. Do not present a moving branch or the old baseline as the final audited version.

Start with source and isolated tests. The live target is [Parius](https://parius.femdev.site), but this brief grants no third-party authorisation to scan it, create load, inspect customer data or move money. Agree the review window, test identities, request budget and permitted actions with the owner first. A separate staging environment is preferable; the narrowly scoped owner-authorised acceptance run is described in its own report.

## Payments

Read [payment domain and receipt rules](../src/features/payments), [agent payment protocol](../src/features/agents/payment.ts), [agent access](../src/features/agents/server/access.ts), the [HTTP payment endpoint](../src/app/api/agent/payment/route.ts), and migrations 5–7, 16 and 18 in [migration history](../supabase/migrations).

Check that the sender, recipient, exact atomic amount, network, canonical asset and request expiry remain bound from review through signing, provider verification and reconciliation. Examine retries, competing submissions, stale leases and transaction reuse across invoices/projects. A matched transfer must not become invoice credit twice or release a final without the intended human action. Testnet and Mainnet totals must remain distinct. Manual receipts must not be described as blockchain verified.

## OAuth and external agents

Read [OAuth primitives](../src/features/agents/oauth.ts), [server configuration](../src/features/agents/server/oauth.ts), [OAuth routes](../src/app/oauth), [MCP route](../src/app/api/mcp/route.ts), [tool definitions](../src/features/agents/mcp.ts) and migration 17.

Check callback registration, client identity, S256 verifier, resource/audience and scope binding; code lifetime, atomic one-time exchange and replay; token expiry, revocation and membership changes; and failure responses. Confirm that tool descriptions match server-enforced capabilities. Evaluate Origin/Host handling and browser/non-browser transport separately. The current OAuth signing/encryption material derives from the service-role key: review the blast radius and a safe rotation/separation plan. Review the new byte/deadline limits without assuming they provide rate limiting.

## Database and files

Read all [migrations](../supabase/migrations), especially security-definer functions, grants, search paths, private-schema exposure, invoker views and restrictive storage policies. Use normal freelancer, client and outsider sessions for tests. Service-role success or failure is not a test of RLS.

Check foreign project IDs, direct table writes, private drafts/reviews/lessons, stale agreement approvals, role transitions and service-only completions. Review [file actions](../src/features/files/server/file-actions.ts) and the [download route](../src/app/api/files/[id]/route.ts): path ownership, completion validation, current release rules, ledger reversal, agreement replacement and signed-URL lifetime. Previously downloaded copies cannot be recalled.

## Deliverable and remaining work

For each finding, request a minimal private reproducer, affected revision, impact, required attacker privileges, expected and actual outcomes, and mitigation. Include a positive control and verify database side effects. Separate verified findings from hypotheses and configuration questions. Record unresolved items and retest fixes before closing them.

The owner still needs to select a reviewer and private reporting channel. No reviewer has been contacted and no independent audit is claimed. Share source and this brief first; never send production service-role keys, wallet secrets or unrestricted database access. Hosted provider budgets, firewall settings, credential rotation and backup restoration also require owner-visible configuration evidence rather than assumptions from a passing test suite.
