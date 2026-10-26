import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const freelancer = '10000000-0000-4000-8000-000000000001',
  client = '10000000-0000-4000-8000-000000000002',
  outsider = '10000000-0000-4000-8000-000000000003';
test('PostgreSQL enforces private membership, version approvals and human review', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; grant usage on schema public to authenticated;`,
    );
    await db.query('insert into auth.users values ($1),($2),($3)', [freelancer, client, outsider]);
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610220001_workspace.sql', import.meta.url),
        'utf8',
      ),
    );
    async function asUser(id: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    }
    async function value(sql: string, args: unknown[] = []) {
      const result = await db.query<{ value: string }>(sql, args);
      return result.rows[0]?.value;
    }
    await asUser(freelancer);
    const project = await value(
      "select public.create_project('Portfolio site','A new studio website','Forma Studio','Alex') as value",
    );
    await t.test('outsiders cannot see project records or send messages', async () => {
      await asUser(outsider);
      assert.equal((await db.query('select * from public.projects')).rows.length, 0);
      await assert.rejects(
        db.query('select public.send_message($1,$2,$3)', [
          project,
          'Unauthorized message',
          crypto.randomUUID(),
        ]),
        /Project access required/,
      );
      await assert.rejects(
        db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]),
        /Only the freelancer/,
      );
    });
    await t.test(
      'invitations require a distinct client, are single-use, and expose no hashes',
      async () => {
        await asUser(freelancer);
        await db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]);
        await assert.rejects(
          db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Alex']),
          /separate client/,
        );
        await assert.rejects(db.query('select * from public.project_invites'), /permission denied/);
        await asUser(client);
        assert.equal(
          await value('select public.accept_project_invite($1,$2) as value', [
            'a'.repeat(64),
            'Amara',
          ]),
          project,
        );
        await asUser(outsider);
        await assert.rejects(
          db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Third party']),
          /already used/,
        );
      },
    );
    await t.test(
      'messages are idempotent and actual authors are assigned by the database',
      async () => {
        await asUser(client);
        const key = crypto.randomUUID();
        const first = await value('select public.send_message($1,$2,$3) as value', [
          project,
          'A real client request',
          key,
        ]);
        assert.equal(
          await value('select public.send_message($1,$2,$3) as value', [
            project,
            'A real client request',
            key,
          ]),
          first,
        );
        const result = await db.query<{ author_id: string }>(
          'select author_id from public.messages where id=$1',
          [first],
        );
        assert.equal(result.rows[0].author_id, client);
        await assert.rejects(
          db.query(
            'insert into public.messages(project_id,author_id,author_name,body,idempotency_key) values($1,$2,$3,$4,$5)',
            [project, freelancer, 'Forged', 'Fake', crypto.randomUUID()],
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      'both people must approve the same immutable version; stale proposals cannot replace it',
      async () => {
        await asUser(freelancer);
        const args = [
          project,
          'Website scope',
          'Five portfolio pages with two design revision rounds.',
          '2400000000',
          'USDC',
          6,
          2,
        ];
        const v1 = await value(
          'select public.propose_agreement($1,$2,$3,$4,$5,$6,$7) as value',
          args,
        );
        const v2 = await value(
          'select public.propose_agreement($1,$2,$3,$4,$5,$6,$7) as value',
          args,
        );
        await db.query('select public.approve_agreement($1,$2)', [project, v1]);
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [
            project,
          ]),
          null,
        );
        await assert.rejects(
          db.query('update public.agreement_versions set amount_atomic=$1 where id=$2', ['1', v1]),
          /permission denied/,
        );
        await asUser(client);
        await db.query('select public.approve_agreement($1,$2)', [project, v1]);
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [
            project,
          ]),
          v1,
        );
        await assert.rejects(
          db.query('select public.approve_agreement($1,$2)', [project, v2]),
          /stale/,
        );
        await assert.rejects(
          db.query('select public.propose_agreement($1,$2,$3,$4,$5,$6,$7)', args),
          /Only the freelancer/,
        );
      },
    );
    await t.test(
      'milestone acceptance requires a separate client after freelancer review submission',
      async () => {
        await asUser(freelancer);
        const milestone = await value('select public.add_milestone($1,$2) as value', [
          project,
          'Homepage design',
        ]);
        await assert.rejects(
          db.query('select public.transition_milestone($1,$2,$3)', [
            project,
            milestone,
            'accepted',
          ]),
          /appropriate participant/,
        );
        await db.query('select public.transition_milestone($1,$2,$3)', [
          project,
          milestone,
          'in_progress',
        ]);
        await asUser(client);
        await assert.rejects(
          db.query('select public.transition_milestone($1,$2,$3)', [
            project,
            milestone,
            'accepted',
          ]),
          /appropriate participant/,
        );
        await asUser(freelancer);
        await db.query('select public.transition_milestone($1,$2,$3)', [
          project,
          milestone,
          'ready_for_review',
        ]);
        await asUser(client);
        await db.query('select public.transition_milestone($1,$2,$3)', [
          project,
          milestone,
          'accepted',
        ]);
        assert.equal(
          await value('select state as value from public.milestones where id=$1', [milestone]),
          'accepted',
        );
        await asUser(outsider);
        assert.equal((await db.query('select * from public.messages')).rows.length, 0);
        assert.equal((await db.query('select * from public.agreement_versions')).rows.length, 0);
        assert.equal((await db.query('select * from public.activity_events')).rows.length, 0);
      },
    );
  } finally {
    await db.close();
  }
});
