import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { workerAuthorized, runWorker, type WorkerDependencies } from '../src/lib/worker';

test('worker rejects missing, weak, malformed and incorrect credentials', () => {
  const secret = 'a'.repeat(48);
  assert.equal(workerAuthorized(`Bearer ${secret}`, secret), true);
  for (const header of [
    null,
    secret,
    `bearer ${secret}`,
    `Bearer ${secret}x`,
    `Bearer ${'b'.repeat(48)}`,
  ])
    assert.equal(workerAuthorized(header, secret), false);
  assert.equal(workerAuthorized('Bearer short', 'short'), false);
  assert.equal(workerAuthorized(`Bearer ${secret}`, undefined), false);
});
test('worker bounds each batch, awaits all effects and isolates task/claim failures', async () => {
  let finished = false,
    completed = 0,
    memoryClaims = 0,
    fileClaims = 0;
  const deps: WorkerDependencies = {
    claimRun: async () => 'lease',
    claimMemory: async () => {
      if (++memoryClaims === 1) throw new Error('DB temporarily unavailable');
      return { id: 'memory' };
    },
    claimFile: async () => ({ id: ++fileClaims }),
    memory: async () => {
      await Promise.resolve();
      completed++;
      return true;
    },
    file: async (task) => {
      completed++;
      return (task as { id: number }).id !== 1;
    },
    finish: async (_, memories, files, errors) => {
      assert.equal(completed, 3);
      assert.deepEqual([memories, files, errors], [1, 1, 2]);
      finished = true;
    },
  };
  assert.deepEqual(await runWorker(deps), {
    outcome: 'needs_retry',
    memories: 1,
    files: 1,
    errors: 2,
  });
  assert.equal(finished, true);
  assert.equal(memoryClaims, 2);
  assert.equal(fileClaims, 2);
  deps.claimRun = async () => null;
  assert.equal((await runWorker(deps)).outcome, 'busy');
  assert.equal(memoryClaims, 2);
});
test('background SQL enforces service access, recoverable leases, bounded retries and safe file cleanup', async () => {
  const db = new PGlite(),
    owner = crypto.randomUUID();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;grant insert,select,update,delete on storage.objects to authenticated,anon;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql') && !f.includes('realtime'))
      .sort())
      await db.exec(await readFile(new URL(file, dir), 'utf8'));
    const value = async <T = string>(sql: string, args: unknown[] = []) =>
      (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
    const role = async (name: string) => {
      await db.exec('reset role');
      await db.exec(`set role ${name}`);
    };
    await db.query('insert into auth.users values($1)', [owner]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await role('authenticated');
    const project = await value(
      "select public.create_project('Worker test','','Client','Freelancer') as value",
    );
    const memory = await value(
      "select public.confirm_memory($1,'Require a separate proposal for extra work.','project',$2) as value",
      [project, crypto.randomUUID()],
    );
    for (const name of ['anon', 'authenticated']) {
      await role(name);
      for (const sql of [
        'select public.claim_background_run()',
        'select public.background_status()',
        'select public.claim_file_cleanup(gen_random_uuid())',
        "select public.complete_memory_task(gen_random_uuid(),gen_random_uuid(),null,null,'failed',true)",
      ])
        await assert.rejects(db.exec(sql), /permission denied/);
    }
    await role('service_role');
    const run = await value('select public.claim_background_run() as value');
    assert.ok(run);
    assert.equal(await value('select public.claim_background_run() as value'), null);
    type MemoryClaim = { id: string; lease_token: string; job_id: string | null };
    const claim = await value<MemoryClaim>('select public.claim_background_memory($1) as value', [
      run,
    ]);
    assert.equal(claim.id, memory);
    assert.equal(await value('select public.claim_background_memory($1) as value', [run]), null);
    await assert.rejects(
      db.query("select public.complete_memory_task($1,$2,'job',null,'indexing',false)", [
        memory,
        crypto.randomUUID(),
      ]),
      /lease unavailable/,
    );
    await db.query(
      "select public.complete_memory_task($1,$2,'real-provider-job',null,'indexing',false)",
      [memory, claim.lease_token],
    );
    assert.equal(await value('select public.claim_background_memory($1) as value', [run]), null);
    await role('postgres');
    await db.query(
      "update public.memory_references set next_attempt_at=now()-interval '1 second',task_failures=7 where id=$1",
      [memory],
    );
    await role('service_role');
    const retry = await value<MemoryClaim>('select public.claim_background_memory($1) as value', [
      run,
    ]);
    assert.equal(retry.job_id, 'real-provider-job');
    await db.query(
      "select public.complete_memory_task($1,$2,'real-provider-job',null,'failed',true)",
      [memory, retry.lease_token],
    );
    const status = await value<{ memory_attention: number }>(
      'select public.background_status() as value',
    );
    assert.equal(status.memory_attention, 1);
    await role('postgres');
    await db.query(
      "update public.memory_references set next_attempt_at=now()-interval '1 second' where id=$1",
      [memory],
    );
    await role('service_role');
    assert.equal(await value('select public.claim_background_memory($1) as value', [run]), null);
    await role('authenticated');
    const manual = await value<MemoryClaim>('select public.claim_memory_job($1) as value', [
      memory,
    ]);
    await db.query('select public.request_memory_deletion($1)', [memory]);
    await role('service_role');
    await db.query(
      "select public.complete_memory_task($1,$2,'real-provider-job','real-provider-blob','ready',false)",
      [memory, manual.lease_token],
    );
    await role('postgres');
    const suppressed = await value<{ status: string; blob_id: string }>(
      'select to_jsonb(m) as value from public.memory_references m where id=$1',
      [memory],
    );
    assert.equal(suppressed.status, 'suppressed');
    assert.equal(suppressed.blob_id, 'real-provider-blob');
    assert.equal(
      await value(
        'select blob_id as value from public.memory_deletion_requests where memory_id=$1',
        [memory],
      ),
      'real-provider-blob',
    );
    // Abandoned uploads, current uploads, ready files and removed objects use the same reserved paths.
    const ids: string[] = [];
    for (const [state, age] of [
      ['pending', '2 hours'],
      ['pending', '5 minutes'],
      ['ready', '2 hours'],
      ['removed', '2 hours'],
    ]) {
      const id = crypto.randomUUID();
      ids.push(id);
      await db.query(
        `insert into public.project_files(id,project_id,uploaded_by,name,object_path,mime,size_bytes,kind,status,idempotency_key,created_at,sha256,ready_at) values($1,$2,$3,'brief.txt',$4,'text/plain',10,'attachment',$5,$6,now()-$7::interval,$8,$9)`,
        [
          id,
          project,
          owner,
          `${project}/${id}/file`,
          state,
          crypto.randomUUID(),
          age,
          state === 'ready' ? 'a'.repeat(64) : null,
          state === 'ready' ? new Date().toISOString() : null,
        ],
      );
    }
    await role('service_role');
    type FileClaim = { id: string; token: string; path: string };
    const file1 = await value<FileClaim>('select public.claim_file_cleanup($1) as value', [run]);
    assert.ok([ids[0], ids[3]].includes(file1.id));
    assert.equal(file1.path, `${project}/${file1.id}/file`);
    const file2 = await value<FileClaim>('select public.claim_file_cleanup($1) as value', [run]);
    assert.notEqual(file2.id, file1.id);
    assert.equal(await value('select public.claim_file_cleanup($1) as value', [run]), null);
    await assert.rejects(
      db.query('select public.complete_file_cleanup($1,$2,true)', [file1.id, crypto.randomUUID()]),
      /lease unavailable/,
    );
    await db.query('select public.complete_file_cleanup($1,$2,false)', [file1.id, file1.token]);
    await db.query('select public.complete_file_cleanup($1,$2,true)', [file2.id, file2.token]);
    await role('postgres');
    assert.equal(
      await value('select object_deleted_at as value from public.project_files where id=$1', [
        file1.id,
      ]),
      null,
    );
    assert.ok(
      await value('select object_deleted_at as value from public.project_files where id=$1', [
        file2.id,
      ]),
    );
    // Simulate interrupted invocation; expired leases recover without granting stale completion.
    await db.exec(
      "update private.background_state set lease_until=now()-interval '1 second',started_at=now()-interval '3 minutes';",
    );
    await role('service_role');
    const next = await value('select public.claim_background_run() as value');
    assert.ok(next);
    assert.notEqual(next, run);
    await assert.rejects(
      db.query('select public.finish_background_run($1,0,0,0)', [run]),
      /lease unavailable/,
    );
    await db.query('select public.finish_background_run($1,0,1,1)', [next]);
    assert.equal(
      (await value<{ outcome: string }>('select public.background_status() as value')).outcome,
      'needs_retry',
    );
  } finally {
    await db.close();
  }
});
