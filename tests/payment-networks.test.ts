import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { paymentNetworks } from '../src/features/payments/networks';
import { tatumPaymentConfig } from '../src/lib/tatum-config';
import { agentExecutionNetwork } from '../src/features/agents/execution-network';
import { usdcTypes } from '../src/features/payments/domain';

test('payment networks reject arbitrary chains and never reuse Testnet credentials for Mainnet', () => {
  assert.deepEqual(paymentNetworks('testnet', 'testnet,mainnet'), ['testnet', 'mainnet']);
  assert.throws(() => paymentNetworks('testnet', 'testnet,devnet'));
  const env = {
    NEXT_PUBLIC_SUI_NETWORK: 'testnet',
    TATUM_API_KEY: 'test-only',
    TATUM_SUI_GRPC_URL: 'https://sui-testnet-grpc.gateway.tatum.io',
  };
  assert.equal(tatumPaymentConfig('testnet', env).key, 'test-only');
  assert.throws(() => tatumPaymentConfig('mainnet', env), /not configured/);
  const both = { ...env, TATUM_MAINNET_API_KEY: 'main-only' };
  assert.equal(tatumPaymentConfig('mainnet', both).key, 'main-only');
  assert.equal(tatumPaymentConfig('mainnet', both).host, 'sui-mainnet-grpc.gateway.tatum.io:443');
  assert.throws(
    () =>
      tatumPaymentConfig('mainnet', { ...both, TATUM_MAINNET_GRPC_URL: env.TATUM_SUI_GRPC_URL }),
    /does not match/,
  );
});

test('SQL locks payment mode after issuance and rejects cross-network invoices and unauthorized changes', async () => {
  const db = new PGlite();
  const f = crypto.randomUUID(),
    c = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.query('insert into auth.users values ($1),($2),($3)', [f, c, outsider]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610270002_payment_networks.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    const user = async (id: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    const value = async <T = string>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0].v;
    await user(f);
    const project = await value(
      "select public.create_project('Network project','','Client','Freelancer') v",
    );
    assert.equal(
      await value('select payment_network v from public.projects where id=$1', [project]),
      'testnet',
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]);
    await user(c);
    await db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Client']);
    await assert.rejects(
      db.query("select public.set_project_payment_network($1,'mainnet')", [project]),
      /Only the freelancer/,
    );
    await user(outsider);
    await assert.rejects(
      db.query("select public.set_project_payment_network($1,'mainnet')", [project]),
      /Only the freelancer/,
    );
    await user(f);
    await assert.rejects(
      db.query("select public.set_project_payment_network($1,'devnet')", [project]),
      /Choose Testnet/,
    );
    await db.query("select public.set_project_payment_network($1,'mainnet')", [project]);
    const agreement = await value(
      "select public.propose_agreement($1,'Website','Build the agreed website.','1000000','USDC',6,1,null) v",
      [project],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await user(c);
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await user(f);
    const invoice = await value(
      "select public.draft_invoice($1,$2,'Deposit','10000',null,null) v",
      [project, agreement],
    );
    const recipient = '0x' + '22'.repeat(32);
    await assert.rejects(
      db.query("select public.issue_invoice($1,'testnet',$2)", [invoice, recipient]),
      /must match/,
    );
    await db.query("select public.issue_invoice($1,'mainnet',$2)", [invoice, recipient]);
    assert.equal(
      await value('select coin_type v from public.invoices where id=$1', [invoice]),
      usdcTypes.mainnet,
    );
    await assert.rejects(
      db.query("select public.set_project_payment_network($1,'testnet')", [project]),
      /fixed after/,
    );
    await db.query("select public.set_project_payment_network($1,'mainnet')", [project]);
    await assert.rejects(
      db.query("update public.projects set payment_network='testnet' where id=$1", [project]),
      /permission denied/,
    );
    await db.query('select public.void_invoice($1)', [invoice]);
    await assert.rejects(
      db.query("select public.set_project_payment_network($1,'testnet')", [project]),
      /fixed after/,
    );
  } finally {
    await db.close();
  }
});

test('agent Mainnet execution requires explicit opt-in and the exact canonical network token', () => {
  assert.equal(agentExecutionNetwork('testnet', 'testnet', usdcTypes.testnet, false), 'testnet');
  assert.equal(agentExecutionNetwork('mainnet', 'mainnet', usdcTypes.mainnet, true), 'mainnet');
  assert.throws(() => agentExecutionNetwork('mainnet', 'mainnet', usdcTypes.mainnet, false));
  assert.throws(() => agentExecutionNetwork('mainnet', 'testnet', usdcTypes.mainnet, true));
  assert.throws(() => agentExecutionNetwork('mainnet', 'mainnet', usdcTypes.testnet, true));
  assert.throws(() => agentExecutionNetwork('devnet', 'devnet', usdcTypes.testnet, true));
});
