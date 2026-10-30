# Request-body hardening verification — 30 October 2026

Following the earlier 111-check baseline, source review identified OAuth/MCP routes that relied on declared Content-Length or read the entire body before rejecting it. An omitted or false header did not give a dependable memory bound. This was a source finding; no exhaustion attack was run against the live service.

The new [bounded reader](../../../src/lib/request-body.ts) counts actual UTF-8 bytes and applies a five-second total read deadline. OAuth registration accepts at most 8 KiB; token exchange and authenticated MCP POST accept at most 16 KiB. Limit, timeout and malformed-input responses use stable codes and prohibit caching. MCP still authenticates before reading its body. These are selected request-body safeguards, not comprehensive IP/identity rate limits or protection against all upstream buffering and resource exhaustion.

The [reader tests](../../../tests/request-body.test.ts) exercise missing, dishonest and excessive Content-Length, exact-limit input, multibyte boundaries, malformed UTF-8, and a stalled stream whose cancellation also stalls. The [MCP regression](../../../tests/agents.test.ts) runs the official HTTP client against the SDK server through the bounded-read/reconstructed-request path, checking initialization, discovery and project reads. It does not replace a post-deploy authenticated check of the Next route.

Verification completed locally on Node v23.5.0 with pnpm 10.30.2:

| Check | Result |
| --- | --- |
| `pnpm test` | 116 passed, zero failed/skipped/cancelled; 16,992.084083 ms reported. |
| `pnpm lint` | Exit 0. |
| `pnpm typecheck` | Exit 0. |
| `pnpm build --webpack` | Exit 0; production compilation, type checks and prerender completed. |
| `git diff --check` | Exit 0 before the documentation follow-up. |

The source baseline is `a9c2a1decd2dbe82ac2af45b2f36a945cffa2b11` plus the accompanying uncommitted security changes. No applied migrations or credential values changed. Build-generated changes to `next-env.d.ts` were restored. Existing `.gitignore` and ignored marketing work were preserved.

**Not deployed in this run.** The [14-case live acceptance](2026-10-30-live.md) tested the existing deployment, independently of this local fix. Deploy the reviewed change and repeat a small authenticated MCP/OAuth positive and negative smoke check before claiming the new limits are live. Independent review and platform abuse-budget inspection remain outstanding.
