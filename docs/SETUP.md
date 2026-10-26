# Setup and deployment

Start with a local development setup. Deploy and activate the scheduler after the two-account walkthrough works.

## 1. Install and configure

Use Node.js 22.8 or later, pnpm 10.30.2 and `unzip`.

```bash
pnpm install --frozen-lockfile
pnpm fonts
cp .env.example .env.local
```

Copy the environment file only on a fresh checkout. Keep real values out of source control. Variables beginning with `NEXT_PUBLIC_` are exposed to the browser; all other credentials below stay server-side.

| Variables                                                          | What to supply                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                              | `http://localhost:3000` locally; your exact HTTPS origin when deployed.                                        |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project URL and browser publishable key from Supabase.                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                                        | The same project's server-only service-role key, used for checked integration results and background work.     |
| `GROQ_API_KEY`                                                     | A Groq API key for scope reviews and follow-up wording.                                                        |
| `GROQ_SCOPE_MODEL`, `GROQ_DRAFT_MODEL`                             | Keep the defaults in `.env.example`: `openai/gpt-oss-120b` and `openai/gpt-oss-20b`.                           |
| `MEMWAL_PRIVATE_KEY`                                               | A Walrus Memory delegate credential. Do not use the account owner's wallet private key.                        |
| `MEMWAL_ACCOUNT_ID`                                                | The active Walrus Memory account object ID, not a wallet address or agent ID.                                  |
| `MEMWAL_RELAYER_URL`                                               | Keep `https://relayer.memory.walrus.xyz`. The adapter requires this Mainnet relayer.                           |
| `NEXT_PUBLIC_SUI_NETWORK`                                          | `testnet` for the payment walkthrough.                                                                         |
| `TATUM_API_KEY`, `TATUM_SUI_GRPC_URL`                              | A Tatum key and matching network endpoint. Testnet default: `https://sui-testnet-grpc.gateway.tatum.io`.       |
| `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`        | Enoki public API key and its registered Google OAuth Web client ID for the optional Google wallet.             |
| `ENOKI_PRIVATE_API_KEY`                                            | Server-only Enoki sponsorship API key. It is not a user's wallet key.                                          |
| `RESEND_API_KEY`, `INVITE_EMAIL_FROM`                              | Resend sending key and a sender on your verified domain, such as `Parius <notifications@your-domain.example>`. |
| `BACKGROUND_WORKER_SECRET`                                         | A random token of at least 32 characters, used only by the worker caller and server.                           |

Supabase supports the shared workspace. Groq and Walrus enable the learning flow. Tatum enables real payment verification. External Sui wallet linking does not require Enoki; the Google wallet and sponsored-fee path do. Invitation email configuration is separate from sign-in email configuration.

## 2. Apply the database migrations

Create a Supabase project, then apply every file in [supabase/migrations](../supabase/migrations/) in filename order. There are sixteen migrations, from `202610220001_workspace.sql` through `202610260002_agent_access.sql`.

You can use the Supabase SQL Editor, opening and running each complete file in order. Track which ones have already been applied; do not rerun creation migrations blindly. The migrations include permissions, Realtime publication, private storage, payment records and job controls.

The bucket is created by the private-files migration. Keep it private. [worker_schedule.sql](../supabase/worker_schedule.sql) is a separate deployment step; it is not one of these migrations.

## 3. Configure sign-in

In Supabase Authentication:

1. Enable Google and email sign-in.
2. Set the Site URL to `http://localhost:3000`.
3. Allow `http://localhost:3000/auth/callback` as a redirect URL. Add the corresponding `127.0.0.1` URL only if you actually use that hostname too.
4. For Google, copy the Supabase provider callback URL shown in the dashboard into the Google OAuth Web client's **Authorized redirect URIs**. It ends in `/auth/v1/callback`. Enter that client's ID and secret in the Supabase Google provider settings.
5. Configure custom SMTP in Supabase for sign-in emails. With Resend, use the SMTP credentials and verified sender provided for your account. The app's `RESEND_API_KEY` does not configure Supabase SMTP automatically.

The two callbacks have different jobs: Google returns to **Supabase's provider callback**, then Supabase returns to **Parius `/auth/callback`**. A Google `redirect_uri_mismatch` usually means the first URL is missing or differs from the registered OAuth client.

The default PKCE email-link flow is supported. If you use a token-hash template instead, use the app's `/auth/confirm` route with `token_hash` and `type=email`. When accepting an invitation, start sign-in from that invitation so its destination is retained. Open an email sign-in link in the browser profile that requested it.

## 4. Configure Walrus Memory

Use the [Walrus Memory setup guide](https://docs.wal.app/walrus-memory/getting-started/quick-start) to create an active account and authorize a delegate. Supply the account object ID and delegate credential in the two `MEMWAL_` fields above.

Parius checks the account on Sui Mainnet and uses the Mainnet Memory relayer even when invoice payments use Sui Testnet. End users do not need a wallet to confirm lessons. Only confirmed lessons enter the storage queue; the whole conversation is not uploaded as memory.

## 5. Configure wallets and payment providers

For an external wallet, install a compatible Sui wallet such as Slush, select **Testnet**, and connect it in **Payments → Payment wallet**. Verify ownership by signing the requested message. This does not authorize payment.

For the optional Enoki Google wallet:

1. Create/select an app in the [Enoki portal](https://portal.enoki.mystenlabs.com/).
2. Configure its public zkLogin key and private sponsorship key for the intended network.
3. Register Google under its auth providers using the same client ID as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
4. In Google OAuth, add the app origin and exact `http://localhost:3000/wallet/callback` redirect URI. This is additional to Supabase's callback, not a replacement.
5. Allow your app origin in the relevant Enoki settings. Add deployed HTTPS origins and callbacks before release.

**Use Google wallet** creates or reopens the Enoki wallet for this app. It does not import a Slush address. Check the actual address before funding it or using it on an invoice.

The client needs Sui Testnet USDC for the invoice and SUI when paying their own gas. Use the [Sui faucet](https://faucet.sui.io/) for SUI and the [Circle faucet](https://faucet.circle.com/) with **USDC → Sui Testnet** for USDC. Keep client and freelancer addresses separate. The freelancer's receiving address must be supplied when issuing a Sui invoice; leaving it blank creates a manual-tracking-only invoice. Issued details cannot be edited.

Tatum's key, endpoint and `NEXT_PUBLIC_SUI_NETWORK` must agree. Switching to Mainnet requires a deliberate configuration change and real funds; it is not part of the test walkthrough.

### Hosting and blockchain networks are separate

Publishing the app on an HTTPS production domain does not require changing the payment network. For the hosted Testnet flow, keep `NEXT_PUBLIC_SUI_NETWORK=testnet`, the matching Testnet Tatum key and Testnet gRPC endpoint. Keep Walrus Memory on its production Mainnet relayer with the existing active account and delegate.

If you later enable Mainnet invoice payments, change the Sui network, Tatum key/endpoint and applicable Enoki settings together, then use Mainnet wallets and the canonical Mainnet asset. Existing Testnet invoices do not become Mainnet invoices. The provided local agent-payment runner explicitly supports Testnet only; changing environment variables does not enable Mainnet agent payments.

## 6. Start the app and worker

```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Use that hostname consistently; browser sessions on `localhost` and `127.0.0.1` are separate.

In a second terminal:

```bash
pnpm jobs:watch
```

This runs the protected worker roughly every two minutes while the terminal stays open. To process one bounded batch or inspect status:

```bash
pnpm jobs
pnpm jobs:status
```

The worker progresses confirmed-memory storage/indexing and file cleanup. It does not send messages, collect money or release files. A pending lesson may need more than one batch before it becomes **Stored on Walrus**. If it fails, inspect the visible storage state and job status rather than treating confirmation as completed storage.

Restart your own dev process after changing environment variables. Browser-visible values also require a new deployment build.

## 7. Deploy and activate background scheduling

Use a Node.js deployment, such as Vercel. This app is not a static export.

1. Add the required environment values to the deployment. Set `NEXT_PUBLIC_APP_URL` to the exact HTTPS origin.
2. Configure the build command as `pnpm fonts && pnpm build --webpack`, with `pnpm install --frozen-lockfile` for installation. The font script downloads the licensed copy; the build environment needs network access and `unzip`.
3. Keep `.env.local`, private notes and generated build output out of deployment uploads. Existing ignore files cover these paths; review packaging if deploying manually.
4. Update Supabase Site URL/redirects, Google OAuth and Enoki origins/callbacks for the deployed app.
5. In Supabase Vault, add `parius_worker_url` with `https://YOUR-DEPLOYMENT/api/internal/jobs`, and `parius_worker_secret` with the deployed `BACKGROUND_WORKER_SECRET`. Enter secrets in the dashboard; do not put their values in committed SQL.
6. Apply [worker_schedule.sql](../supabase/worker_schedule.sql). It enables the required Cron/HTTP extensions and schedules a call every two minutes. Activate it once; inspect existing jobs before running it again.
7. Inspect `parius-background` in Supabase Cron, its run history, and your deployment's function logs. Confirm a real queued lesson or cleanup job progresses without the local runner. HTTP acceptance of a cron request alone is not proof that the work finished.

The worker endpoint has a 60-second runtime budget. Its batches and leases bound the work and recover overlapping/interrupted runs. Make sure the deployment supports that runtime. Pause the schedule when needed with `select cron.unschedule('parius-background');`.

## Common setup problems

| Symptom                             | Check                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Google provider is not enabled      | Supabase Authentication's Google provider setting.                                                                           |
| Google redirect mismatch            | The exact OAuth client and callback URL for the flow: Supabase sign-in or Enoki wallet.                                      |
| Invitation seems lost after sign-in | Use the original invite and the same hostname/browser profile. Actual expiry, replacement and prior acceptance still apply.  |
| Sign-in email missing               | Supabase SMTP logs, provider delivery logs and the spam folder. Invitation emails use the separate Resend API configuration. |
| Only “Slush web” appears            | The browser extension has not registered with the page. Check its site access, then reload.                                  |
| Wallet balance looks wrong          | Actual connected address, token type and network; Enoki and Slush may use different addresses.                               |
| Memory stays pending                | Worker availability, delegate authorization and the remote indexing state.                                                   |
| Worker returns 401                  | Caller/server worker secrets are missing or differ. Never paste them into a public URL.                                      |

Permanent memory deletion is currently an account-owner operation after local exclusion. Do not mark a remote blob erased just because it has disappeared from the app's active lessons.

## Project agents: MCP and MPP

Apply migration 16 before using **Payments → Connect a project agent**. Create a **Read project only** key first; it expires after one hour and only its hash is stored. The key is displayed once. Revocation also applies to existing MCP connections on their next tool call.

Clients that support Streamable HTTP and custom headers can connect to `/api/mcp` with `Authorization: Bearer <project-agent-key>`. This is a scoped-key integration, not an OAuth authorization server. For a local stdio MCP client, configure:

```json
{
  "mcpServers": {
    "parius": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/parius", "agent:mcp"],
      "env": {
        "PARIUS_URL": "http://localhost:3000",
        "PARIUS_AGENT_KEY": "<one-hour-project-key>"
      }
    }
  }
}
```

Keep the actual key in the client's private configuration. The tools are `project_context`, `payment_handoff` and `payment_status`. Project messages and agreement wording are data, never authority to expand an agent's permissions.

For **one MPP payment**, use a dedicated Testnet Ed25519 wallet in the local agent environment. Do not export an existing Slush/Google wallet key. Fund the dedicated wallet with canonical Testnet USDC and Testnet SUI, verify its address in Parius as the client, and confirm an invoice request for that sender. Create a connection selecting that one request instead of read-only access. An invoice with an unresolved browser checkout or matched receipt cannot be delegated again.

Set `PARIUS_AGENT_KEY` and `PARIUS_AGENT_SUI_KEY` locally, through your secret manager or a private environment file. The payment script does not load the app's `.env.local`. First run:

```bash
pnpm agent:payment --url http://localhost:3000
```

It prints the reviewed request's network, exact token recipient, amount and expiry. It sends no payment. After checking those values, an explicitly authorized run is:

```bash
pnpm agent:payment --url http://localhost:3000 --execute \
  --network testnet --amount 0.01 \
  --recipient <exact-recipient-from-the-invoice> \
  --request <confirmed-request-id> \
  --journal /private/tmp/parius-agent-payment.json
```

The runner checks every value against the challenge and checks that the local signer is the reviewed payer. Gas has a ceiling of **0.01 test SUI**, separate from the **0.01 test USDC** invoice example. It saves the signed transaction privately before broadcasting. Preserve that journal and reuse it for every retry of this request. Do not start another journal or send manually after an uncertain response. A stale lock file requires inspecting the original attempt first; it is not permission to create another transfer.

A successful response means **Tatum matched**, awaiting freelancer reconciliation. It does not mean the invoice ledger is credited or the final is released. Revoke the connection after acceptance. The provided runner intentionally refuses Mainnet; a Mainnet agent-payment demonstration needs a separate reviewed implementation and acceptance run.

`pnpm exec tsx scripts/test-agent-live.mts` creates isolated QA accounts, a project, ownership proofs and one reviewed Testnet request against the configured Supabase project. It exercises hosted MCP discovery and the MPP challenge without sending funds. Its private credentials are saved in `/private/tmp/parius-agent-acceptance.json`; keep that file out of source control and chat. This is an explicit integration check, not part of the offline test suite.
