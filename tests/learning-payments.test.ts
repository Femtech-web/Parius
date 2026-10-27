import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  filterRecalledLessons,
  memoryNamespace,
  memoryPayload,
  type MemoryReference,
} from '../src/features/memory/domain';
import {
  matchReceipt,
  usdcTypes,
  addressInput,
  invoiceTotals,
  type Invoice,
} from '../src/features/payments/domain';
const f = '10000000-0000-4000-8000-000000000001',
  c = '10000000-0000-4000-8000-000000000002',
  o = '10000000-0000-4000-8000-000000000003';
const sender = addressInput.parse('0x11'),
  recipient = addressInput.parse('0x22');
const expected = {
  network: 'testnet' as const,
  digest: 'test-digest',
  payer: sender,
  recipient,
  coinType: usdcTypes.testnet,
  amountAtomic: '1000000',
  createdAt: '2026-10-23T00:00:00Z',
  expiresAt: '2026-10-24T00:00:00Z',
};
const evidence = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  digest: 'test-digest',
  success: true,
  sender,
  checkpoint: 123n,
  timestamp: '2026-10-23T01:00:00Z',
  changes: [
    { address: sender, coinType: usdcTypes.testnet, amount: '-1000000' },
    { address: recipient, coinType: usdcTypes.testnet, amount: '1000000' },
  ],
};
test('receipt matching rejects wrong network, failure, destination, token, amount, payer, time and mixed transfers', () => {
  assert.equal(matchReceipt(evidence, expected).amountAtomic, '1000000');
  assert.equal(
    matchReceipt({ ...evidence, chainId: undefined, networkBinding: 'tatum_endpoint' }, expected)
      .networkEvidence,
    'tatum_endpoint_and_canonical_asset',
  );
  assert.throws(
    () => matchReceipt({ ...evidence, chainId: undefined }, expected),
    /network_mismatch/,
  );
  for (const bad of [
    { ...evidence, chainId: '35834a8a' },
    { ...evidence, success: false },
    { ...evidence, sender: recipient },
    { ...evidence, timestamp: '2026-10-22T00:00:00Z' },
    { ...evidence, checkpoint: undefined },
    { ...evidence, changes: evidence.changes.map((v) => ({ ...v, coinType: usdcTypes.mainnet })) },
    { ...evidence, changes: [evidence.changes[0], { ...evidence.changes[1], address: sender }] },
    {
      ...evidence,
      changes: [...evidence.changes, { address: '0x33', coinType: usdcTypes.testnet, amount: '1' }],
    },
    { ...evidence, changes: [evidence.changes[0], { ...evidence.changes[1], amount: '999999' }] },
  ])
    assert.throws(() => matchReceipt(bad, expected));
});
test('memory recall uses remote content only when it matches an authorized ready reference', () => {
  const ref: MemoryReference = {
    id: 'm1',
    owner_id: f,
    project_id: 'p',
    scope: 'personal',
    lesson: 'Keep messages concise and avoid emoji.',
    status: 'ready',
    blob_id: 'blob1',
    job_id: 'job1',
    created_at: '2026-10-23T00:00:00Z',
    replaces_id: null,
  };
  assert.notEqual(memoryNamespace(f), memoryNamespace(c));
  assert.notEqual(memoryNamespace(f), memoryNamespace(f, c));
  const hit = { blob_id: 'blob1', text: memoryPayload(ref.id, ref.lesson) };
  assert.equal(filterRecalledLessons([hit], [ref]).length, 1);
  assert.equal(filterRecalledLessons([hit], [{ ...ref, status: 'suppressed' }]).length, 0);
  assert.equal(filterRecalledLessons([{ ...hit, blob_id: 'foreign' }], [ref]).length, 0);
  assert.equal(
    filterRecalledLessons(
      [{ ...hit, text: memoryPayload(ref.id, 'Rewritten by another source') }],
      [ref],
    ).length,
    0,
  );
  assert.equal(filterRecalledLessons([hit], []).length, 0);
});
test('new migrations enforce private learning, financial authorization and replay safety', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, o]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230002_private_scope_reviews.sql',
      '202610230003_walrus_learning.sql',
      '202610230004_invoices_and_receipts.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    async function asUser(id: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    }
    async function value<T = string>(sql: string, args: unknown[] = []) {
      return (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
    }
    await asUser(f);
    const p = await value(
      "select public.create_project('Portfolio site','','Forma','Alex') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [p, 'd'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['d'.repeat(64), 'Amara']);
    const message = await value('select public.send_message($1,$2,$3) as value', [
      p,
      'Could we add checkout?',
      crypto.randomUUID(),
    ]);
    await asUser(f);
    const a = await value(
      "select public.propose_agreement($1,'Website scope','Five portfolio pages. Checkout is excluded.','100000000','USDC',6,2,null) as value",
      [p],
    );
    await db.query('select public.approve_agreement($1,$2)', [p, a]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [p, a]);
    let memory: string;
    await t.test(
      'only the freelancer confirms; client and outsider cannot read private lessons',
      async () => {
        await assert.rejects(
          db.query(
            "select public.confirm_memory($1,'Keep follow-up messages concise.','personal',$2)",
            [p, crypto.randomUUID()],
          ),
          /Only the freelancer/,
        );
        await asUser(f);
        const key = crypto.randomUUID();
        memory = await value(
          "select public.confirm_memory($1,'Keep follow-up messages concise.','personal',$2) as value",
          [p, key],
        );
        assert.equal(
          await value(
            "select public.confirm_memory($1,'Keep follow-up messages concise.','personal',$2) as value",
            [p, key],
          ),
          memory,
        );
        await assert.rejects(
          db.query("update public.memory_references set status='ready'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select lease_token from public.memory_references'),
          /permission denied/,
        );
        await asUser(c);
        assert.equal(
          (await db.query('select id,lesson from public.memory_references')).rows.length,
          0,
        );
        await asUser(o);
        assert.equal(
          (await db.query('select id,lesson from public.memory_references')).rows.length,
          0,
        );
        await assert.rejects(
          db.query('select public.suppress_memory($1)', [memory]),
          /Private memory/,
        );
      },
    );
    await t.test(
      'durable job stores provenance and correction suppresses old recall/cache',
      async () => {
        await asUser(f);
        const claim = await value<{ lease_token: string }>(
          'select public.claim_memory_job($1) as value',
          [memory],
        );
        await assert.rejects(
          db.query('select public.claim_memory_job($1)', [memory]),
          /already being processed/,
        );
        await assert.rejects(
          db.query("select public.record_memory_progress($1,$2,'job1','blob1','ready')", [
            memory,
            claim.lease_token,
          ]),
          /permission denied/,
        );
        await db.exec('reset role;set role service_role');
        await db.query("select public.record_memory_progress($1,$2,'job1','blob1','ready')", [
          memory,
          claim.lease_token,
        ]);
        await asUser(f);
        assert.equal(
          await value('select status as value from public.memory_references where id=$1', [memory]),
          'ready',
        );
        const revision = Number(
          await value('select revision::text as value from public.memory_state where owner_id=$1', [
            f,
          ]),
        );
        assert.equal(revision, 2);
        await assert.rejects(
          db.query('select public.reserve_scope_review($1,$2,$3,0)', [p, message, a]),
          /lessons changed/,
        );
        const review = await value<{ id: string; lease_token: string }>(
          'select public.reserve_scope_review($1,$2,$3,$4) as value',
          [p, message, a, revision],
        );
        const replacement = await value(
          "select public.confirm_memory($1,'Use concise replies with one concrete next step.','personal',$2,$3) as value",
          [p, crypto.randomUUID(), memory],
        );
        assert.notEqual(replacement, memory);
        assert.equal(
          await value('select status as value from public.memory_references where id=$1', [memory]),
          'suppressed',
        );
        await db.exec('reset role;set role service_role');
        await assert.rejects(
          db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6)', [
            review.id,
            review.lease_token,
            {
              classification: 'possible_change',
              title: 'Checkout change',
              explanation: 'Checkout is outside the scope.',
              agreement_quote: 'Checkout is excluded.',
              message_quote: 'add checkout',
              suggested_reply: 'Let’s discuss a change proposal.',
            },
            'openai/gpt-oss-120b',
            [memory],
            'recalled',
          ]),
          /lessons changed/,
        );
      },
    );
    let invoice: string;
    await t.test(
      'invoice drafts stay private and cannot exceed approved total; only freelancer issues',
      async () => {
        await asUser(f);
        invoice = await value(
          "select public.draft_invoice($1,$2,'First milestone','60000000') as value",
          [p, a],
        );
        await assert.rejects(
          db.query("select public.draft_invoice($1,$2,'Too much','50000000')", [p, a]),
          /exceed/,
        );
        await asUser(c);
        assert.equal((await db.query('select id from public.invoices')).rows.length, 0);
        await assert.rejects(
          db.query('select public.issue_invoice($1)', [invoice]),
          /Only the freelancer/,
        );
        await asUser(f);
        await db.query('select public.issue_invoice($1,$2,$3)', [invoice, 'testnet', recipient]);
        await db.query('select public.issue_invoice($1)', [invoice]);
        await asUser(c);
        assert.equal((await db.query('select id from public.invoices')).rows.length, 1);
      },
    );
    await t.test(
      'voided private drafts stay private until an invoice has been issued',
      async () => {
        await asUser(f);
        const privateDraft = await value(
          "select public.draft_invoice($1,$2,'Private idea','1000000') as value",
          [p, a],
        );
        await db.query('select public.void_invoice($1)', [privateDraft]);
        await asUser(c);
        assert.equal(
          (await db.query('select id from public.invoices where id=$1', [privateDraft])).rows
            .length,
          0,
        );
      },
    );
    let manual: string;
    await t.test(
      'manual records are explicit, retry-safe and reversible without mutating approved terms',
      async () => {
        await assert.rejects(
          db.query('select public.record_manual_payment($1,$2,$3,now(),$4)', [
            invoice,
            '10000000',
            'Deposit',
            crypto.randomUUID(),
          ]),
          /Only the freelancer/,
        );
        await asUser(f);
        const key = crypto.randomUUID();
        manual = await value('select public.record_manual_payment($1,$2,$3,now(),$4) as value', [
          invoice,
          '10000000',
          'Deposit',
          key,
        ]);
        assert.equal(
          await value('select public.record_manual_payment($1,$2,$3,now(),$4) as value', [
            invoice,
            '10000000',
            'Deposit',
            key,
          ]),
          manual,
        );
        await assert.rejects(db.query('select public.void_invoice($1)', [invoice]), /Reconcile/);
        await assert.rejects(
          db.query("update public.payment_records set source='sui'"),
          /permission denied/,
        );
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [p]),
          a,
        );
      },
    );
    let request: string, claim: { id: string; lease_token: string };
    const digest = '11111111111111111111111111111111111111111111';
    await t.test(
      'client confirms immutable instructions; only trusted service can verify',
      async () => {
        await assert.rejects(
          db.query('select public.prepare_payment_request($1,$2,$3)', [
            invoice,
            sender,
            '10000000',
          ]),
          /Only the client/,
        );
        await asUser(c);
        request = await value('select public.prepare_payment_request($1,$2,$3) as value', [
          invoice,
          sender,
          '10000000',
        ]);
        claim = await value('select public.reserve_payment_check($1,$2) as value', [
          request,
          digest,
        ]);
        await assert.rejects(
          db.query('select public.finish_payment_check($1,$2,null,$3)', [
            claim.id,
            claim.lease_token,
            'provider_unavailable',
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select lease_token from public.payment_claims'),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select public.reconcile_verified_receipt($1)', [claim.id]),
          /Only the freelancer/,
        );
        await db.exec('reset role;set role service_role');
        await db.query('select public.finish_payment_check($1,$2,null,$3)', [
          claim.id,
          claim.lease_token,
          'network_identity_unavailable',
        ]);
        await asUser(f);
        await assert.rejects(
          db.query('select public.reconcile_verified_receipt($1)', [claim.id]),
          /verified receipt/,
        );
      },
    );
    await t.test(
      'verified receipts need human reconciliation, cannot double-credit and may replace a manual entry',
      async () => {
        await db.exec('reset role');
        await db.exec('delete from private.payment_attempts');
        await asUser(c);
        claim = await value('select public.reserve_payment_check($1,$2) as value', [
          request,
          digest,
        ]);
        const times = (
          await db.query<{ created_at: Date; expires_at: Date }>(
            'select created_at,expires_at from public.payment_requests where id=$1',
            [request],
          )
        ).rows[0];
        const proof = {
          provider: 'Tatum',
          network: 'testnet',
          chainId: '4c78adac',
          digest,
          sender,
          recipient,
          coinType: usdcTypes.testnet,
          amountAtomic: '10000000',
          checkpoint: '123',
          timestamp: new Date(new Date(times.created_at).getTime() + 1000).toISOString(),
        };
        await db.exec('reset role;set role service_role');
        await assert.rejects(
          db.query('select public.finish_payment_check($1,$2,$3,null)', [
            claim.id,
            claim.lease_token,
            { ...proof, amountAtomic: '1' },
          ]),
          /does not match/,
        );
        await db.query('select public.finish_payment_check($1,$2,$3,null)', [
          claim.id,
          claim.lease_token,
          proof,
        ]);
        await asUser(f);
        const payment = await value('select public.reconcile_verified_receipt($1,$2) as value', [
          claim.id,
          manual,
        ]);
        assert.equal(
          await value('select public.reconcile_verified_receipt($1,$2) as value', [
            claim.id,
            manual,
          ]),
          payment,
        );
        assert.equal(
          await value(
            'select count(*)::text as value from public.payment_records where invoice_id=$1 and reversed_at is null',
            [invoice],
          ),
          '1',
        );
        await assert.rejects(
          db.query('select public.reverse_manual_payment($1)', [payment]),
          /Only manual/,
        );
        const row = (
          await db.query<Invoice>('select * from public.invoices where id=$1', [invoice])
        ).rows[0];
        const rows = (
          await db.query('select * from public.payment_records where invoice_id=$1', [invoice])
        ).rows;
        assert.equal(
          invoiceTotals(row, rows as Parameters<typeof invoiceTotals>[1]).outstanding,
          '50000000',
        );
        await asUser(o);
        for (const table of ['invoices', 'payment_records', 'payment_requests'])
          assert.equal((await db.query(`select id from public.${table}`)).rows.length, 0);
        await assert.rejects(
          db.query('select public.reserve_payment_check($1,$2)', [request, digest]),
          /Project access/,
        );
      },
    );

    await t.test(
      'same digest cannot credit another request and authoritative totals retain RLS',
      async () => {
        await asUser(c);
        const another = await value('select public.prepare_payment_request($1,$2,$3) as value', [
          invoice,
          sender,
          '10000000',
        ]);
        await db.exec('reset role');
        await db.exec('delete from private.payment_attempts');
        await asUser(c);
        const next = await value<{ id: string; lease_token: string }>(
          'select public.reserve_payment_check($1,$2) as value',
          [another, digest],
        );
        const { rows } = await db.query<{ created_at: Date }>(
          'select created_at from public.payment_requests where id=$1',
          [another],
        );
        const proof = {
          provider: 'Tatum',
          network: 'testnet',
          chainId: '4c78adac',
          digest,
          sender,
          recipient,
          coinType: usdcTypes.testnet,
          amountAtomic: '10000000',
          checkpoint: '123',
          timestamp: new Date(new Date(rows[0].created_at).getTime() + 1000).toISOString(),
        };
        await db.exec('reset role;set role service_role');
        await db.query('select public.finish_payment_check($1,$2,$3,null)', [
          next.id,
          next.lease_token,
          proof,
        ]);
        await asUser(f);
        await assert.rejects(
          db.query('select public.reconcile_verified_receipt($1)', [next.id]),
          /unique constraint/,
        );
        const balances = (
          await db.query<{ paid: string; manual: string; verified: string }>(
            'select paid,manual,verified from public.invoice_balances where invoice_id=$1',
            [invoice],
          )
        ).rows[0];
        assert.deepEqual(balances, { paid: '10000000', manual: '0', verified: '10000000' });
        await asUser(o);
        assert.equal((await db.query('select * from public.invoice_balances')).rows.length, 0);
      },
    );
  } finally {
    await db.close();
  }
});
