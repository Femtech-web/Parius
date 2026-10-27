import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  composeFollowup,
  checkedClosing,
  type FollowupContext,
} from '../src/features/payments/followups';
const uid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context: FollowupContext = {
  invoice: {
    id: uid(1),
    title: 'Website deposit',
    currency: 'USDC',
    decimals: 6,
    due_date: '2026-10-25',
    status: 'issued',
  },
  paid: '10000000',
  outstanding: '90000000',
  promise: {
    id: uid(2),
    amount_atomic: '20000000',
    promised_date: '2026-10-26',
    status: 'reported',
    note: 'Client said Friday',
  },
};
test('follow-up facts use exact ledger units and keep reported promises unconfirmed', () => {
  const draft = composeFollowup(context);
  assert.match(draft, /90\.00/);
  assert.match(draft, /20\.00/);
  assert.match(draft, /unconfirmed/);
  assert.doesNotMatch(draft, /You confirmed/);
  assert.match(
    composeFollowup({ ...context, promise: { ...context.promise!, status: 'confirmed' } }),
    /You confirmed/,
  );
  assert.throws(() => composeFollowup({ ...context, outstanding: '0' }));
});
test('AI closing cannot inject numbers, amounts or payment links into the factual template', () => {
  assert.equal(
    checkedClosing({ closing: 'Could you let me know the next step?' }),
    'Could you let me know the next step?',
  );
  for (const closing of [
    'Pay $500 today, please.',
    'Please use https://example.com/pay',
    'Could you pay by 12 November?',
    'Please pay ۵۰۰ tomorrow.',
    'Hello\nPlease send money.',
  ])
    assert.throws(() => checkedClosing({ closing }));
  assert.throws(() => checkedClosing({ closing: 'Could you let me know?', amount: '100' }));
});
test('promises and private follow-ups enforce human roles, fresh ledger context, revisions and one reviewed send', async (t) => {
  const db = new PGlite(),
    f = uid(9001),
    c = uid(9002),
    o = uid(9003);
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, o]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610240003_payment_followups.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    async function asUser(user: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('set role authenticated');
    }
    async function value<T = string>(sql: string, args: unknown[] = []) {
      return (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
    }
    await asUser(f);
    const project = await value(
      "select public.create_project('Follow-up project','','Client studio','Freelancer') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Client']);
    await asUser(f);
    const agreement = await value(
      "select public.propose_agreement($1,'Website','The agreed portfolio website and payment terms.','100000000','USDC',6,1,null) as value",
      [project],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [project, agreement]);
    await asUser(f);
    const invoice = await value(
      "select public.draft_invoice($1,$2,'Website invoice','100000000',null,null) as value",
      [project, agreement],
    );
    await db.query('select public.issue_invoice($1,null,null)', [invoice]);
    const date = await value("select ((now() at time zone 'UTC')::date+2)::text as value");
    const promise = (
      amount = '20000000',
      expected: string | null = null,
      key = crypto.randomUUID(),
    ) =>
      value('select public.record_payment_promise($1,$2,$3,$4,$5,$6) as value', [
        invoice,
        amount,
        date,
        'Reported in project conversation',
        key,
        expected,
      ]);
    const payment = (amount: string) =>
      value(
        "select public.record_manual_payment($1,$2,'Actual received payment',now(),$3) as value",
        [invoice, amount, crypto.randomUUID()],
      );
    type Claim = { id: string; cached: boolean; token: string; context: FollowupContext };
    const reserve = () =>
      value<Claim>('select public.reserve_payment_followup($1) as value', [invoice]);
    async function finish(claim: Claim) {
      await db.exec('reset role;set role service_role');
      await db.query('select public.finish_payment_followup($1,$2,$3,$4,$5)', [
        claim.id,
        claim.token,
        composeFollowup(claim.context),
        'template',
        null,
      ]);
    }
    let p: string, receipt: string, d: Claim;
    await t.test(
      'a reported promise is not a confirmed commitment, receipt or new invoice term',
      async () => {
        const key = crypto.randomUUID();
        p = await promise('20000000', null, key);
        assert.equal(await promise('20000000', null, key), p);
        assert.equal(
          await value('select status as value from public.payment_promises where id=$1', [p]),
          'reported',
        );
        assert.equal(
          await value(
            'select outstanding as value from public.invoice_balances where invoice_id=$1',
            [invoice],
          ),
          '100000000',
        );
        await assert.rejects(
          db.query("select public.update_payment_promise($1,'confirm')", [p]),
          /Only the client/,
        );
        await asUser(o);
        assert.equal(
          await value<number>('select count(*)::integer as value from public.payment_promises'),
          0,
        );
        await assert.rejects(promise(), /membership/);
      },
    );
    await t.test(
      'client confirmation resets receipt baseline and only actual later receipts permit closure',
      async () => {
        await asUser(f);
        await payment('10000000');
        await asUser(c);
        await db.query("select public.update_payment_promise($1,'confirm')", [p]);
        assert.equal(
          await value('select paid_baseline as value from public.payment_promises where id=$1', [
            p,
          ]),
          '10000000',
        );
        await asUser(f);
        await assert.rejects(promise('10000000', p), /Only the client/);
        await assert.rejects(
          db.query("select public.update_payment_promise($1,'withdraw')", [p]),
          /Only the client/,
        );
        await assert.rejects(
          db.query("select public.update_payment_promise($1,'fulfill')", [p]),
          /Record the received/,
        );
        receipt = await payment('20000000');
        await db.query("select public.update_payment_promise($1,'fulfill')", [p]);
        assert.equal(
          await value('select status as value from public.payment_promises where id=$1', [p]),
          'fulfilled',
        );
        assert.equal(
          await value('select paid as value from public.invoice_balances where invoice_id=$1', [
            invoice,
          ]),
          '30000000',
        );
        await asUser(c);
        await assert.rejects(promise('90000000'), /outstanding/);
        p = await promise('30000000');
        await assert.rejects(promise('20000000'), /current promise changed/);
        await db.query("select public.update_payment_promise($1,'withdraw')", [p]);
      },
    );
    await t.test(
      'draft is private, cached and trusted completion cannot be published by the browser',
      async () => {
        await asUser(f);
        d = await reserve();
        assert.equal((await reserve()).cached, true);
        await assert.rejects(
          db.query('select public.finish_payment_followup($1,$2,$3,$4,$5)', [
            d.id,
            d.token,
            'Hello',
            'template',
            null,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select lease_token from public.payment_followups'),
          /permission denied/,
        );
        await finish(d);
        await asUser(c);
        assert.equal(
          await value<number>('select count(*)::integer as value from public.payment_followups'),
          0,
        );
        await assert.rejects(reserve(), /Only the freelancer/);
        await asUser(o);
        assert.equal(
          await value<number>('select count(*)::integer as value from public.payment_followups'),
          0,
        );
      },
    );
    await t.test(
      'saved edits are revision checked; changed promises block sending without posting anything',
      async () => {
        await asUser(f);
        assert.equal(
          await value<number>('select public.save_payment_followup($1,1,$2) as value', [
            d.id,
            'My reviewed private draft.',
          ]),
          2,
        );
        await assert.rejects(
          db.query('select public.save_payment_followup($1,1,$2)', [d.id, 'Stale overwrite']),
          /changed/,
        );
        await assert.rejects(
          db.query('select public.send_payment_followup($1,2,$2,false)', [d.id, 'Reviewed text']),
          /confirmation/,
        );
        await asUser(c);
        p = await promise('5000000');
        await asUser(f);
        await assert.rejects(
          db.query('select public.send_payment_followup($1,2,$2,true)', [d.id, 'Reviewed text']),
          /Invoice or promise changed/,
        );
        assert.equal(
          await value<number>('select count(*)::integer as value from public.messages'),
          0,
        );
        await db.query('select public.discard_payment_followup($1)', [d.id]);
      },
    );
    await t.test(
      'explicit reviewed send posts once as the freelancer, preserving amounts and approvals',
      async () => {
        await asUser(f);
        d = await reserve();
        await finish(d);
        await asUser(f);
        const body = 'Thanks for the update. Could you confirm the next step?';
        const message = await value('select public.send_payment_followup($1,1,$2,true) as value', [
          d.id,
          body,
        ]);
        assert.equal(
          await value('select public.send_payment_followup($1,1,$2,true) as value', [
            d.id,
            'A retry cannot replace the sent text',
          ]),
          message,
        );
        assert.equal(
          await value('select body as value from public.messages where id=$1', [message]),
          body,
        );
        assert.equal(
          await value('select author_id as value from public.messages where id=$1', [message]),
          f,
        );
        assert.equal(
          await value<number>('select count(*)::integer as value from public.messages'),
          1,
        );
        assert.equal(
          await value(
            'select outstanding as value from public.invoice_balances where invoice_id=$1',
            [invoice],
          ),
          '70000000',
        );
        assert.equal(
          await value<number>(
            'select count(*)::integer as value from public.agreement_approvals where agreement_id=$1',
            [agreement],
          ),
          2,
        );
      },
    );
    await t.test(
      'late generation and stale sends reject changed receipts; anonymous access and generation budget stay bounded',
      async () => {
        await asUser(f);
        d = await reserve();
        await db.query('select public.reverse_manual_payment($1)', [receipt]);
        await assert.rejects(finish(d), /Invoice or promise changed/);
        await asUser(f);
        await db.query('select public.discard_payment_followup($1)', [d.id]);
        await db.exec('reset role');
        await db.query(
          'insert into private.followup_attempts(owner_id) select $1 from generate_series(1,10)',
          [f],
        );
        await asUser(f);
        await assert.rejects(reserve(), /Draft limit/);
        await db.exec('reset role;set role anon');
        await assert.rejects(reserve(), /permission denied/);
        await assert.rejects(
          db.query('select * from public.payment_promises'),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
