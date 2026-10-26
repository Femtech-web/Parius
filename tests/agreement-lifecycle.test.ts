import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { agreementState, compareAgreements, editableAmount } from '../src/lib/agreements';
import type { Agreement, Approval } from '../src/lib/domain';

test('agreement comparisons preserve exact amounts and distinguish historical from stale versions', () => {
  const base: Agreement = {
    id: 'v1',
    project_id: 'p',
    title: 'Website agreement',
    scope: 'Five portfolio pages',
    amount_atomic: '9007199254740993123456',
    decimals: 6,
    currency: 'USDC',
    revision_limit: 2,
    version: 1,
    base_version_id: null,
    created_at: '2026-10-20T09:00:00Z',
  };
  assert.equal(editableAmount(base), '9007199254740993.123456');
  assert.deepEqual(compareAgreements(base, { ...base, id: 'v2', version: 2 }), []);
  assert.deepEqual(
    compareAgreements(base, {
      ...base,
      amount_atomic: '9007199254740993123457',
      revision_limit: 3,
    }).map((c) => c.field),
    ['Total price', 'Included revision rounds'],
  );
  const approvals: Approval[] = [
    { agreement_id: 'v1', actor_id: 'a', role: 'freelancer', created_at: base.created_at },
    { agreement_id: 'v1', actor_id: 'b', role: 'client', created_at: base.created_at },
  ];
  assert.equal(agreementState(base, 'v2', approvals), 'previous');
  assert.equal(agreementState(base, 'v2', []), 'stale');
  assert.equal(agreementState({ ...base, base_version_id: 'v2' }, 'v2', []), 'pending');
  assert.equal(
    agreementState(base, null, [], {
      project_id: 'p',
      agreement_id: 'v1',
      actor_id: 'b',
      kind: 'rejected',
      reason: null,
      created_at: base.created_at,
    }),
    'rejected',
  );
});

test('agreement lifecycle enforces human roles, closure, stale bases, retries and private history', async (t) => {
  const db = new PGlite();
  const freelancer = '10000000-0000-4000-8000-000000000001',
    client = '10000000-0000-4000-8000-000000000002',
    outsider = '10000000-0000-4000-8000-000000000003';
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values ($1),($2),($3)', [freelancer, client, outsider]);
    for (const file of ['202610220001_workspace.sql', '202610230001_agreement_lifecycle.sql'])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    async function asUser(id: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    }
    async function value(sql: string, args: unknown[] = []) {
      return (await db.query<{ value: string }>(sql, args)).rows[0]?.value;
    }
    await asUser(freelancer);
    const project = await value(
      "select public.create_project('Portfolio site','A studio website','Forma','Alex') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'b'.repeat(64)]);
    await asUser(client);
    await db.query('select public.accept_project_invite($1,$2)', ['b'.repeat(64), 'Amara']);
    const publish = (base: string | null) =>
      value(
        "select public.propose_agreement($1,'Website agreement','Five portfolio pages and two revision rounds.','2400000000','USDC',6,2,$2) as value",
        [project, base],
      );
    const approve = (id: string) =>
      db.query('select public.approve_agreement($1,$2)', [project, id]);
    const close = (id: string, kind: string, reason: string | null = null) =>
      db.query('select public.resolve_agreement_proposal($1,$2,$3,$4)', [
        project,
        id,
        kind,
        reason,
      ]);
    const active = () =>
      value('select active_agreement_id as value from public.projects where id=$1', [project]);
    const count = (kind: string, id: string) =>
      value(
        'select count(*)::text as value from public.activity_events where kind=$1 and record_id=$2',
        [kind, id],
      );
    await asUser(freelancer);
    const v1 = await publish(null),
      stale = await publish(null);
    await t.test(
      'approval retries record one event and require a distinct second participant',
      async () => {
        await approve(v1);
        await approve(v1);
        assert.equal(await count('agreement_approved', v1), '1');
        assert.equal(await active(), null);
        await asUser(client);
        await approve(v1);
        await approve(v1);
        assert.equal(await active(), v1);
        assert.equal(await count('agreement_approved', v1), '2');
        assert.equal(await count('agreement_activated', v1), '1');
        await assert.rejects(approve(stale), /stale/);
        await asUser(freelancer);
        await assert.rejects(publish(null), /active agreement changed/);
      },
    );
    let rejected: string, withdrawn: string;
    await t.test(
      'client rejection closes a proposal without rewriting approvals or active terms',
      async () => {
        await asUser(freelancer);
        rejected = await publish(v1);
        await approve(rejected);
        await assert.rejects(close(rejected, 'rejected'), /Only the client/);
        await asUser(client);
        await assert.rejects(close(rejected, 'withdrawn'), /Only the client/);
        await assert.rejects(close(rejected, 'rejected', 'x'.repeat(1001)), /at most/);
        await close(rejected, 'rejected', '  Please revise the price.  ');
        await close(rejected, 'rejected', 'Attempt to overwrite');
        assert.equal(await count('agreement_rejected', rejected), '1');
        assert.equal(
          await value(
            'select reason as value from public.agreement_resolutions where agreement_id=$1',
            [rejected],
          ),
          'Please revise the price.',
        );
        assert.equal(await active(), v1);
        await assert.rejects(approve(rejected), /closed/);
        await assert.rejects(close(v1, 'rejected'), /active or previously active/);
        await assert.rejects(
          db.query('update public.agreement_resolutions set reason=$1', ['Edited']),
          /permission denied/,
        );
      },
    );
    await t.test(
      'withdrawal cannot be reversed and replacement terms require fresh approvals',
      async () => {
        await asUser(freelancer);
        withdrawn = await publish(v1);
        await close(withdrawn, 'withdrawn');
        await close(withdrawn, 'withdrawn');
        assert.equal(await count('agreement_withdrawn', withdrawn), '1');
        await assert.rejects(approve(withdrawn), /closed/);
        const replacement = await publish(v1);
        assert.equal(
          await value(
            'select count(*)::text as value from public.agreement_approvals where agreement_id=$1',
            [replacement],
          ),
          '0',
        );
        await approve(replacement);
        assert.equal(await active(), v1);
        await asUser(client);
        await approve(replacement);
        assert.equal(await active(), replacement);
        await assert.rejects(close(v1, 'rejected'), /active or previously active/);
        await asUser(freelancer);
        await assert.rejects(close(v1, 'withdrawn'), /active or previously active/);
        await assert.rejects(close(withdrawn, 'invalid'), /Invalid proposal/);
        const other = await value(
          "select public.create_project('Other project','','Other','Alex') as value",
        );
        await assert.rejects(
          db.query('select public.resolve_agreement_proposal($1,$2,$3)', [
            other,
            replacement,
            'withdrawn',
          ]),
          /Agreement not found/,
        );
      },
    );
    await t.test(
      'history pagination preserves tied timestamps and excludes outsiders and anonymous callers',
      async () => {
        // Owner fixture gives every event the same timestamp to exercise the ID cursor.
        await db.exec('reset role');
        await db.query(
          "update public.activity_events set created_at='2026-10-23T10:00:00.123456Z' where project_id=$1",
          [project],
        );
        await asUser(client);
        const expected = (
          await db.query<{ id: string }>(
            'select id from public.activity_events where project_id=$1 order by created_at desc,id desc',
            [project],
          )
        ).rows.map((r) => r.id);
        let beforeTime: string | null = null,
          beforeId: string | null = null;
        const seen: string[] = [];
        for (let i = 0; i < 20; i++) {
          // PostgreSQL formats the cursor, preserving microseconds rather than JS Date rounding.
          const rows: { id: string; cursor: string }[] = (
            await db.query<{ id: string; cursor: string }>(
              'select id,created_at::text as cursor from public.read_project_activity($1,$2,$3,3)',
              [project, beforeTime, beforeId],
            )
          ).rows;
          if (!rows.length) break;
          seen.push(...rows.map((r) => r.id));
          beforeTime = rows.at(-1)!.cursor;
          beforeId = rows.at(-1)!.id;
        }
        assert.deepEqual(seen, expected);
        assert.equal(new Set(seen).size, seen.length);
        await assert.rejects(
          db.query('select * from public.read_project_activity($1,null,null,101)', [project]),
          /Invalid page size/,
        );
        await assert.rejects(
          db.query('select * from public.read_project_activity($1,now(),null,3)', [project]),
          /complete activity cursor/,
        );
        await asUser(outsider);
        assert.equal((await db.query('select * from public.agreement_resolutions')).rows.length, 0);
        await assert.rejects(close(rejected!, 'rejected'), /Project access/);
        await assert.rejects(approve(withdrawn!), /Project access/);
        await assert.rejects(
          db.query('select * from public.read_project_activity($1)', [project]),
          /Project access/,
        );
        await db.exec('reset role;set role anon');
        await assert.rejects(
          db.query('select * from public.read_project_activity($1)', [project]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
