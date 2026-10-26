import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { fileInput, fileMime, validateFileBytes, MAX_FILE_BYTES } from '../src/lib/files';

test('private uploads reject spoofed content, executable types, unsafe names and oversized files', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\nexample');
  assert.equal(validateFileBytes(pdf, 'brief.pdf', pdf.length), 'application/pdf');
  assert.equal(fileMime('photo.JPG'), 'image/jpeg');
  assert.equal(fileMime('file.svg'), null);
  assert.throws(() => validateFileBytes(pdf, 'brief.png', pdf.length));
  assert.throws(() => validateFileBytes(pdf, 'brief.pdf', pdf.length + 1));
  assert.throws(() =>
    validateFileBytes(new Uint8Array(MAX_FILE_BYTES + 1), 'a.txt', MAX_FILE_BYTES + 1),
  );
  assert.throws(() => validateFileBytes(new Uint8Array([255, 254]), 'a.txt', 2));
  assert.throws(() => validateFileBytes(new Uint8Array([0, 65]), 'a.txt', 2));
  assert.equal(validateFileBytes(new TextEncoder().encode('Hello'), 'note.txt', 5), 'text/plain');
  const valid = {
    projectId: crypto.randomUUID(),
    key: crypto.randomUUID(),
    name: 'design.pdf',
    size: pdf.length,
    kind: 'attachment',
    milestoneId: null,
    rule: null,
    invoiceId: null,
    quote: null,
  };
  assert.ok(fileInput.safeParse(valid).success);
  for (const name of ['../file.pdf', 'a\\b.pdf', 'bad\nname.pdf'])
    assert.equal(fileInput.safeParse({ ...valid, name }).success, false);
});

test('private files enforce reserved uploads, trusted completion, explicit release and current receipt gates', async (t) => {
  const db = new PGlite(),
    f = crypto.randomUUID(),
    c = crypto.randomUUID(),
    o = crypto.randomUUID();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;grant execute on function auth.uid() to authenticated;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated,anon;grant insert,select,update,delete on storage.objects to authenticated,anon;
   -- Simulate an unrelated broad storage policy: restrictive Parius policies still win.
   create policy broad_read on storage.objects for select to authenticated using(true);
   create policy broad_insert on storage.objects for insert to authenticated with check(true);
   create policy broad_update on storage.objects for update to authenticated using(true) with check(true);
   create policy broad_delete on storage.objects for delete to authenticated using(true);
  `);
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
      '202610240001_private_files.sql',
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
    const project = await value(
      "select public.create_project('Studio website','','Studio','Freelancer') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'f'.repeat(64)]);
    await asUser(c);
    await db.query('select public.accept_project_invite($1,$2)', ['f'.repeat(64), 'Client']);
    await asUser(f);
    const quote = 'Final files are released after full payment and client acceptance.';
    const ag = await value(
      "select public.propose_agreement($1,'Website scope',$2,'100000000','USDC',6,1,null) as value",
      [project, quote],
    );
    await db.query('select public.approve_agreement($1,$2)', [project, ag]);
    await asUser(c);
    await db.query('select public.approve_agreement($1,$2)', [project, ag]);
    await asUser(f);
    const milestone = await value(
      "select public.add_milestone($1,'Website design',null) as value",
      [project],
    );
    const invoice = await value(
      "select public.draft_invoice($1,$2,'Website final','100000000',null,$3) as value",
      [project, ag, milestone],
    );
    await db.query('select public.issue_invoice($1,null,null)', [invoice]);
    type Reservation = { id: string; path: string; status: string };
    const reserve = (
      kind = 'attachment',
      key = crypto.randomUUID(),
      m: string | null = null,
      rule: string | null = null,
      inv: string | null = null,
      q: string | null = null,
    ) =>
      value<Reservation>(
        'select public.reserve_project_file($1,$2,$3,100,$4,$5,$6,$7,$8,$9) as value',
        [project, 'design.pdf', 'application/pdf', kind, m, rule, inv, q, key],
      );
    const upload = (path: string) =>
      db.query("insert into storage.objects(bucket_id,name) values('parius-project-files',$1)", [
        path,
      ]);
    async function finish(id: string) {
      await db.exec('reset role;set role service_role');
      await db.query('select public.finish_project_file($1,$2)', [id, 'a'.repeat(64)]);
    }
    let attachment: Reservation, final: Reservation, receipt: string;
    await t.test(
      'members reserve immutable own paths, no direct reads/overwrite even under broad policies',
      async () => {
        await asUser(o);
        await assert.rejects(reserve(), /membership/);
        await asUser(c);
        await assert.rejects(
          reserve('final', crypto.randomUUID(), milestone, 'invoice_paid', invoice, quote),
          /freelancer/,
        );
        const key = crypto.randomUUID();
        attachment = await reserve('attachment', key);
        assert.equal((await reserve('attachment', key)).id, attachment.id);
        await assert.rejects(
          db.query(
            "select public.reserve_project_file($1,'other.pdf','application/pdf',100,'attachment',null,null,null,null,$2)",
            [project, key],
          ),
          /retry/,
        );
        await asUser(f);
        await assert.rejects(upload(attachment.path), /row-level/);
        await asUser(c);
        await assert.rejects(upload(project + '/random/file'), /row-level/);
        await upload(attachment.path);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        assert.equal(
          (await db.query("update storage.objects set name='changed' returning *")).rows.length,
          0,
        );
        assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 0);
        await assert.rejects(
          db.query('select public.finish_project_file($1,$2)', [attachment.id, 'a'.repeat(64)]),
          /permission denied/,
        );
        await asUser(f);
        assert.equal((await db.query('select * from public.project_files')).rows.length, 0);
        await finish(attachment.id);
        await asUser(f);
        assert.equal(
          (
            await value<{ path: string }>('select public.authorize_file_download($1) as value', [
              attachment.id,
            ])
          ).path,
          attachment.path,
        );
        await asUser(o);
        assert.equal((await db.query('select * from public.project_files')).rows.length, 0);
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [attachment.id]),
          /unavailable/,
        );
      },
    );
    await t.test(
      'final needs exact approved clause, milestone in project and a real uploaded object',
      async () => {
        await asUser(f);
        await assert.rejects(
          reserve(
            'final',
            crypto.randomUUID(),
            milestone,
            'invoice_paid',
            invoice,
            'invented terms',
          ),
          /quoted exactly/,
        );
        await assert.rejects(
          reserve(
            'final',
            crypto.randomUUID(),
            crypto.randomUUID(),
            'invoice_paid',
            invoice,
            quote,
          ),
          /milestone/,
        );
        final = await reserve(
          'final',
          crypto.randomUUID(),
          milestone,
          'invoice_paid',
          invoice,
          quote,
        );
        await assert.rejects(finish(final.id), /not found/);
        await asUser(f);
        await upload(final.path);
        await finish(final.id);
        await asUser(c);
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [final.id]),
          /not available/,
        );
        await assert.rejects(
          db.query('select public.release_project_file($1,true)', [final.id]),
          /Freelancer/,
        );
        await asUser(f);
        await assert.rejects(
          db.query('select public.release_project_file($1,false)', [final.id]),
          /confirmation/,
        );
        await assert.rejects(
          db.query('select public.release_project_file($1,true)', [final.id]),
          /Release needs/,
        );
      },
    );
    await t.test(
      'only accepted milestone plus full actual recorded receipts and explicit freelancer release unlock',
      async () => {
        await asUser(f);
        await db.query("select public.transition_milestone($1,$2,'in_progress')", [
          project,
          milestone,
        ]);
        await db.query("select public.transition_milestone($1,$2,'ready_for_review')", [
          project,
          milestone,
        ]);
        await asUser(c);
        await db.query("select public.transition_milestone($1,$2,'accepted')", [
          project,
          milestone,
        ]);
        await asUser(f);
        receipt = await value(
          "select public.record_manual_payment($1,'99999999','Actual received partial payment',now(),$2) as value",
          [invoice, crypto.randomUUID()],
        );
        await assert.rejects(
          db.query('select public.release_project_file($1,true)', [final.id]),
          /Release needs/,
        );
        await db.query("select public.record_manual_payment($1,'1','Balance received',now(),$2)", [
          invoice,
          crypto.randomUUID(),
        ]);
        await asUser(c);
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [final.id]),
          /not available/,
        );
        await asUser(f);
        await db.query('select public.release_project_file($1,true)', [final.id]);
        await db.query('select public.release_project_file($1,true)', [final.id]);
        await asUser(c);
        assert.equal(
          (
            await value<{ path: string }>('select public.authorize_file_download($1) as value', [
              final.id,
            ])
          ).path,
          final.path,
        );
        await asUser(f);
        await db.query('select public.reverse_manual_payment($1)', [receipt]);
        await asUser(c);
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [final.id]),
          /not available/,
        );
      },
    );
    await t.test(
      'removal revokes future access, is uploader-only and prevents late completion or new writes',
      async () => {
        await asUser(f);
        await assert.rejects(
          db.query('select public.remove_project_file($1)', [attachment.id]),
          /uploader/,
        );
        await asUser(c);
        await db.query('select public.remove_project_file($1)', [attachment.id]);
        await db.query('select public.remove_project_file($1)', [attachment.id]);
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [attachment.id]),
          /unavailable/,
        );
        await assert.rejects(upload(attachment.path), /row-level/);
        await assert.rejects(finish(attachment.id), /unavailable/);
        await asUser(f);
        const pending = await reserve();
        await db.exec('reset role');
        await db.query(
          "update public.project_files set created_at=now()-interval '31 minutes' where id=$1",
          [pending.id],
        );
        await asUser(f);
        await assert.rejects(upload(pending.path), /row-level/);
        assert.equal(
          await value<number>(
            'select count(*)::integer as value from public.agreement_approvals where agreement_id=$1',
            [ag],
          ),
          2,
        );
        assert.equal(
          await value('select active_agreement_id as value from public.projects where id=$1', [
            project,
          ]),
          ag,
        );
        await db.exec('reset role;set role anon');
        await assert.rejects(
          db.query('select public.authorize_file_download($1)', [final.id]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
