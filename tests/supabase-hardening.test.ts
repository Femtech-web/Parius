import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { usdcTypes } from '../src/features/payments/domain';

const recipient = '0x' + '22'.repeat(32);
const wallet = (byte: string) => '0x' + byte.repeat(32);

/** All migrations, applied with Supabase's default grants to anon/authenticated on new public objects. */
async function supabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `);
  const folder = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(file, folder), 'utf8'));
  const as = async (user: string | null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
    await db.exec(user ? 'set role authenticated' : 'set role service_role');
  };
  const value = async <T = string>(sql: string, args: unknown[] = []) =>
    (await db.query<{ v: T }>(sql, args)).rows[0]?.v as T;
  const user = async () => {
    const id = randomUUID();
    await db.exec('reset role');
    await db.query('insert into auth.users values($1)', [id]);
    return id;
  };
  /** Freelancer and client with an approved USDC agreement and issued Testnet invoices. */
  const project = async (freelancer: string, client: string, invoices: number) => {
    await as(freelancer);
    const id = await value("select public.create_project('Hardening','','Client','Freelancer') v");
    const token = randomUUID().replace(/-/g, '').repeat(2);
    await db.query('select public.create_project_invite($1,$2)', [id, token]);
    await as(client);
    await db.query('select public.accept_project_invite($1,$2)', [token, 'Client']);
    await as(freelancer);
    const agreement = await value(
      "select public.propose_agreement($1,'Agreed work','Build the approved website only.','100000000','USDC',6,1,null) v",
      [id],
    );
    await db.query('select public.approve_agreement($1,$2)', [id, agreement]);
    await as(client);
    await db.query('select public.approve_agreement($1,$2)', [id, agreement]);
    await as(freelancer);
    const ids: string[] = [];
    for (let n = 0; n < invoices; n++) {
      const invoice = await value(
        "select public.draft_invoice($1,$2,'Invoice part','1000000',null,null) v",
        [id, agreement],
      );
      await db.query("select public.issue_invoice($1,'testnet',$2)", [invoice, recipient]);
      ids.push(invoice);
    }
    return { id, invoices: ids };
  };
  const bindWallet = async (owner: string, address: string) => {
    await as(null);
    const challenge = await value<{ id: string }>(
      "select public.begin_wallet_challenge($1,$2,'testnet','https://parius.example') v",
      [owner, address],
    );
    await db.query('select public.complete_wallet_challenge($1,$2,$3)', [
      challenge.id,
      owner,
      'e'.repeat(64),
    ]);
  };
  return { db, as, value, user, project, bindWallet };
}

test('Supabase default grants leave no anonymous function or client-side table write', async () => {
  const { db } = await supabase();
  const writable = await db.query<{ t: string }>(`
    select c.relname||':'||r.role||':'||p.op t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated')) r(role) cross join (values('INSERT'),('UPDATE'),('DELETE')) p(op)
    where n.nspname='public' and c.relkind in ('r','v','m') and has_table_privilege(r.role,c.oid,p.op)`);
  assert.deepEqual(writable.rows, []);
  const anonymous = await db.query<{ f: string }>(`
    select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')`);
  assert.deepEqual(anonymous.rows, []);
  const unprotected = await db.query<{ t: string }>(`
    select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
  assert.deepEqual(unprotected.rows, []);
});

test('per-account write budgets stop message and project floods without blocking others', async () => {
  const { db, as, value, user, project } = await supabase();
  const [f, c, other] = [await user(), await user(), await user()];
  const { id } = await project(f, c, 0);
  await as(c);
  for (let n = 0; n < 20; n++)
    await db.query("select public.send_message($1,'Status update',$2,'chat')", [id, randomUUID()]);
  await assert.rejects(
    db.query("select public.send_message($1,'One too many',$2,'chat')", [id, randomUUID()]),
    /Too many requests/,
  );
  await as(f);
  await db.query("select public.send_message($1,'Freelancer reply',$2,'chat')", [id, randomUUID()]);
  // Rejected writes roll back their budget entry; an outsider cannot burn a member's budget.
  await as(other);
  await assert.rejects(
    db.query("select public.send_message($1,'Not a member',$2,'chat')", [id, randomUUID()]),
    /Project access required/,
  );
  for (let n = 0; n < 5; n++)
    await value("select public.create_project('Side project','','Client','Owner') v");
  await assert.rejects(
    db.query("select public.create_project('Flood project','','Client','Owner')"),
    /Too many requests/,
  );
  await as(null);
  await db.exec('reset role;set role anon');
  await assert.rejects(
    db.query("select public.send_message($1,'Anonymous',$2,'chat')", [id, randomUUID()]),
    /permission denied/,
  );
});

test('one account cannot exhaust the shared gas sponsorship reservation', async () => {
  const { db, as, value, user, project, bindWallet } = await supabase();
  const [f, attacker, client] = [await user(), await user(), await user()];
  const own = await project(f, attacker, 3);
  const theirs = await project(f, client, 1);
  await bindWallet(attacker, wallet('11'));
  await bindWallet(client, wallet('33'));
  const sponsored = async (owner: string, invoice: string, payer: string) => {
    await as(owner);
    const request = await value("select public.prepare_payment_request($1,$2,'1000000') v", [
      invoice,
      payer,
    ]);
    return db.query("select public.reserve_payment_checkout($1,'sponsored')", [request]);
  };
  await sponsored(attacker, own.invoices[0], wallet('11'));
  await sponsored(attacker, own.invoices[1], wallet('11'));
  await assert.rejects(
    sponsored(attacker, own.invoices[2], wallet('11')),
    /sponsorship allowance is in use/,
  );
  assert.ok((await sponsored(client, theirs.invoices[0], wallet('33'))).rows.length);
});

test('a transfer matched to one payment request cannot be matched to another, even in a race', async () => {
  const { db, as, value, user, project, bindWallet } = await supabase();
  const [f, c] = [await user(), await user()];
  const { invoices } = await project(f, c, 3);
  const payer = wallet('44'),
    digest = '4'.repeat(44);
  await bindWallet(c, payer);
  await as(c);
  const requests: string[] = [];
  for (const invoice of invoices)
    requests.push(
      await value("select public.prepare_payment_request($1,$2,'1000000') v", [invoice, payer]),
    );
  const reserve = async (request: string) => {
    await db.exec('reset role');
    await db.query("update private.payment_attempts set created_at=now()-interval '1 minute'");
    await as(c);
    return value<{ id: string; lease_token: string }>(
      'select public.reserve_payment_check($1,$2) v',
      [request, digest],
    );
  };
  const finish = async (claim: { id: string; lease_token: string }) => {
    await as(null);
    const proof = {
      provider: 'Tatum',
      network: 'testnet',
      chainId: '4c78adac',
      digest,
      sender: payer,
      recipient,
      coinType: usdcTypes.testnet,
      amountAtomic: '1000000',
      checkpoint: '10',
      timestamp: new Date().toISOString(),
    };
    return db.query('select public.finish_payment_check($1,$2,$3,null)', [
      claim.id,
      claim.lease_token,
      JSON.stringify(proof),
    ]);
  };
  const first = await reserve(requests[0]);
  const racing = await reserve(requests[2]);
  await finish(first);
  await assert.rejects(finish(racing), /one_matched_claim_per_digest/);
  await assert.rejects(reserve(requests[1]), /already matched to another payment request/);
  await as(c);
  const statuses = await db.query<{ status: string }>(
    'select status from public.payment_claims order by status',
  );
  assert.deepEqual(
    statuses.rows.map((r) => r.status),
    ['checking', 'verified'],
  );
});
