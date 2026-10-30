/** Low-volume, explicitly authorised live acceptance. No transfers, AI or memory jobs. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = 'https://parius.femdev.site';
if (!process.argv.includes('--authorised-live-fixtures')) {
  throw new Error('Requires --authorised-live-fixtures and explicit owner authorisation.');
}
process.loadEnvFile('.env.local');
const env = process.env;
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}
const dbOrigin = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).origin;
const started = new Date().toISOString();
const run = randomBytes(6).toString('hex');
const reportPath = `private-notes/security-live-${run}.json`;
const manifestPath = `private-notes/security-live-${run}-fixtures.json`;
await mkdir('private-notes', { recursive: true });
let requests = 0;
let cleaning = false;
// All HTTP traffic, including SDK/database requests, shares one sequential budget.
const limitedFetch: typeof fetch = async (input, init) => {
  // Reserve requests for revocation/sign-out/disablement even if an SDK retries unexpectedly.
  if (++requests > (cleaning ? 140 : 120)) throw new Error('Request budget exhausted');
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (![origin, dbOrigin].includes(url.origin)) throw new Error('Unexpected destination');
  await new Promise((resolve) => setTimeout(resolve, 150));
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: limitedFetch },
};
const service = createClient(dbOrigin, env.SUPABASE_SERVICE_ROLE_KEY!, options);
const actors: { id: string; db: ReturnType<typeof createClient> }[] = [];
const connections: { id: string; db: ReturnType<typeof createClient> }[] = [];
const projects: string[] = [];
const results: { id: string; status: 'passed' | 'failed' | 'blocked'; detail: string }[] = [];
async function record(id: string, body: () => Promise<string | void>) {
  try {
    const detail = await body();
    results.push({
      id,
      status: 'passed',
      detail: detail || 'Expected response and scoped state checks passed.',
    });
  } catch (error) {
    results.push({
      id,
      status: error instanceof assert.AssertionError ? 'failed' : 'blocked',
      detail:
        error instanceof assert.AssertionError
          ? 'Assertion failed; inspect the case before making a security claim.'
          : 'Request or fixture failed; not evidence of a passed control.',
    });
  }
  console.log(`${id}: ${results.at(-1)!.status}`);
}
async function rpc(
  db: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await db.rpc(name, args);
  assert.equal(result.error, null, `${name} control failed`);
  return result.data;
}
async function denied(
  db: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await db.rpc(name, args);
  assert.ok(
    result.error && ['42501', 'P0001'].includes(result.error.code),
    'Expected an actual permission/domain rejection, not missing schema or network failure',
  );
}
async function rows(db: ReturnType<typeof createClient>, table: string, project: string) {
  assert.ok(projects.includes(project), 'Only this run’s fixture IDs are permitted');
  const result = await db
    .from(table)
    .select('*')
    .eq(table === 'projects' ? 'id' : 'project_id', project);
  assert.equal(result.error, null);
  return result.data!;
}
async function actor(role: string) {
  const password = randomBytes(32).toString('base64url');
  const email = `security-${role}-${run}@example.invalid`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, 'Disposable auth fixture creation failed');
  assert.ok(created.data.user);
  const db = createClient(dbOrigin, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
  const result = { id: created.data.user.id, db };
  actors.push(result); // Track before sign-in so a partial setup is still disabled in finally.
  const signed = await db.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, 'Disposable actor sign-in failed');
  return result;
}
const proposal = (project: string) => ({
  p_project: project,
  p_title: 'Fictional security fixture',
  p_scope: 'One fictional page. No deliverables, real invoice or payment is requested.',
  p_amount: '100',
  p_currency: 'USD',
  p_decimals: 2,
  p_revisions: 1,
  p_expected_base: null,
});
try {
  await record('HTTP-01 unauthenticated MCP', async () => {
    const response = await limitedFetch(`${origin}/api/mcp`);
    assert.equal(response.status, 401);
    assert.ok(response.headers.get('www-authenticate'));
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  });
  await record('HTTP-02 unauthenticated worker and payment', async () => {
    for (const path of ['/api/internal/jobs', '/api/agent/payment']) {
      const response = await limitedFetch(`${origin}${path}`, { method: 'POST' });
      assert.equal(response.status, 401);
    }
  });
  await record('HTTP-03 transport headers', async () => {
    const response = await limitedFetch(origin);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.ok(response.headers.get('strict-transport-security'));
    return 'HTTPS response has nosniff, frame denial and HSTS. CSP and platform rate-limit settings are separate checks.';
  });
  await record('HTTP-04 small malformed OAuth request', async () => {
    const response = await limitedFetch(`${origin}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal((await response.json()).error, 'invalid_client_metadata');
  });
  const a = await actor('freelancer'),
    b = await actor('client'),
    c = await actor('outsider');
  for (const owner of [a, c]) {
    projects.push(
      await rpc(owner.db, 'create_project', {
        p_name: `Security fixture ${run}`,
        p_description: 'Authorised disposable access-control fixture. No money or provider jobs.',
        p_client_name: 'Fictional QA client',
        p_display_name: 'Fictional QA owner',
      }),
    );
  }
  const [project, foreign] = projects;
  const invite = randomBytes(32).toString('hex');
  await rpc(a.db, 'create_project_invite', { p_project: project, p_token_hash: invite });
  await rpc(b.db, 'accept_project_invite', {
    p_token_hash: invite,
    p_display_name: 'Fictional QA client',
  });
  await record('RLS-01 bidirectional foreign project reads', async () => {
    assert.equal((await rows(a.db, 'projects', project)).length, 1);
    assert.equal((await rows(b.db, 'projects', project)).length, 1);
    assert.equal((await rows(c.db, 'projects', foreign)).length, 1);
    assert.deepEqual(await rows(c.db, 'projects', project), []);
    assert.deepEqual(await rows(a.db, 'projects', foreign), []);
  });
  const message = {
    p_project: project,
    p_body: 'Fictional access-control control message.',
    p_key: randomUUID(),
  };
  await rpc(b.db, 'send_message', message);
  await record('RLS-02 outsider message read and write', async () => {
    const before = await rows(a.db, 'messages', project);
    assert.equal(before.length, 1);
    assert.deepEqual(await rows(c.db, 'messages', project), []);
    await denied(c.db, 'send_message', { ...message, p_key: randomUUID() });
    assert.deepEqual(await rows(a.db, 'messages', project), before);
  });
  await record('RLS-03 invite replay', async () => {
    await denied(c.db, 'accept_project_invite', {
      p_token_hash: invite,
      p_display_name: 'Fictional intruder',
    });
    const members = await rows(a.db, 'project_members', project);
    assert.deepEqual(new Set(members.map((m) => m.user_id)), new Set([a.id, b.id]));
  });
  const agreement = await rpc(a.db, 'propose_agreement', proposal(project));
  await record('ROLE-01 client cannot propose freelancer terms', async () => {
    const before = await rows(a.db, 'agreement_versions', project);
    await denied(b.db, 'propose_agreement', proposal(project));
    assert.deepEqual(await rows(a.db, 'agreement_versions', project), before);
  });
  await rpc(a.db, 'approve_agreement', { p_project: project, p_agreement: agreement });
  await record('ROLE-02 one approval cannot activate terms', async () => {
    assert.equal((await rows(a.db, 'projects', project))[0].active_agreement_id, null);
    await rpc(b.db, 'approve_agreement', { p_project: project, p_agreement: agreement });
    assert.equal((await rows(a.db, 'projects', project))[0].active_agreement_id, agreement);
  });
  const invoice = await rpc(a.db, 'draft_invoice', {
    p_project: project,
    p_agreement: agreement,
    p_title: 'Fictional QA — do not pay',
    p_amount: '100',
    p_due: null,
    p_milestone: null,
  });
  await record('RLS-04 private draft invoice', async () => {
    assert.equal((await rows(a.db, 'invoices', project)).length, 1);
    assert.deepEqual(await rows(b.db, 'invoices', project), []);
    assert.deepEqual(await rows(c.db, 'invoices', project), []);
  });
  await record('ROLE-03 client cannot issue invoice', async () => {
    await denied(b.db, 'issue_invoice', { p_id: invoice, p_network: null, p_recipient: null });
    assert.equal((await rows(a.db, 'invoices', project))[0].status, 'draft');
    await rpc(a.db, 'issue_invoice', { p_id: invoice, p_network: null, p_recipient: null });
    assert.equal((await rows(b.db, 'invoices', project))[0].status, 'issued');
  });
  const key = `parius_${randomBytes(32).toString('base64url')}`;
  const connection = await rpc(b.db, 'create_agent_connection', {
    p_project: project,
    p_label: `Security fixture ${run}`,
    p_hash: createHash('sha256').update(key).digest('hex'),
    p_request: null,
  });
  connections.push({ id: connection, db: b.db });
  const mcp = new Client({ name: 'parius-authorised-security-acceptance', version: '1' });
  try {
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
        fetch: limitedFetch,
      }),
    );
    await record('MCP-01 real HTTP tool read and bounded context', async () => {
      const tools = await mcp.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
        'payment_handoff',
        'payment_status',
        'project_context',
      ]);
      const result = await mcp.callTool({ name: 'project_context', arguments: {} });
      assert.ok(!result.isError);
      const text = JSON.stringify(result);
      assert.ok(text.includes(project));
      assert.ok(!text.includes(foreign));
      assert.ok(!text.includes(key));
    });
    await record('MCP-02 unavailable mutation tool and read-only payment', async () => {
      const before = await rows(a.db, 'payment_records', project);
      const result = await mcp.callTool({ name: 'release_final', arguments: {} });
      assert.equal(result.isError, true);
      const response = await limitedFetch(`${origin}/api/agent/payment`, {
        method: 'POST',
        headers: { 'X-Parius-Agent-Key': key },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await rows(a.db, 'payment_records', project), before);
    });
    await rpc(b.db, 'revoke_agent_connection', { p_id: connection });
    await record('MCP-03 revoked key rejected on fresh request', async () => {
      const response = await limitedFetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      assert.equal(response.status, 401);
    });
  } finally {
    await mcp.close();
  }
} catch {
  results.push({
    id: 'fixture-or-transport-setup',
    status: 'blocked',
    detail: 'Setup/transport did not complete. No dependent case is counted as passed.',
  });
} finally {
  cleaning = true;
  // Admin is only used for disposable identity creation/disablement, never to perform an attack.
  const cleanup: string[] = [];
  for (const connection of connections) {
    const result = await connection.db.rpc('revoke_agent_connection', { p_id: connection.id });
    cleanup.push(
      result.error ? 'Connection revocation needs attention' : 'Fixture connection revoked',
    );
  }
  for (const actor of actors) {
    await actor.db.auth.signOut({ scope: 'global' }).catch(() => {});
    const result = await service.auth.admin.updateUserById(actor.id, { ban_duration: '876000h' });
    cleanup.push(
      result.error ? 'Fixture account disablement needs attention' : 'Fixture account disabled',
    );
  }
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        run,
        actors: actors.map(({ id }) => id),
        projects,
        connections: connections.map(({ id }) => id),
        cleanup,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        origin,
        run,
        requests,
        maximumRequests: 140,
        results,
        cleanup,
        limitations: [
          'Dedicated fictional records only; original user projects were not read or modified.',
          'No payment transfers, provider jobs, load tests or independent review.',
          'Fixture records retained for evidence; accounts disabled and connections revoked.',
          'Request caps/slow streams tested locally; deployed rate-limit configuration is not established by low traffic.',
        ],
      },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      reportPath,
      manifestPath,
      requests,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      cleanup,
    }),
  );
}
