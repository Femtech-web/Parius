import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  authorizationRequest,
  decryptOAuthToken,
  encryptOAuthToken,
  hashOAuth,
  oauthRedirect,
  pkceChallenge,
  readOAuthClient,
  registerOAuthClient,
  tokenRequest,
} from '../src/features/agents/oauth';

const secret = 'isolated-oauth-test-secret-'.repeat(3);
const origin = 'https://parius.example';
function fixture() {
  const client = registerOAuthClient(
    { client_name: 'Example AI', redirect_uris: ['https://client.example/callback'] },
    secret,
  );
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: 'code',
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    resource: origin + '/api/mcp',
    state: 'client-state',
  });
  return { client, verifier, query };
}
test('OAuth registration and authorization pin client callbacks, S256 PKCE, resource, scope and issuer', () => {
  const { client, query } = fixture();
  assert.equal(readOAuthClient(client.client_id, secret).client_name, 'Example AI');
  assert.throws(() => readOAuthClient(client.client_id + 'tampered', secret));
  assert.throws(() => readOAuthClient(client.client_id, secret + 'other'));
  for (const uri of [
    'javascript:alert(1)',
    'https://client.example/cb#fragment',
    'https://u:p@client.example/cb',
    'http://client.example/cb',
  ])
    assert.throws(() => registerOAuthClient({ client_name: 'Bad', redirect_uris: [uri] }, secret));
  assert.ok(
    registerOAuthClient(
      { client_name: 'Loopback', redirect_uris: ['http://127.0.0.1:5555/callback'] },
      secret,
    ),
  );
  for (const [key, value] of [
    ['redirect_uri', 'https://attacker.example/callback'],
    ['resource', 'https://other.example/api/mcp'],
    ['scope', 'project:write'],
    ['code_challenge_method', 'plain'],
  ]) {
    const changed = new URLSearchParams(query);
    changed.set(key, value);
    assert.throws(() => authorizationRequest(changed, origin, secret));
  }
  const duplicate = new URLSearchParams(query);
  duplicate.append('state', 'second');
  assert.throws(() => authorizationRequest(duplicate, origin, secret));
  const request = authorizationRequest(query, origin, secret);
  for (const result of [{ code: 'example-code' }, { error: 'access_denied' as const }]) {
    const callback = new URL(oauthRedirect(request, origin, result));
    assert.equal(callback.origin, 'https://client.example');
    assert.equal(callback.searchParams.get('state'), 'client-state');
    assert.equal(callback.searchParams.get('iss'), origin);
  }
});
test('OAuth tokens are encrypted at rest and token exchange validates verifier syntax and grant type', () => {
  const token = 'parius_' + randomBytes(32).toString('base64url');
  const encrypted = encryptOAuthToken(token, secret);
  assert.ok(!encrypted.includes(token));
  assert.equal(decryptOAuthToken(encrypted, secret), token);
  assert.notEqual(encryptOAuthToken(token, secret), encrypted);
  assert.throws(() => decryptOAuthToken(encrypted, secret + 'wrong'));
  const bytes = Buffer.from(encrypted, 'base64url');
  bytes[30] ^= 1;
  assert.throws(() => decryptOAuthToken(bytes.toString('base64url'), secret));
  const { client, verifier } = fixture();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    code: randomBytes(32).toString('base64url'),
    code_verifier: verifier,
    resource: origin + '/api/mcp',
  });
  assert.equal(tokenRequest(form, origin, secret).code_verifier, verifier);
  for (const [key, value] of [
    ['grant_type', 'refresh_token'],
    ['code_verifier', 'short'],
    ['resource', 'https://other.example/api/mcp'],
  ]) {
    const changed = new URLSearchParams(form);
    changed.set(key, value);
    assert.throws(() => tokenRequest(changed, origin, secret));
  }
});
test('OAuth SQL grants one project read-only access; codes are private, bound, single-use and revocable', async () => {
  const db = new PGlite();
  const owner = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2)', [owner, outsider]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610230006_payment_checkout.sql',
      '202610260002_agent_access.sql',
      '202610270001_agent_oauth.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    async function asUser(user: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('set role authenticated');
    }
    async function service() {
      await db.exec('reset role;set role service_role');
    }
    async function value<T = string>(sql: string, args: unknown[] = []) {
      return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    }
    await asUser(owner);
    const project = await value(
      "select public.create_project('OAuth project','','Client','Owner') v",
    );
    const { client, verifier } = fixture();
    const challenge = pkceChallenge(verifier);
    async function grant() {
      const token = 'parius_' + randomBytes(32).toString('base64url'),
        code = randomBytes(32).toString('base64url');
      const encrypted = encryptOAuthToken(token, secret);
      const id = await value('select public.authorize_agent_oauth($1,$2,$3,$4,$5,$6,$7,$8,$9) v', [
        project,
        'OAuth Example',
        hashOAuth(token),
        hashOAuth(code),
        client.client_id,
        client.redirect_uris[0],
        origin + '/api/mcp',
        challenge,
        encrypted,
      ]);
      return { token, code, id, encrypted };
    }
    const first = await grant();
    const args = [
      hashOAuth(first.code),
      client.client_id,
      client.redirect_uris[0],
      origin + '/api/mcp',
      challenge,
    ];
    await assert.rejects(db.query('select * from private.agent_oauth_codes'), /permission denied/);
    await assert.rejects(
      db.query('select public.exchange_agent_oauth($1,$2,$3,$4,$5)', args),
      /permission denied/,
    );
    await asUser(outsider);
    await assert.rejects(grant(), /Project access required/);
    await service();
    for (const index of [1, 2, 3, 4]) {
      const changed = [...args];
      changed[index] = 'different';
      await assert.rejects(
        db.query('select public.exchange_agent_oauth($1,$2,$3,$4,$5)', changed),
        /Invalid or expired/,
      );
    }
    const outcomes = await Promise.allSettled([
      value<{ encrypted_token: string; expires_in: number }>(
        'select public.exchange_agent_oauth($1,$2,$3,$4,$5) v',
        args,
      ),
      value('select public.exchange_agent_oauth($1,$2,$3,$4,$5) v', args),
    ]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    const result = outcomes.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
      encrypted_token: string;
      expires_in: number;
    }>;
    assert.equal(decryptOAuthToken(result.value.encrypted_token, secret), first.token);
    assert.ok(result.value.expires_in > 3500 && result.value.expires_in <= 3600);
    const context = await value<{
      connection: { project_id: string; request_id: null };
      payment?: unknown;
    }>('select public.agent_context($1) v', [hashOAuth(first.token)]);
    assert.equal(context.connection.project_id, project);
    assert.equal(context.connection.request_id, null);
    assert.equal(context.payment, undefined);
    await asUser(owner);
    await db.query('select public.revoke_agent_connection($1)', [first.id]);
    await service();
    await assert.rejects(
      db.query('select public.agent_context($1)', [hashOAuth(first.token)]),
      /expired, revoked or invalid/,
    );
    await asUser(owner);
    const revoked = await grant();
    await db.query('select public.revoke_agent_connection($1)', [revoked.id]);
    await service();
    await assert.rejects(
      db.query('select public.exchange_agent_oauth($1,$2,$3,$4,$5)', [
        hashOAuth(revoked.code),
        ...args.slice(1),
      ]),
      /connection unavailable/,
    );
    await asUser(owner);
    const expired = await grant();
    await db.exec('reset role');
    await db.query(
      "update private.agent_oauth_codes set expires_at=now()-interval '1 second' where code_hash=$1",
      [hashOAuth(expired.code)],
    );
    await service();
    await assert.rejects(
      db.query('select public.exchange_agent_oauth($1,$2,$3,$4,$5)', [
        hashOAuth(expired.code),
        ...args.slice(1),
      ]),
      /Invalid or expired/,
    );
  } finally {
    await db.close();
  }
});

test('official MCP OAuth client discovers, registers, uses S256 and exchanges a resource-bound token', async () => {
  const { auth } = await import('@modelcontextprotocol/sdk/client/auth.js');
  const {
    oauthResourceMetadata,
    oauthServerMetadata,
    createOAuthAccessToken,
    readOAuthAccessToken,
  } = await import('../src/features/agents/oauth');
  let information:
    import('@modelcontextprotocol/sdk/shared/auth.js').OAuthClientInformationMixed | undefined;
  let tokens: import('@modelcontextprotocol/sdk/shared/auth.js').OAuthTokens | undefined;
  let verifier = '',
    authorization: URL | undefined;
  const code = randomBytes(32).toString('base64url'),
    key = 'parius_' + randomBytes(32).toString('base64url');
  const provider: import('@modelcontextprotocol/sdk/client/auth.js').OAuthClientProvider = {
    redirectUrl: 'https://client.example/callback',
    clientMetadata: {
      client_name: 'Official SDK test',
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
    clientInformation: () => information,
    saveClientInformation: (value) => {
      information = value;
    },
    tokens: () => tokens,
    saveTokens: (value) => {
      tokens = value;
    },
    codeVerifier: () => verifier,
    saveCodeVerifier: (value) => {
      verifier = value;
    },
    state: () => 'sdk-state',
    redirectToAuthorization: (url) => {
      authorization = url;
    },
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === '/.well-known/oauth-protected-resource')
      return Response.json(oauthResourceMetadata(origin));
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return Response.json(oauthServerMetadata(origin));
    if (url.pathname === '/oauth/register')
      return Response.json(registerOAuthClient(JSON.parse(String(init?.body)), secret), {
        status: 201,
      });
    if (url.pathname === '/oauth/token') {
      const request = tokenRequest(new URLSearchParams(String(init?.body)), origin, secret);
      assert.ok(accepted);
      assert.equal(request.code, code);
      assert.equal(request.client_id, accepted.client_id);
      assert.equal(pkceChallenge(request.code_verifier), accepted.code_challenge);
      return Response.json({
        access_token: createOAuthAccessToken(key, request.resource, 3600, secret),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'project:read',
      });
    }
    return new Response(null, { status: 404 });
  };
  const options = {
    serverUrl: origin + '/api/mcp',
    resourceMetadataUrl: new URL(origin + '/.well-known/oauth-protected-resource'),
    fetchFn,
  };
  assert.equal(await auth(provider, options), 'REDIRECT');
  assert.ok(authorization);
  const accepted = authorizationRequest(authorization.searchParams, origin, secret);
  assert.equal(accepted.scope, 'project:read');
  assert.equal(accepted.state, 'sdk-state');
  assert.equal(await auth(provider, { ...options, authorizationCode: code }), 'AUTHORIZED');
  assert.ok(tokens);
  assert.equal(readOAuthAccessToken(tokens.access_token, origin + '/api/mcp', secret), key);
  assert.throws(() =>
    readOAuthAccessToken(tokens!.access_token, 'https://other.example/api/mcp', secret),
  );
  assert.throws(() =>
    readOAuthAccessToken(tokens!.access_token, origin + '/api/agent/payment', secret),
  );
  assert.throws(() =>
    readOAuthAccessToken(
      createOAuthAccessToken(key, origin + '/api/mcp', -1, secret),
      origin + '/api/mcp',
      secret,
    ),
  );
});
