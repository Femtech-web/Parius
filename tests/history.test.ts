import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  historyCursor,
  historyFilter,
  mergeHistory,
  compareHistory,
  collectNewHistory,
  cursorOf,
  type HistoryRow,
} from '../src/lib/history';
const id = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const rows = Array.from({ length: 307 }, (_, i) => ({
  id: id(i + 1),
  created_at: `2026-10-24T00:00:00.${String(Math.floor(i / 9)).padStart(6, '0')}Z`,
  body: `Message ${i + 1}`,
}));
test('history cursors preserve PostgreSQL microseconds and exact tied ID order', () => {
  assert.ok(compareHistory(rows[0], rows[10]) < 0);
  assert.ok(compareHistory(rows[0], rows[1]) < 0);
  assert.deepEqual(mergeHistory([rows[1], rows[0]], [{ ...rows[1], body: 'Updated' }], true), [
    rows[0],
    { ...rows[1], body: 'Updated' },
  ]);
  assert.ok(
    compareHistory(
      { id: id(1), created_at: '2026-10-24T01:00:00.000001+01:00' },
      { id: id(1), created_at: '2026-10-24T00:00:00.000002Z' },
    ) < 0,
  );
  assert.ok(historyFilter(cursorOf(rows[0])).includes('id.lt.'));
  for (const created_at of [
    'today',
    '2026-10-24T00:00:00.0000001Z',
    '2026-10-24T00:00:00Z),id.gt.x',
  ]) {
    assert.equal(historyCursor.safeParse({ id: id(1), created_at }).success, false);
  }
});
test('catch-up bridges more than one head page, deduplicates overlap and fails explicitly without replacing snapshots', async () => {
  const initial = rows.slice(0, 7).reverse();
  const collected = await collectNewHistory(initial, async (cursor) => {
    const eligible = rows.filter((r) => !cursor || compareHistory(r, cursor) > 0);
    return { rows: eligible.slice(0, 25), hasMore: eligible.length > 25 };
  });
  const merged = mergeHistory(initial, collected, true);
  assert.deepEqual(merged, rows);
  assert.equal(new Set(merged.map((r) => r.id)).size, 307);
  await assert.rejects(
    collectNewHistory(initial, async () => ({ rows: [rows[0]], hasMore: true })),
    /did not advance/,
  );
  await assert.rejects(
    collectNewHistory(initial, async () => ({ rows: [], error: 'Unavailable' })),
    /Unavailable/,
  );
  await assert.rejects(
    collectNewHistory(
      initial,
      async (cursor) => ({
        rows: rows.filter((r) => !cursor || compareHistory(r, cursor) > 0).slice(0, 1),
        hasMore: true,
      }),
      2,
    ),
    /limit/,
  );
  assert.deepEqual(initial, rows.slice(0, 7).reverse());
});
test('database history pages retain RLS, tied timestamps, concurrent inserts, draft privacy and full ledger totals', async (t) => {
  const db = new PGlite(),
    f = id(9001),
    c = id(9002),
    o = id(9003);
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, o]);
    for (const file of [
      '202610220001_workspace.sql',
      '202610230001_agreement_lifecycle.sql',
      '202610230004_invoices_and_receipts.sql',
      '202610240002_history_indexes.sql',
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
      "select public.create_project('History project','','Client studio','Freelancer') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['a'.repeat(64), 'Client']);
    await asUser(f);
    const agreement = await value(
      "select public.propose_agreement($1,'Project terms','A website with agreed milestone payments.','1000000','USDC',6,1,null) as value",
      [project],
    );
    await db.exec('reset role');
    for (const row of rows)
      await db.query(
        "insert into public.messages(id,project_id,author_id,author_name,body,idempotency_key,source,created_at) values($1,$2,$3,'Client',$4,$5,'chat',$6)",
        [row.id, project, c, row.body, crypto.randomUUID(), row.created_at],
      );
    async function page(cursor?: HistoryRow, newer = false) {
      return (
        await db.query<HistoryRow>(
          `select id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at from public.messages where project_id=$1 ${cursor ? `and (created_at,id) ${newer ? '>' : '<'} ($2::timestamptz,$3::uuid)` : ''} order by created_at ${newer ? 'asc' : 'desc'},id ${newer ? 'asc' : 'desc'} limit 101`,
          cursor ? [project, cursor.created_at, cursor.id] : [project],
        )
      ).rows;
    }
    await t.test(
      'older pages survive concurrent new rows and preserve exact boundaries',
      async () => {
        await asUser(c);
        let next = await page();
        const first = next.slice(0, 100),
          all = [...first];
        await db.exec('reset role');
        await db.query(
          "insert into public.messages(project_id,author_id,author_name,body,idempotency_key,created_at) values($1,$2,'Client','Concurrent new message',$3,'2026-10-24T00:00:01Z')",
          [project, c, crypto.randomUUID()],
        );
        await asUser(c);
        while (next.length > 100) {
          next = await page(all.at(-1));
          all.push(...next.slice(0, 100));
        }
        assert.equal(all.length, 307);
        assert.equal(new Set(all.map((r) => r.id)).size, 307);
        assert.deepEqual(
          all.map((r) => r.id),
          rows.toReversed().map((r) => r.id),
        );
        const catchup = await page(first[0], true);
        assert.equal(catchup.length, 1);
      },
    );
    const invoice = id(9500),
      privateInvoice = id(9501);
    await db.exec('reset role');
    await db.query(
      "insert into public.invoices(id,project_id,agreement_id,title,amount_atomic,currency,decimals,status,issued_at) values($1,$2,$3,'Issued invoice','1000','USDC',6,'issued',now()),($4,$2,$3,'Private draft','100','USDC',6,'draft',null)",
      [invoice, project, agreement, privateInvoice],
    );
    for (let i = 0; i < 60; i++)
      await db.query(
        "insert into public.payment_records(project_id,invoice_id,amount_atomic,source,note,paid_at,created_by,idempotency_key,created_at,reversed_at) values($1,$2,'20','manual','Actual received',now(),$3,$4,'2026-10-24T00:00:00.123456Z',case when $5 then now() end)",
        [project, invoice, f, crypto.randomUUID(), i === 0],
      );
    await t.test(
      'receipt windows never become balance totals and refresh shows reversals',
      async () => {
        await asUser(c);
        const visible = (
          await db.query<{ amount_atomic: string }>(
            'select amount_atomic from public.payment_records where invoice_id=$1 order by created_at desc,id desc limit 25',
            [invoice],
          )
        ).rows;
        assert.equal(visible.length, 25);
        assert.equal(
          await value('select paid as value from public.invoice_balances where invoice_id=$1', [
            invoice,
          ]),
          '1180',
        );
        assert.notEqual(
          visible.reduce((sum, r) => sum + BigInt(r.amount_atomic), 0n),
          1180n,
        );
        assert.equal(
          await value<number>(
            'select count(*)::integer as value from public.invoices where id=$1',
            [privateInvoice],
          ),
          0,
        );
        await asUser(f);
        assert.equal(
          await value<number>(
            'select count(*)::integer as value from public.invoices where id=$1',
            [privateInvoice],
          ),
          1,
        );
        const receipt = await value(
          'select id as value from public.payment_records where invoice_id=$1 and reversed_at is null limit 1',
          [invoice],
        );
        await db.query('select public.reverse_manual_payment($1)', [receipt]);
        assert.equal(
          await value('select paid as value from public.invoice_balances where invoice_id=$1', [
            invoice,
          ]),
          '1160',
        );
      },
    );
    await t.test('outsiders and anonymous callers cannot page into another workspace', async () => {
      await asUser(o);
      assert.equal((await page()).length, 0);
      assert.equal(
        await value<number>('select count(*)::integer as value from public.payment_records'),
        0,
      );
      assert.equal(
        await value<number>('select count(*)::integer as value from public.invoice_balances'),
        0,
      );
      await db.exec('reset role;set role anon');
      await assert.rejects(page(), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
