import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import {
  walletChallengeMessage,
  verifyWalletChallenge,
  walletOrigin,
  type WalletChallenge,
} from '../src/features/payments/wallets';

const owner = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
test('real personal-message signatures bind the exact owner, address, domain, network, nonce and lifetime', async () => {
  for (const key of [new Ed25519Keypair(), new Secp256k1Keypair()]) {
    const now = Date.now();
    const challenge: WalletChallenge = {
      id: crypto.randomUUID(),
      owner_id: owner,
      address: key.toSuiAddress(),
      network: 'testnet',
      origin: 'https://parius.example',
      nonce: crypto.randomUUID(),
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 300_000).toISOString(),
      consumed_at: null,
    };
    const context = { owner, origin: challenge.origin, network: challenge.network, now };
    const { signature } = await key.signPersonalMessage(
      new TextEncoder().encode(walletChallengeMessage(challenge)),
    );
    await verifyWalletChallenge(challenge, signature, context);
    for (const changed of [
      { ...challenge, nonce: crypto.randomUUID() },
      { ...challenge, id: crypto.randomUUID() },
      { ...challenge, address: new Ed25519Keypair().toSuiAddress() },
      { ...challenge, origin: 'https://attacker.example' },
      { ...challenge, network: 'mainnet' as const },
      { ...challenge, owner_id: other },
      { ...challenge, consumed_at: challenge.created_at },
      { ...challenge, created_at: new Date(now + 1).toISOString() },
      { ...challenge, expires_at: new Date(now + 300_001).toISOString() },
    ])
      await assert.rejects(verifyWalletChallenge(changed, signature, context));
    await assert.rejects(
      verifyWalletChallenge(challenge, signature, { ...context, now: now + 300_000 }),
    );
    await assert.rejects(verifyWalletChallenge(challenge, 'not-a-signature', context));
    // Raw data signatures cannot stand in for a Sui personal-message signature.
    const wrongIntent = await key.signTransaction(
      new TextEncoder().encode(walletChallengeMessage(challenge)),
    );
    await assert.rejects(verifyWalletChallenge(challenge, wrongIntent.signature, context));
  }
});
test('origins are pinned in production; development allows only same-port loopback aliases', () => {
  assert.equal(
    walletOrigin('https://parius.example', 'https://parius.example'),
    'https://parius.example',
  );
  assert.equal(
    walletOrigin('http://localhost:3000', 'http://127.0.0.1:3000', true),
    'http://127.0.0.1:3000',
  );
  for (const value of [
    'https://attacker.example',
    'http://localhost:3001',
    'http://localhost:3000/path',
    null,
  ])
    assert.throws(() => walletOrigin('http://localhost:3000', value, true));
  assert.throws(() => walletOrigin('http://localhost:3000', 'http://127.0.0.1:3000'));
});
test('wallet SQL restricts proofs to the service, isolates owners and consumes/revokes challenges atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2)', [owner, other]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230002_private_scope_reviews.sql',
      '202610230003_walrus_learning.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610230005_wallet_ownership.sql',
      '202610230006_payment_checkout.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    const address = new Ed25519Keypair().toSuiAddress();
    async function asUser(id: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    }
    async function value<T = string>(sql: string, params: unknown[] = []) {
      return (await db.query<{ value: T }>(sql, params)).rows[0]?.value;
    }
    const args = [owner, address, 'testnet', 'https://parius.example'];
    await asUser(owner);
    await assert.rejects(
      db.query('select public.begin_wallet_challenge($1,$2,$3,$4)', args),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select public.read_wallet_challenge($1,$2)', [crypto.randomUUID(), owner]),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select public.complete_wallet_challenge($1,$2,$3)', [
        crypto.randomUUID(),
        owner,
        'a'.repeat(64),
      ]),
      /permission denied/,
    );
    await db.exec('reset role; set role service_role');
    let challenge = await value<WalletChallenge>(
      'select public.begin_wallet_challenge($1,$2,$3,$4) as value',
      args,
    );
    await assert.rejects(
      db.query('select public.begin_wallet_challenge($1,$2,$3,$4)', args),
      /Wait before/,
    );
    assert.equal(
      await value('select public.read_wallet_challenge($1,$2) as value', [challenge.id, other]),
      null,
    );
    await assert.rejects(
      db.query('select public.complete_wallet_challenge($1,$2,$3)', [
        challenge.id,
        other,
        'a'.repeat(64),
      ]),
      /expired or was already used/,
    );
    const binding = await value('select public.complete_wallet_challenge($1,$2,$3) as value', [
      challenge.id,
      owner,
      'a'.repeat(64),
    ]);
    await assert.rejects(
      db.query('select public.complete_wallet_challenge($1,$2,$3)', [
        challenge.id,
        owner,
        'a'.repeat(64),
      ]),
      /already used/,
    );
    await asUser(other);
    assert.equal((await db.query('select id from public.wallet_bindings')).rows.length, 0);
    await db.query('select public.unlink_wallet($1)', [binding]);
    await asUser(owner);
    assert.equal(
      (await db.query('select id from public.wallet_bindings where revoked_at is null')).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query('update public.wallet_bindings set revoked_at=now()'),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select owner_id from public.wallet_bindings'),
      /permission denied/,
    );
    await db.query('select public.unlink_wallet($1)', [binding]);
    assert.equal(
      (await db.query('select id from public.wallet_bindings where revoked_at is null')).rows
        .length,
      0,
    );
    await db.exec('reset role');
    await db.query(
      "update private.wallet_challenges set created_at=now()-interval '11 seconds',expires_at=now()-interval '1 second' where id=$1",
      [challenge.id],
    );
    await db.exec('set role service_role');
    challenge = await value<WalletChallenge>(
      'select public.begin_wallet_challenge($1,$2,$3,$4) as value',
      args,
    );
    await asUser(owner);
    // Unlink also invalidates a pending proof, even if the wallet is already revoked.
    await db.query('select public.unlink_wallet($1)', [binding]);
    await db.exec('reset role;set role service_role');
    await assert.rejects(
      db.query('select public.complete_wallet_challenge($1,$2,$3)', [
        challenge.id,
        owner,
        'b'.repeat(64),
      ]),
      /already used/,
    );
    await db.exec('reset role');
    await db.query(
      "update private.wallet_challenges set consumed_at=null,created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' where id=$1",
      [challenge.id],
    );
    await db.exec('set role service_role');
    await assert.rejects(
      db.query('select public.complete_wallet_challenge($1,$2,$3)', [
        challenge.id,
        owner,
        'b'.repeat(64),
      ]),
      /expired/,
    );
    await asUser(other);
    await assert.rejects(
      db.query('select public.prepare_payment_request($1,$2,$3)', [
        crypto.randomUUID(),
        address,
        '1000000',
      ]),
      /Verify ownership/,
    );
    await assert.rejects(
      db.query('select private.prepare_payment_request($1,$2,$3)', [
        crypto.randomUUID(),
        address,
        '1000000',
      ]),
      /permission denied/,
    );
    await db.exec('reset role;set role anon');
    await assert.rejects(
      db.query('select public.unlink_wallet($1)', [binding]),
      /permission denied/,
    );
    await asUser(other);
    const project = await value(
      "select public.create_project('Wallet invoice','','Studio','Client') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'e'.repeat(64)]);
    await asUser(owner);
    await db.query('select public.accept_project_invite($1,$2)', ['e'.repeat(64), 'Client']);
    await asUser(other);
    const agreement = await value(
      "select public.propose_agreement($1,'Invoice scope','A complete portfolio website.','10000000','USDC',6,1,null) as value",
      [project],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(owner);
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(other);
    const invoice = await value(
      "select public.draft_invoice($1,$2,'Project deposit','1000000') as value",
      [project, agreement],
    );
    const recipient = new Ed25519Keypair().toSuiAddress();
    await db.query("select public.issue_invoice($1,'testnet',$2)", [invoice, recipient]);
    await asUser(owner);
    await assert.rejects(
      db.query('select public.prepare_payment_request($1,$2,$3)', [invoice, address, '1000000']),
      /Verify ownership/,
    );
    await db.exec('reset role;set role service_role');
    challenge = await value<WalletChallenge>(
      'select public.begin_wallet_challenge($1,$2,$3,$4) as value',
      args,
    );
    await value('select public.complete_wallet_challenge($1,$2,$3) as value', [
      challenge.id,
      owner,
      'c'.repeat(64),
    ]);
    await asUser(owner);
    const request = await value('select public.prepare_payment_request($1,$2,$3) as value', [
      invoice,
      address,
      '1000000',
    ]);
    assert.ok(request);
    await db.exec('reset role');
    await db.query(
      `insert into public.payment_checkouts(request_id,project_id,invoice_id,owner_id,mode,status,network,payer,recipient,coin_type,amount_atomic,gas_budget)
      select $1,$2,$3,$4,'sponsored','credited','testnet',$5,$6,'fixture','1000000','50000000' from generate_series(1,10)`,
      [request, project, invoice, other, address, recipient],
    );
    await asUser(owner);
    await assert.rejects(
      db.query("select public.reserve_payment_checkout($1,'sponsored')", [request]),
      /capacity is reached/,
    );
    await db.exec('reset role');
    await db.query("delete from public.payment_checkouts where owner_id=$1 and mode='sponsored'", [
      other,
    ]);
    await asUser(other);
    await assert.rejects(
      db.query("select public.reserve_payment_checkout($1,'wallet')", [request]),
      /Only the client/,
    );
    await asUser(owner);
    const plan = await value<{ id: string; lease_token: string }>(
      "select public.reserve_payment_checkout($1,'wallet') as value",
      [request],
    );
    await assert.rejects(
      db.query("select public.reserve_payment_checkout($1,'wallet')", [request]),
      /being prepared/,
    );
    await assert.rejects(
      db.query("update public.payment_checkouts set status='credited'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select bytes from private.payment_checkout_bytes'),
      /permission denied/,
    );
    const digest = '9'.repeat(43);
    const finish = [plan.id, plan.lease_token, 'A'.repeat(64), digest, '10000000', '100'];
    await assert.rejects(
      db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', finish),
      /permission denied/,
    );
    await db.exec('reset role;set role service_role');
    assert.equal(
      await value('select public.read_payment_checkout($1,$2) as value', [plan.id, other]),
      null,
    );
    await assert.rejects(
      db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', [
        plan.id,
        crypto.randomUUID(),
        ...finish.slice(2),
      ]),
      /Preparation expired/,
    );
    await db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', finish);
    await assert.rejects(
      db.query('select public.resolve_checkout_failure($1,$2)', [
        plan.id,
        JSON.stringify({
          provider: 'Tatum',
          network: 'testnet',
          digest,
          kind: 'expired_unsigned',
          currentEpoch: '99',
        }),
      ]),
      /outcome remains uncertain/,
    );
    await asUser(owner);
    const resumed = await value<{ id: string; digest: string; mode: string }>(
      "select public.reserve_payment_checkout($1,'sponsored') as value",
      [request],
    );
    assert.equal(resumed.id, plan.id);
    assert.equal(resumed.digest, digest);
    assert.equal(resumed.mode, 'wallet');
    const secondRequest = await value('select public.prepare_payment_request($1,$2,$3) as value', [
      invoice,
      address,
      '1000000',
    ]);
    await assert.rejects(
      db.query("select public.reserve_payment_checkout($1,'wallet')", [secondRequest]),
      /existing payment/,
    );
    await db.query('select public.unlink_wallet($1)', [binding]);
    await db.exec('reset role;set role service_role');
    await assert.rejects(
      db.query('select public.authorize_payment_submission($1,$2)', [plan.id, owner]),
      /Verify this sender/,
    );
    await db.exec('reset role');
    await db.query('update public.wallet_bindings set revoked_at=null where id=$1', [binding]);
    await db.exec('set role service_role');
    await db.query('select public.authorize_payment_submission($1,$2)', [plan.id, owner]);
    await assert.rejects(
      db.query('select public.resolve_checkout_failure($1,$2)', [
        plan.id,
        JSON.stringify({
          provider: 'Tatum',
          network: 'testnet',
          digest,
          kind: 'expired_unsigned',
          currentEpoch: '101',
        }),
      ]),
      /outcome remains uncertain/,
    );
    await assert.rejects(
      db.query('select public.authorize_payment_submission($1,$2)', [plan.id, owner]),
      /Wait before/,
    );
    await asUser(owner);
    assert.equal(
      await value('select status as value from public.payment_checkouts where id=$1', [plan.id]),
      'uncertain',
    );
    await assert.rejects(
      db.query('select public.mark_payment_submitted($1)', [plan.id]),
      /permission denied/,
    );
    await db.exec('reset role;set role service_role');
    await db.query('select public.mark_payment_submitted($1)', [plan.id]);
    await asUser(owner);
    const check = await value<{ id: string; lease_token: string }>(
      'select public.reserve_payment_check($1,$2) as value',
      [request, digest],
    );
    const proof = {
      provider: 'Tatum',
      digest,
      network: 'testnet',
      chainId: '4c78adac',
      recipient,
      sender: address,
      coinType: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
      amountAtomic: '1000000',
      checkpoint: '123',
      timestamp: new Date().toISOString(),
    };
    await db.exec('reset role;set role service_role');
    await db.query('select public.finish_payment_check($1,$2,$3,null)', [
      check.id,
      check.lease_token,
      JSON.stringify(proof),
    ]);
    await asUser(owner);
    assert.equal(
      await value('select status as value from public.payment_checkouts where id=$1', [plan.id]),
      'verified',
    );
    await assert.rejects(
      db.query("select public.reserve_payment_checkout($1,'wallet')", [secondRequest]),
      /Reconcile/,
    );
    await assert.rejects(
      db.query('select public.reconcile_verified_receipt($1)', [check.id]),
      /Only the freelancer/,
    );
    await asUser(other);
    await db.query('select public.reconcile_verified_receipt($1)', [check.id]);
    assert.equal(
      await value('select status as value from public.payment_checkouts where id=$1', [plan.id]),
      'credited',
    );
    const nextInvoice = await value(
      "select public.draft_invoice($1,$2,'Second deposit','1000000') as value",
      [project, agreement],
    );
    await db.query("select public.issue_invoice($1,'testnet',$2)", [nextInvoice, recipient]);
    await asUser(owner);
    const nextRequest = await value('select public.prepare_payment_request($1,$2,$3) as value', [
      nextInvoice,
      address,
      '1000000',
    ]);
    const firstLease = await value<{ id: string; lease_token: string }>(
      "select public.reserve_payment_checkout($1,'wallet') as value",
      [nextRequest],
    );
    await db.exec('reset role');
    await db.query(
      "update private.payment_checkout_bytes set lease_expires_at=now()-interval '1 second' where id=$1",
      [firstLease.id],
    );
    await asUser(owner);
    const recovered = await value<{ id: string; lease_token: string }>(
      "select public.reserve_payment_checkout($1,'wallet') as value",
      [nextRequest],
    );
    assert.equal(recovered.id, firstLease.id);
    assert.notEqual(recovered.lease_token, firstLease.lease_token);
    await db.exec('reset role;set role service_role');
    const nextFinish = [
      recovered.id,
      recovered.lease_token,
      'A'.repeat(64),
      '8'.repeat(43),
      '10000000',
      '100',
    ];
    await assert.rejects(
      db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', [
        firstLease.id,
        firstLease.lease_token,
        ...nextFinish.slice(2),
      ]),
      /Preparation expired/,
    );
    await db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', nextFinish);
    await db.query('select public.resolve_checkout_failure($1,$2)', [
      recovered.id,
      JSON.stringify({
        provider: 'Tatum',
        network: 'testnet',
        digest: '8'.repeat(43),
        kind: 'expired_unsigned',
        currentEpoch: '101',
      }),
    ]);
    await asUser(owner);
    assert.equal(
      await value('select reason as value from public.payment_checkouts where id=$1', [
        recovered.id,
      ]),
      'expired_unsigned',
    );
    const retry = await value<{ id: string; lease_token: string }>(
      "select public.reserve_payment_checkout($1,'wallet') as value",
      [nextRequest],
    );
    assert.notEqual(retry.id, recovered.id);
    await db.exec('reset role;set role service_role');
    await db.query('select public.finish_payment_preparation($1,$2,$3,$4,$5,$6)', [
      retry.id,
      retry.lease_token,
      'A'.repeat(64),
      '7'.repeat(43),
      '10000000',
      '101',
    ]);
    await db.query('select public.authorize_payment_submission($1,$2)', [retry.id, owner]);
    await db.query('select public.resolve_checkout_failure($1,$2)', [
      retry.id,
      JSON.stringify({
        provider: 'Tatum',
        network: 'testnet',
        digest: '7'.repeat(43),
        kind: 'failed_transaction',
        sender: address,
        checkpoint: '124',
      }),
    ]);
    await asUser(owner);
    assert.equal(
      await value(
        "select failure_evidence->>'kind' as value from public.payment_checkouts where id=$1",
        [retry.id],
      ),
      'failed_transaction',
    );
    await asUser(owner);
    await db.query('select public.unlink_wallet($1)', [binding]);
    await assert.rejects(
      db.query('select public.prepare_payment_request($1,$2,$3)', [invoice, address, '1000000']),
      /Verify ownership/,
    );
    assert.equal(
      (await db.query('select id from public.payment_requests where id=$1', [request])).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
