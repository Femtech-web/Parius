# Developing Parius

Parius is one modular Next.js application. Keep shared project facts in the database, provider calls on the server, and interface components focused on presenting one part of the workflow. Avoid moving permission checks into the browser or letting AI output become authoritative project data.

## Where a change belongs

Put feature-specific validation, calculations, UI and operations in `src/features/<feature>/`. Shared amounts, project record types, history utilities, environment configuration and database clients remain in `src/lib/`. Provider adapters live in their feature's `server/` folder and use `server-only`; shared session, privileged database and Tatum transport adapters remain in `src/lib/server/`. Authenticated server actions load permitted records and invoke those adapters; database policies and lifecycle functions enforce the final transition.

Workspace coordinates the selected tab and shared dialogs. `AgreementTab` and `MilestonesTab` render their respective work. `PaymentsPanel` coordinates payment actions, while `useInvoiceHistory` owns invoice/history loading and pagination. Invoice draft and action-dialog components render their forms without taking ownership of the ledger or choosing payment amounts.

Keep action retry keys, human confirmation, pagination cursors and explicit file release intact when extracting code. A smaller file is only an improvement if its responsibilities become clearer and its behaviour remains correct. Prefer named props and existing domain types to a large untyped context object.

## Feature-based organisation

Parius is a feature-based modular monolith: one application, with related UI, hooks and domain logic grouped around the work they support. The folder structure follows ownership rather than the technical type of every file.

The main folders are:

```text
src/
  app/                     # Next.js routes, layouts and entry points
  features/
    agreements/
    conversation/
    milestones/
    payments/
      components/
      hooks/
      server/              # Server-only payment adapters and operations
    memory/
    agents/
    files/
    projects/              # Workspace composition, invitations and activity
    auth/
    marketing/
    documentation/
  components/ui/           # Shared controls without feature rules
  components/layout/       # Shared application shell
  lib/                     # Shared infrastructure and small utilities
```

Each feature contains only the folders it needs. `domain.ts` or other root files hold browser-safe rules; `components/` holds views; `hooks/` holds browser state; `server/` holds provider adapters and authenticated actions. The conversation feature owns scope analysis and message history. The payments feature owns invoices, receipts, follow-ups, wallets and checkout. The projects feature composes the workspace and its feature tabs.

Keep feature-specific code with its feature; keep database clients and provider transport shared where several features use them. A `server/` folder name alone provides no protection: retain `server-only` imports and authenticated boundaries. Action files use the file-level `use server` directive. Shared `ActionResult` is a type-only module in `src/lib/action-result.ts`; shared UI does not import a feature's server implementation. Route files compose features and retain their existing URLs.

Import concrete modules directly with `@/features/...`; scripts and tests use their corresponding source paths. Cross-feature composition is explicit rather than hidden behind a shared barrel. Avoid introducing empty folders, a generic service layer or a barrel that mixes server and browser exports. For later moves, update scripts and tests as well as route imports, and check client/server compilation with a production build. Folder grouping must not change permission checks or create services that need separate deployment.

## Run the checks

Use the pinned pnpm version in `package.json` and Node.js 22.8 or later. On a fresh checkout:

```bash
pnpm install --frozen-lockfile
pnpm fonts
pnpm exec next typegen
pnpm lint
pnpm typecheck
pnpm test
```

The GitHub workflow in `.github/workflows/ci.yml` runs these checks and a Webpack production build on pull requests and pushes to `main`. It uses read-only repository permissions and immutable action commits. It does not receive application credentials or execute real wallet payments. The font step needs access to Fontshare; failures there are installation failures, not evidence that the application tests failed.

For a local production build, stop your own development server first or build an isolated source copy so two processes do not share `.next`. Do not overwrite a running user's build directory. The [testing guide](TESTING.md) covers browser and two-account checks; passing CI does not replace those or verify deployed cron tasks. Configure branch protection separately if you want the quality job to be a required merge check.

## Diagnose memory failures

Server logs use the prefix `[parius.memory]`. A diagnostic contains an operation, stage, allowlisted error code, correlation ID and, for storage, validated memory/job IDs. It never includes a raw exception message, lesson body, lease token, private key or authorization header.

`configuration_missing` and `account_invalid` indicate setup problems. `authorization_failed` indicates a rejected provider credential or permission. `rate_limited`, `timeout` and `provider_unavailable` distinguish upstream failures. `provenance_mismatch` means returned owner/namespace evidence did not match. `job_failed` and `job_not_found` refer to the saved remote job. `unexpected` intentionally avoids guessing from arbitrary provider prose.

Use the stage to locate the failure: account validation, initial remember submission, saved-job status, or recall. Inspect a correlation ID with the corresponding worker request in hosting logs. Diagnostics do not change the existing progress and retry contract: a failed status check keeps its saved job for retry, and an untrusted blob never becomes ready. A log record is not proof that storage completed.

## Write readable SQL migrations

Never edit an already-applied migration to change production behaviour. Add a new, ordered migration for schema or lifecycle changes, and include tests covering its roles, stale state, retry and concurrency rules. Keep earlier migrations as an accurate record of what was applied.

In new migrations, use descriptive parameter names, consistent indentation, one statement per line, and multiline predicates for permission or lifecycle gates. Put row locks and role checks before writes. For a `security definer` function, set an empty search path, qualify objects, and explicitly revoke/grant execution as appropriate. Explain why a lock or uniqueness constraint is needed rather than repeating the SQL in a comment.

For example, write a permission gate as:

```sql
-- Fragment within a lifecycle function, before changing project records.
if private.member_role(p_project) is null then
  raise exception 'Project access required.';
end if;

if exists (
  select 1
  from public.agent_connections as connection
  where connection.project_id = p_project
    and connection.revoked_at is null
    and connection.expires_at > now()
) then
  raise exception 'Resolve the existing connection first.';
end if;
```

This is a formatting example, not a migration to run. Do not add a new function just to reformat an old one. Avoid changing lock ordering, authorization or transaction boundaries in a formatting-only patch.

## Keep product documentation accurate

Update the relevant user topic when an action or label changes, architecture when responsibilities change, and testing when a new invariant needs verification. Keep private operational notes and article/video preparation outside public product documentation. Future capabilities belong in the [roadmap](ROADMAP.md), clearly separated from features that work today.
