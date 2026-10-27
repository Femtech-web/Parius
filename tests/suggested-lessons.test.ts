import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { filterRecalledLessons } from '../src/features/memory/domain';

test('suggested lessons require checked reviews, stay private, and only explicit confirmation queues memory', async (t) => {
  const db = new PGlite();
  const f = crypto.randomUUID(),
    c = crypto.randomUUID(),
    o = crypto.randomUUID();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, o]);
    const migrate = async (file: string) =>
      db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
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
      await migrate(file);
    const asUser = async (id: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    const value = async <T = string>(sql: string, args: unknown[] = []) =>
      (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
    await asUser(f);
    const p = await value(
      "select public.create_project('Portfolio site','','Studio','Freelancer') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [p, 'a'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Client']);
    await asUser(f);
    const scope = 'Five portfolio pages. E-commerce is excluded.';
    const ag = await value(
      "select public.propose_agreement($1,'Website agreement',$2,'10000','USDC',6,1,null) as value",
      [p, scope],
    );
    await db.query('select public.approve_agreement($1,$2)', [p, ag]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [p, ag]);
    async function review(kind: string, finish = true) {
      await asUser(c);
      const message = await value('select public.send_message($1,$2,$3) as value', [
        p,
        'Could we add a store?',
        crypto.randomUUID(),
      ]);
      await db.exec('reset role;delete from private.scope_review_attempts');
      await asUser(f);
      const claim = await value<{ id: string; lease_token: string }>(
        'select public.reserve_scope_review($1,$2,$3,coalesce((select revision from public.memory_state where owner_id=auth.uid()),0)) as value',
        [p, message, ag],
      );
      const result = {
        classification: kind,
        title: 'Store request',
        explanation: 'The approved scope excludes e-commerce.',
        agreement_quote: 'E-commerce is excluded.',
        message_quote: 'add a store',
        suggested_reply: 'Please review a separate change proposal before accepting extra work.',
      };
      if (finish) {
        await db.exec('reset role;set role service_role');
        await db.query('select public.finish_scope_review($1,$2,$3,$4,$5,$6,$7)', [
          claim.id,
          claim.lease_token,
          JSON.stringify(result),
          'openai/gpt-oss-120b',
          [],
          'no_matches',
          '[]',
        ]);
      }
      await asUser(f);
      return claim;
    }
    // Existing completed review is picked up by the migration, not re-generated.
    await review('possible_change');
    await db.exec('reset role');
    await migrate('202610260001_suggested_lessons.sql');
    await asUser(f);
    const rows = () =>
      db.query<{ id: string; lesson: string; status: string; memory_id: string; kind: string }>(
        'select * from public.memory_suggestions order by created_at,id',
      );
    const first = (await rows()).rows[0];
    assert.equal(first.status, 'pending');
    assert.equal(await value('select count(*)::text as value from public.memory_references'), '0');
    assert.equal(await value('select count(*)::text as value from public.memory_state'), '0');
    await t.test(
      'clients, outsiders and anonymous users cannot read or resolve suggestions; direct writes denied',
      async () => {
        await assert.rejects(
          db.query('update public.memory_suggestions set lesson=$1 where id=$2', [
            'Fake lesson',
            first.id,
          ]),
          /permission denied/,
        );
        for (const who of [c, o]) {
          await asUser(who);
          assert.equal((await rows()).rows.length, 0);
          await assert.rejects(
            db.query("select public.resolve_memory_suggestion($1,'dismiss')", [first.id]),
            /Private suggestion/,
          );
        }
        await db.exec('reset role;set role anon');
        await assert.rejects(
          db.query(
            "select public.resolve_memory_suggestion($1,'confirm','Any fake lesson','project')",
            [first.id],
          ),
          /permission denied/,
        );
        await asUser(f);
      },
    );
    await t.test(
      'running reviews and within-scope outcomes do not teach; repeated reviews cannot duplicate a card',
      async () => {
        await review('possible_change', false);
        await review('within_scope');
        await review('possible_change');
        assert.equal((await rows()).rows.length, 1);
        assert.equal(
          await value('select count(*)::text as value from public.memory_references'),
          '0',
        );
      },
    );
    await t.test(
      'edited confirmation is atomic and retry-safe, uses pending real worker path and leaves active agreement intact',
      async () => {
        await assert.rejects(
          db.query("select public.resolve_memory_suggestion($1,'confirm',$2,'project')", [
            first.id,
            'gsk_' + 'a'.repeat(30),
          ]),
          /credentials/,
        );
        const edited =
          'Before accepting extra features, prepare a separately priced change proposal for this project.';
        const mid = await value(
          "select public.resolve_memory_suggestion($1,'confirm',$2,'project') as value",
          [first.id, edited],
        );
        assert.equal(
          await value(
            "select public.resolve_memory_suggestion($1,'confirm',$2,'project') as value",
            [first.id, edited],
          ),
          mid,
        );
        const saved = (
          await db.query<{
            lesson: string;
            scope: string;
            status: string;
            job_id: string | null;
            blob_id: string | null;
          }>(
            'select lesson,scope,status,job_id,blob_id from public.memory_references where id=$1',
            [mid],
          )
        ).rows[0];
        assert.equal(saved.lesson, edited);
        assert.equal(saved.scope, 'project');
        assert.equal(saved.status, 'pending');
        assert.equal(saved.job_id, null);
        assert.equal(saved.blob_id, null);
        assert.equal(
          await value('select count(*)::text as value from public.memory_references'),
          '1',
        );
        assert.equal(
          String(
            await value('select revision as value from public.memory_state where owner_id=$1', [f]),
          ),
          '1',
        );
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [p]),
          ag,
        );
        assert.deepEqual(
          filterRecalledLessons([{ blob_id: 'unconfirmed', text: first.lesson }], []),
          [],
        );
        await assert.rejects(
          db.query("select public.resolve_memory_suggestion($1,'dismiss')", [first.id]),
          /already been resolved/,
        );
        const job = await value<{ lesson: string }>('select public.claim_memory_job($1) as value', [
          mid,
        ]);
        assert.equal(job.lesson, edited);
      },
    );
    await t.test('dismissal survives later reviews without writing any memory', async () => {
      await review('needs_clarification');
      const suggestion = (await rows()).rows.find((row) => row.kind === 'needs_clarification')!;
      await db.query("select public.resolve_memory_suggestion($1,'dismiss')", [suggestion.id]);
      await db.query("select public.resolve_memory_suggestion($1,'dismiss')", [suggestion.id]);
      await review('needs_clarification');
      assert.equal(
        (await rows()).rows.find((row) => row.id === suggestion.id)?.status,
        'dismissed',
      );
      assert.equal((await rows()).rows.length, 2);
      assert.equal(
        await value('select count(*)::text as value from public.memory_references'),
        '1',
      );
    });
  } finally {
    await db.close();
  }
});
