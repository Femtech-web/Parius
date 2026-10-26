import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  validateExplainedScope,
  validateScopeEvidence,
  pairedScopeReview,
  scopeContext,
  type ScopeResult,
} from '../src/lib/scope-review';
import type { Agreement, Message } from '../src/lib/domain';
const agreement: Agreement = {
  id: 'a',
  project_id: 'p',
  version: 1,
  base_version_id: null,
  title: 'Website',
  scope: 'Six portfolio pages. E-commerce is excluded.',
  amount_atomic: '100000000',
  currency: 'USDC',
  decimals: 6,
  revision_limit: 1,
  created_at: '2026-10-23T00:00:00Z',
};
const message: Message = {
  id: 'm',
  project_id: 'p',
  author_id: 'c',
  author_name: 'Client',
  body: 'Could you add a store?',
  source: 'chat',
  created_at: agreement.created_at,
};
const result: ScopeResult = {
  classification: 'possible_change',
  title: 'Store request',
  explanation: 'The agreed scope explicitly excludes e-commerce.',
  agreement_quote: 'E-commerce is excluded.',
  message_quote: 'add a store',
  suggested_reply: 'Let’s review a separate change proposal before accepting this extra work.',
};
const memoryId = '10000000-0000-4000-8000-000000000010';
const lesson = 'Ask for a separately priced proposal before accepting new deliverables.';
const influence = {
  memory_id: memoryId,
  quote: 'separately priced proposal',
  reason: 'Uses your confirmed preference for reviewing extra work before acceptance.',
};
test('memory explanations accept only exact supplied lesson citations and never invent attribution', () => {
  const valid = { ...result, memory_influences: [influence] };
  assert.equal(
    validateExplainedScope(valid, agreement, message, [{ id: memoryId, lesson }]).influences.length,
    1,
  );
  for (const invalid of [
    { ...valid, memory_influences: [{ ...influence, memory_id: crypto.randomUUID() }] },
    { ...valid, memory_influences: [{ ...influence, quote: 'The client always pays late.' }] },
    { ...valid, memory_influences: [influence, influence] },
    { ...valid, agreement_quote: 'All extra work is free.' },
  ])
    assert.throws(() =>
      validateExplainedScope(invalid, agreement, message, [{ id: memoryId, lesson }]),
    );
  assert.throws(() => validateExplainedScope(valid, agreement, message, []));
  assert.deepEqual(
    validateExplainedScope({ ...result, memory_influences: [] }, agreement, message, []).influences,
    [],
  );
});
test('paired runs share immutable current context and differ only in recalled lessons; no partial comparison', async () => {
  const inputs: string[] = [];
  const pair = await pairedScopeReview(
    agreement,
    message,
    [{ id: memoryId, lesson }],
    async (a, m, lessons) => {
      inputs.push(scopeContext(a, m, lessons));
      assert.ok(Object.isFrozen(a));
      assert.ok(Object.isFrozen(m));
      return {
        result,
        influences: lessons.length ? [influence] : [],
        model: 'openai/gpt-oss-120b',
      };
    },
  );
  const [baseline, remembering] = inputs.map((input) => JSON.parse(input));
  assert.deepEqual(baseline.agreement, remembering.agreement);
  assert.deepEqual(baseline.request, remembering.request);
  assert.deepEqual(baseline.confirmed_lessons, []);
  assert.equal(remembering.confirmed_lessons[0].id, memoryId);
  assert.deepEqual(pair.without.result, pair.withMemory.result); // Similar results are valid, never forced apart.
  await assert.rejects(
    pairedScopeReview(agreement, message, [], async () => {
      throw new Error('Should not call provider');
    }),
    /No recalled/,
  );
  await assert.rejects(
    pairedScopeReview(agreement, message, [{ id: memoryId, lesson }], async (_a, _m, lessons) => {
      if (lessons.length) throw new Error('Outage');
      return { result, influences: [], model: 'openai/gpt-oss-120b' };
    }),
    /Both comparison runs/,
  );
  await assert.rejects(
    pairedScopeReview(agreement, message, [{ id: memoryId, lesson }], async (_a, _m, lessons) => ({
      result,
      influences: [],
      model: lessons.length ? 'other' : 'openai/gpt-oss-120b',
    })),
    /settings differed/,
  );
});
test('transparency SQL keeps evidence/comparisons private, invalidates changed context and queues honest removal', async (t) => {
  const db = new PGlite();
  const f = '10000000-0000-4000-8000-000000000001',
    c = '10000000-0000-4000-8000-000000000002',
    o = '10000000-0000-4000-8000-000000000003';
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
      '202610230005_wallet_ownership.sql',
      '202610230006_payment_checkout.sql',
      '202610230007_memory_transparency.sql',
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
    await t.test(
      'recovered source whitespace passes SQL checks while altered quotations still fail',
      async () => {
        const a = { ...agreement, scope: 'OUTSIDE THIS SCOPE\n\nE-commerce is excluded.' };
        const m = { ...message, body: 'Could you\n  add a store?' };
        const generated = {
          ...result,
          agreement_quote: 'OUTSIDE THIS SCOPE\nE-commerce is excluded.',
          message_quote: 'Could you add a store?',
        };
        const verified = validateScopeEvidence(generated, a, m);
        await db.query('select private.assert_scope_result($1,$2,$3)', [
          JSON.stringify(verified),
          a.scope,
          m.body,
        ]);
        await assert.rejects(
          db.query('select private.assert_scope_result($1,$2,$3)', [
            JSON.stringify(generated),
            a.scope,
            m.body,
          ]),
          /Invalid comparison evidence/,
        );
      },
    );
    await asUser(f);
    const project = await value(
      "select public.create_project('Portfolio site','','Studio','Client') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'f'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['f'.repeat(64), 'Client']);
    const msg = await value('select public.send_message($1,$2,$3) as value', [
      project,
      message.body,
      crypto.randomUUID(),
    ]);
    await asUser(f);
    const ag = await value(
      "select public.propose_agreement($1,'Website scope',$2,'100000000','USDC',6,1,null) as value",
      [project, agreement.scope],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, ag]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [project, ag]);
    await asUser(f);
    const mem = await value("select public.confirm_memory($1,$2,'personal',$3) as value", [
      project,
      lesson,
      crypto.randomUUID(),
    ]);
    const job = await value<{ lease_token: string }>(
      'select public.claim_memory_job($1) as value',
      [mem],
    );
    await db.exec('reset role;set role service_role');
    await db.query("select public.record_memory_progress($1,$2,'job','blob','ready')", [
      mem,
      job.lease_token,
    ]);
    await asUser(f);
    const claim = await value<{ id: string; lease_token: string }>(
      'select public.reserve_scope_review($1,$2,$3,2) as value',
      [project, msg, ag],
    );
    const influences = [{ ...influence, memory_id: mem }];
    await t.test('only the service can save checked lesson attribution', async () => {
      await assert.rejects(
        db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6,$7)', [
          claim.id,
          claim.lease_token,
          JSON.stringify(result),
          'openai/gpt-oss-120b',
          [mem],
          'recalled',
          JSON.stringify(influences),
        ]),
        /permission denied/,
      );
      await db.exec('reset role;set role service_role');
      await assert.rejects(
        db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6,$7)', [
          claim.id,
          claim.lease_token,
          JSON.stringify(result),
          'openai/gpt-oss-120b',
          [mem],
          'recalled',
          JSON.stringify([{ ...influences[0], quote: 'Made-up behavior.' }]),
        ]),
        /Unverified/,
      );
      await db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6,$7)', [
        claim.id,
        claim.lease_token,
        JSON.stringify(result),
        'openai/gpt-oss-120b',
        [mem],
        'recalled',
        JSON.stringify(influences),
      ]);
      await asUser(f);
      assert.equal(
        (
          await value<{ quote: string }[]>(
            'select memory_influences as value from public.scope_assessments where id=$1',
            [claim.id],
          )
        )[0].quote,
        influence.quote,
      );
    });
    let pair: { id: string; lease_token: string };
    await t.test('paired evidence is owner-only, lease-checked and cached', async () => {
      for (const who of [c, o]) {
        await asUser(who);
        assert.equal((await db.query('select id from public.scope_assessments')).rows.length, 0);
        await assert.rejects(
          db.query('select public.reserve_scope_comparison($1)', [claim.id]),
          /privately first/,
        );
      }
      await asUser(f);
      pair = await value('select public.reserve_scope_comparison($1) as value', [claim.id]);
      await assert.rejects(
        db.query('select public.reserve_scope_comparison($1)', [claim.id]),
        /already running/,
      );
      await assert.rejects(
        db.query('select lease_token from public.scope_comparisons'),
        /permission denied/,
      );
      const args = [
        pair.id,
        pair.lease_token,
        'completed',
        JSON.stringify(result),
        JSON.stringify(result),
        [mem],
        JSON.stringify(influences),
        'openai/gpt-oss-120b',
        'a'.repeat(64),
      ];
      await assert.rejects(
        db.query('select public.finish_scope_comparison($1,$2,$3,$4,$5,$6,$7,$8,$9)', args),
        /permission denied/,
      );
      await db.exec('reset role;set role service_role');
      await assert.rejects(
        db.query('select public.finish_scope_comparison($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          pair.id,
          crypto.randomUUID(),
          ...args.slice(2),
        ]),
        /lease expired/,
      );
      await assert.rejects(
        db.query('select public.finish_scope_comparison($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          ...args.slice(0, 3),
          JSON.stringify({ ...result, agreement_quote: 'Not in the agreement.' }),
          ...args.slice(4),
        ]),
        /Invalid comparison evidence/,
      );
      await db.query('select public.finish_scope_comparison($1,$2,$3,$4,$5,$6,$7,$8,$9)', args);
      await asUser(f);
      assert.equal(
        (
          await value<{ cached: boolean }>('select public.reserve_scope_comparison($1) as value', [
            claim.id,
          ])
        ).cached,
        true,
      );
      for (const who of [c, o]) {
        await asUser(who);
        assert.equal((await db.query('select id from public.scope_comparisons')).rows.length, 0);
      }
    });
    await t.test(
      'a changed memory revision prevents cached reuse and late comparison completion',
      async () => {
        await asUser(f);
        await db.query(
          "select public.confirm_memory($1,'Prefer short follow-up messages.','personal',$2)",
          [project, crypto.randomUUID()],
        );
        await assert.rejects(
          db.query('select public.reserve_scope_comparison($1)', [claim.id]),
          /memories changed/,
        );
        await db.exec('reset role');
        await db.exec(
          "update private.scope_review_attempts set created_at=now()-interval '2 minutes';update private.scope_comparison_attempts set created_at=now()-interval '2 minutes'",
        );
        await asUser(f);
        const newer = await value<{ id: string; lease_token: string }>(
          'select public.reserve_scope_review($1,$2,$3,3) as value',
          [project, msg, ag],
        );
        await db.exec('reset role;set role service_role');
        await db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6,$7)', [
          newer.id,
          newer.lease_token,
          JSON.stringify(result),
          'openai/gpt-oss-120b',
          [mem],
          'recalled',
          JSON.stringify(influences),
        ]);
        await asUser(f);
        const running = await value<{ id: string; lease_token: string }>(
          'select public.reserve_scope_comparison($1) as value',
          [newer.id],
        );
        await db.query(
          "select public.confirm_memory($1,'Prefer reviewing payment plans in milestones.','personal',$2)",
          [project, crypto.randomUUID()],
        );
        await db.exec('reset role;set role service_role');
        await assert.rejects(
          db.query('select public.finish_scope_comparison($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
            running.id,
            running.lease_token,
            'completed',
            JSON.stringify(result),
            JSON.stringify(result),
            [mem],
            JSON.stringify(influences),
            'openai/gpt-oss-120b',
            'a'.repeat(64),
          ]),
          /Context changed/,
        );
        await db.query("select public.finish_scope_comparison($1,$2,'failed')", [
          running.id,
          running.lease_token,
        ]);
      },
    );
    await t.test(
      'deletion requests suppress and redact locally, clear linked AI caches and remain pending remotely',
      async () => {
        await asUser(c);
        await assert.rejects(
          db.query('select public.request_memory_deletion($1)', [mem]),
          /Private memory/,
        );
        await asUser(f);
        await db.query('select public.request_memory_deletion($1)', [mem]);
        await db.query('select public.request_memory_deletion($1)', [mem]);
        assert.equal(
          await value('select status as value from public.memory_references where id=$1', [mem]),
          'suppressed',
        );
        assert.equal(
          await value('select lesson as value from public.memory_references where id=$1', [mem]),
          'Removal requested by you.',
        );
        assert.equal(
          await value(
            'select status as value from public.memory_deletion_requests where memory_id=$1',
            [mem],
          ),
          'requested',
        );
        assert.equal(
          (await db.query('select id from public.scope_assessments where id=$1', [claim.id])).rows
            .length,
          0,
        );
        assert.equal((await db.query('select id from public.scope_comparisons')).rows.length, 0);
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [
            project,
          ]),
          ag,
        );
        assert.equal(
          (await db.query('select agreement_id from public.agreement_approvals')).rows.length,
          2,
        );
        await asUser(c);
        assert.equal(
          (await db.query('select memory_id from public.memory_deletion_requests')).rows.length,
          0,
        );
      },
    );
    await t.test(
      'an in-flight Walrus completion cannot reactivate a deletion-requested lesson',
      async () => {
        await asUser(f);
        const late = await value(
          "select public.confirm_memory($1,'Keep follow-up messages concise.','project',$2) as value",
          [project, crypto.randomUUID()],
        );
        const running = await value<{ lease_token: string }>(
          'select public.claim_memory_job($1) as value',
          [late],
        );
        await db.query('select public.request_memory_deletion($1)', [late]);
        await db.exec('reset role;set role service_role');
        await db.query(
          "select public.record_memory_progress($1,$2,'late-job','late-blob','ready')",
          [late, running.lease_token],
        );
        await asUser(f);
        assert.equal(
          await value('select status as value from public.memory_references where id=$1', [late]),
          'suppressed',
        );
        assert.equal(
          await value(
            'select blob_id as value from public.memory_deletion_requests where memory_id=$1',
            [late],
          ),
          'late-blob',
        );
        await db.exec('reset role;set role anon');
        await assert.rejects(
          db.query('select public.request_memory_deletion($1)', [late]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
