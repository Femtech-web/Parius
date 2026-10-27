# Claude hosted MCP connection — 27 October 2026

The tester connected Claude to `https://parius.femdev.site/api/mcp` using **No sign-in** and a private Authorization bearer header. Eight supplied screenshots captured between **14:55 and 14:59 Africa/Lagos** show the connection, tool approval, project lookup and permissions explanation.

## Observed result

Claude discovered `project_context`, `payment_handoff` and `payment_status`. After the user approved access, it called `project_context` twice and reported the demo project's approved agreement v1, included work, accepted milestone and 0.01 USDC invoice. The returned role was client. It separated recorded facts from suggestions and declined to invent a balance absent from the returned data.

Claude described the exposed tools as read-only and stated that they cannot send project messages, change agreements, read private memories or release files. That explanation is evidence of tool discovery and interpretation, not a live attempt to test every server permission.

## Payment information limitation found

The captured context returned invoice lifecycle status `issued` without reconciled receipt totals. The tester had previously confirmed paying, reconciling and downloading the final file. Lifecycle status alone does not establish an outstanding balance. Claude's suggestion that another payment might be needed should not be followed without checking the ledger.

The subsequent local fix adds `payment_status`, `received_atomic`, `manual_received_atomic`, `verified_received_atomic`, `remaining_atomic` and `surplus_atomic` from the same ledger view used by the dashboard. The original `status` remains the lifecycle status. These atomic amounts use the invoice's `decimals`. A deployed rerun is still required; these screenshots precede that fix.

## What this run establishes

This is a successful user-observed hosted Claude connection using a bearer header and two project-context calls. It does not establish OAuth acceptance, a Claude-executed MPP payment, live revocation enforcement, or Walrus recall through MCP. No payment tool call is shown. The separate funded Testnet MPP run is documented in [Testing](../../TESTING.md#recorded-live-agent-run--26-october-2026).

Original screenshots are retained in the ignored `private-notes/evidence/claude-2026-10-27/` folder because they include account details and unrelated chat titles. This public summary contains no connection key.

## Rerun after deployment

Use a valid connection and ask Claude:

> Call Parius project_context again with fresh data. For each invoice, show lifecycle status, payment_status, received, manually recorded, verified, remaining and surplus amounts, converting atomic strings using that invoice's decimals. Treat issued as a lifecycle state, not proof of debt. Do not make a payment or change anything. If totals are unavailable, say so rather than guessing.

For the reconciled demo invoice, confirm the result against Payments: **0.01 USDC received, 0.01 verified, 0 manual, 0 remaining, payment_status paid**. Preserve a new screenshot as the post-fix result; do not describe the original screenshots as showing those fields.
