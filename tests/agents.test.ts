import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Challenge, Credential } from 'mppx';
import { sui } from '@suimpp/mpp/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { toBase58 } from '@mysten/sui/utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAgentMcp } from '../src/lib/agent-mcp';
import {
  handleAgentPayment,
  type AgentContext,
  type AgentPaymentServices,
} from '../src/lib/agent-payment';
import { usdcTypes, type ReceiptProof } from '../src/lib/payments';

const id = () => crypto.randomUUID();
const digest = toBase58(new Uint8Array(32).fill(4));
function fixture() {
  const signer = new Ed25519Keypair();
  const ctx: AgentContext = {
    connection: {
      id: id(),
      project_id: id(),
      request_id: id(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
    payment: {
      payable: true,
      request: {
        id: id(),
        payer: signer.toSuiAddress(),
        amount_atomic: '10000',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      invoice: {
        id: id(),
        status: 'issued',
        network: 'testnet',
        recipient: new Ed25519Keypair().toSuiAddress(),
        coin_type: usdcTypes.testnet,
      },
      digest: null,
      claim: null,
    },
  };
  let available = true,
    checks = 0,
    reservations = 0;
  const services: AgentPaymentServices = {
    context: async () => structuredClone(ctx),
    secretKey: 'test-secret-only',
    realm: 'localhost:3000',
    signer: async (bytes, signature) =>
      (await verifyPersonalMessageSignature(bytes, signature)).toSuiAddress(),
    reserve: async (d) => {
      reservations++;
      ctx.payment!.digest = d;
      return { id: id(), cached: false, lease_token: id() };
    },
    verify: async (e) => {
      checks++;
      if (!available) throw new Error('provider unavailable');
      return {
        provider: 'Tatum',
        network: e.network,
        chainId: '4c78adac',
        digest: e.digest,
        sender: e.payer,
        recipient: e.recipient,
        coinType: e.coinType,
        amountAtomic: e.amountAtomic,
        checkpoint: '1',
        timestamp: new Date().toISOString(),
      };
    },
    finish: async (claim, proof) => {
      ctx.payment!.claim = {
        id: claim.id,
        digest,
        status: proof ? 'verified' : 'retryable',
        reason: proof ? null : 'provider_unavailable',
      };
    },
  };
  const request = (authorization?: string) =>
    new Request('http://localhost:3000/api/agent/payment', {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
    });
  return {
    signer,
    ctx,
    services,
    request,
    unavailable: () => {
      available = false;
    },
    recover: () => {
      available = true;
    },
    counters: () => ({ checks, reservations }),
  };
}
test('real suimpp credentials complete HTTP 402 → signed proof → receipt; retries never verify twice', async () => {
  const f = fixture();
  const initial = await handleAgentPayment(f.request(), f.services);
  assert.equal(initial.status, 402);
  const challenge = Challenge.fromResponse(initial, {
    methods: [
      sui({
        signer: f.signer,
        client: new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://example.invalid' }),
        currency: { type: usdcTypes.testnet, decimals: 6 },
      }),
    ],
  });
  assert.equal(challenge.request.amount, '0.010000');
  let executions = 0;
  const payer = sui({
    signer: f.signer,
    client: new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://example.invalid' }),
    currency: { type: usdcTypes.testnet, decimals: 6 },
    execute: async () => {
      executions++;
      return { digest };
    },
  });
  const credential = await payer.createCredential({ challenge });
  const paid = await handleAgentPayment(f.request(credential), f.services);
  assert.equal(paid.status, 200);
  assert.ok(paid.headers.get('Payment-Receipt'));
  assert.equal((await paid.json()).status, 'matched');
  assert.equal((await handleAgentPayment(f.request(credential), f.services)).status, 200);
  assert.equal(executions, 1);
  assert.deepEqual(f.counters(), { checks: 1, reservations: 1 });
});
test('challenge tampering, wrong wallet, read-only keys and expired requests cannot reserve receipts', async () => {
  const f = fixture();
  const challenge = Challenge.fromResponse(await handleAgentPayment(f.request(), f.services));
  for (const changed of [
    { ...challenge, request: { ...challenge.request, amount: '0.000001' } },
    { ...challenge, opaque: { ...challenge.opaque, request: id() } },
  ]) {
    const credential = Credential.serialize({
      challenge: changed,
      payload: { digest, signature: 'x'.repeat(100) },
    });
    assert.equal((await handleAgentPayment(f.request(credential), f.services)).status, 400);
  }
  const wrong = new Ed25519Keypair();
  const payer = sui({
    signer: wrong,
    client: new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://example.invalid' }),
    currency: { type: usdcTypes.testnet, decimals: 6 },
    execute: async () => ({ digest }),
  });
  const credential = await payer.createCredential({
    challenge: {
      ...challenge,
      method: 'sui',
      intent: 'charge',
      request: {
        amount: '0.010000',
        currency: usdcTypes.testnet,
        recipient: f.ctx.payment!.invoice.recipient,
      },
    },
  });
  assert.equal((await handleAgentPayment(f.request(credential), f.services)).status, 400);
  f.ctx.connection.expires_at = new Date(0).toISOString();
  assert.equal((await handleAgentPayment(f.request(), f.services)).status, 409);
  delete f.ctx.payment;
  assert.equal((await handleAgentPayment(f.request(), f.services)).status, 403);
  assert.deepEqual(f.counters(), { checks: 0, reservations: 0 });
});
test('provider failure remains visible, saves digest, and recovers with the same credential', async () => {
  const f = fixture();
  const challenge = Challenge.fromResponse(await handleAgentPayment(f.request(), f.services));
  const credential = Credential.serialize({
    challenge,
    payload: {
      digest,
      signature: (
        await f.signer.signPersonalMessage(
          (await import('../src/lib/agent-payment')).paymentProofBytes(challenge, digest),
        )
      ).signature,
    },
  });
  f.unavailable();
  assert.equal((await handleAgentPayment(f.request(credential), f.services)).status, 503);
  assert.equal(f.ctx.payment!.digest, digest);
  assert.equal(f.ctx.payment!.claim!.status, 'retryable');
  const secondDigest = toBase58(new Uint8Array(32).fill(5));
  const changed = Credential.serialize({
    challenge,
    payload: { digest: secondDigest, signature: 'x'.repeat(100) },
  });
  assert.equal((await handleAgentPayment(f.request(changed), f.services)).status, 409);
  f.recover();
  assert.equal((await handleAgentPayment(f.request(credential), f.services)).status, 200);
});
test('official MCP client discovers and calls bounded tools; revocation is checked on every call', async () => {
  const f = fixture();
  let revoked = false;
  const server = createAgentMcp(
    async () => {
      if (revoked) throw new Error('Revoked');
      return f.ctx;
    },
    'localhost:3000',
    'test-secret-only',
  );
  const client = new Client({ name: 'acceptance', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    assert.deepEqual(
      (await client.listTools()).tools.map((t) => t.name),
      ['project_context', 'payment_handoff', 'payment_status'],
    );
    const context = await client.callTool({ name: 'project_context', arguments: {} });
    assert.equal(context.isError, undefined);
    assert.ok(!JSON.stringify(context).includes('amount_atomic'));
    assert.equal((await client.callTool({ name: 'release_final', arguments: {} })).isError, true);
    revoked = true;
    assert.equal((await client.callTool({ name: 'project_context', arguments: {} })).isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test('SQL agent keys enforce ownership, request bounds, expiry, revocation and durable digest replay protection', async () => {
  const db = new PGlite(),
    f = id(),
    c = id(),
    outsider = id(),
    hash = 'a'.repeat(64);
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, outsider]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610230006_payment_checkout.sql',
      '202610260002_agent_access.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    const asUser = async (user: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('set role authenticated');
    };
    const value = async <T = string>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    await asUser(f);
    const project = await value(
      "select public.create_project('Agent project','','Client','Freelancer') v",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'b'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['b'.repeat(64), 'Client']);
    await asUser(f);
    const agreement = await value(
      "select public.propose_agreement($1,'Agreed website','Build the approved website only.','1000000','USDC',6,1,null) v",
      [project],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(f);
    const invoice = await value(
      "select public.draft_invoice($1,$2,'Issued invoice','10000',null,null) v",
      [project, agreement],
    );
    const draft = await value(
      "select public.draft_invoice($1,$2,'Private draft','10000',null,null) v",
      [project, agreement],
    );
    await db.query('select public.issue_invoice($1,null,null)', [invoice]);
    await db.exec('reset role');
    const payer = '0x' + '11'.repeat(32),
      recipient = '0x' + '22'.repeat(32);
    await db.query(
      "update public.invoices set network='testnet',recipient=$1,coin_type=$2 where id=$3",
      [recipient, usdcTypes.testnet, invoice],
    );
    await asUser(c);
    const request = await value("select public.prepare_payment_request($1,$2,'10000') v", [
      invoice,
      payer,
    ]);
    const connection = await value("select public.create_agent_connection($1,'Agent',$2,$3) v", [
      project,
      hash,
      request,
    ]);
    await assert.rejects(
      db.query("select public.create_agent_connection($1,'Duplicate',$2,$3)", [
        project,
        'c'.repeat(64),
        request,
      ]),
      /existing payment/,
    );
    await assert.rejects(db.query('select public.agent_context($1)', [hash]), /permission denied/);
    await assert.rejects(db.query('select * from private.agent_keys'), /permission denied/);
    await db.exec('reset role;set role service_role');
    const ctx = await value<AgentContext & { invoices: { id: string }[] }>(
      'select public.agent_context($1) v',
      [hash],
    );
    assert.ok(ctx.invoices.some((i) => i.id === invoice));
    assert.ok(!ctx.invoices.some((i) => i.id === draft));
    const claim = await value<{ id: string; cached: boolean; lease_token: string }>(
      'select public.reserve_agent_receipt($1,$2) v',
      [hash, digest],
    );
    assert.equal(claim.cached, false);
    await assert.rejects(
      db.query('select public.reserve_agent_receipt($1,$2)', [
        hash,
        toBase58(new Uint8Array(32).fill(6)),
      ]),
      /second payment/,
    );
    const proof: ReceiptProof = {
      provider: 'Tatum',
      network: 'testnet',
      chainId: '4c78adac',
      digest,
      sender: payer,
      recipient,
      coinType: usdcTypes.testnet,
      amountAtomic: '10000',
      checkpoint: '10',
      timestamp: new Date().toISOString(),
    };
    await db.query('select public.finish_payment_check($1,$2,$3,null)', [
      claim.id,
      claim.lease_token,
      JSON.stringify(proof),
    ]);
    const cached = await value<{ cached: boolean }>(
      'select public.reserve_agent_receipt($1,$2) v',
      [hash, digest],
    );
    assert.equal(cached.cached, true);
    await asUser(outsider);
    assert.equal((await db.query('select * from public.agent_connections')).rows.length, 0);
    await assert.rejects(
      db.query('select public.revoke_agent_connection($1)', [connection]),
      /unavailable/,
    );
    await asUser(c);
    await db.query('select public.revoke_agent_connection($1)', [connection]);
    await db.exec('reset role;set role service_role');
    await assert.rejects(db.query('select public.agent_context($1)', [hash]), /revoked/);
    await asUser(f);
    const readonly = await value(
      "select public.create_agent_connection($1,'Read only',$2,null) v",
      [project, 'd'.repeat(64)],
    );
    await db.exec('reset role;set role service_role');
    await assert.rejects(
      db.query('select public.reserve_agent_receipt($1,$2)', ['d'.repeat(64), digest]),
      /read-only/,
    );
    await db.exec('reset role');
    await db.query(
      "update public.agent_connections set expires_at=now()-interval '1 second' where id=$1",
      [readonly],
    );
    await db.exec('set role service_role');
    await assert.rejects(db.query('select public.agent_context($1)', ['d'.repeat(64)]), /expired/);
  } finally {
    await db.close();
  }
});
