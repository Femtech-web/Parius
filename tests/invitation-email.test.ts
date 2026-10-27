import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  invitationEmailInput,
  invitationMessage,
  submitInvitationEmail,
} from '../src/features/projects/invitation-email';

test('invitation email validates inputs and preserves the single-use sign-in/acceptance flow', () => {
  const valid = {
    projectId: crypto.randomUUID(),
    token: 'a'.repeat(64),
    email: 'Client@Example.com',
  };
  assert.equal(invitationEmailInput.parse(valid).email, 'client@example.com');
  for (const data of [
    { ...valid, token: 'https://evil.example/invite' },
    { ...valid, email: 'client@example.com\r\nBcc:other@example.com' },
    { ...valid, projectId: '../other' },
  ])
    assert.equal(invitationEmailInput.safeParse(data).success, false);
  const message = invitationMessage(
    'https://parius.example',
    valid.token,
    'Parius <notifications@example.com>',
    valid.email,
    'Website test',
  );
  assert.match(message.text, /Website test/);
  assert.match(message.text, new RegExp(`https://parius.example/invite/${valid.token}`));
  assert.match(message.text, /Accept invitation/);
  assert.match(message.text, /Anyone holding it/);
  assert.equal(message.subject.includes('\n'), false);
});
test('email submission uses a stable Resend identity and does not treat errors or malformed responses as success', async () => {
  const message = invitationMessage(
    'http://127.0.0.1:3000',
    'a'.repeat(64),
    'Parius <notifications@example.com>',
    'client@example.com',
    'Website test',
  );
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init?.redirect, 'error');
    assert.equal(
      new Headers(init?.headers).get('Idempotency-Key'),
      'parius-invitation/email-record',
    );
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-key');
    assert.deepEqual(JSON.parse(String(init?.body)), message);
    return Response.json({ id: 'fixture-provider-id' });
  };
  assert.equal(
    await submitInvitationEmail('fixture-key', 'email-record', message, transport),
    'fixture-provider-id',
  );
  assert.equal(calls, 1);
  await assert.rejects(
    submitInvitationEmail('fixture-key', 'email-record', message, async () =>
      Response.json({ error: 'unavailable' }, { status: 429 }),
    ),
    /not confirmed/,
  );
  await assert.rejects(
    submitInvitationEmail('fixture-key', 'email-record', message, async () => Response.json({})),
    /not confirmed/,
  );
});
test('invitation email SQL requires freelancer/current token, hides recipients, bounds sends and saves trusted confirmation only', async () => {
  const db = new PGlite(),
    f = crypto.randomUUID(),
    c = crypto.randomUUID(),
    o = crypto.randomUUID();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant usage on schema public to service_role;`,
    );
    await db.query('insert into auth.users values($1),($2),($3)', [f, c, o]);
    for (const file of ['202610220001_workspace.sql', '202610250001_invitation_email.sql'])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    const role = async (name: string, user?: string) => {
      await db.exec('reset role');
      if (user) await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec(`set role ${name}`);
    };
    const value = async <T = string>(sql: string, args: unknown[] = []) =>
      (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
    await role('authenticated', f);
    const project = await value(
      "select public.create_project('Email test','','Studio','Freelancer') as value",
    );
    await db.query('select public.create_project_invite($1,$2)', [project, 'a'.repeat(64)]);
    const reserve = (
      email = 'client@example.com',
      token = 'a'.repeat(64),
      payload = 'b'.repeat(64),
    ) =>
      value<{ id: string; lease_token: string; cached: boolean }>(
        'select public.reserve_invitation_email($1,$2,$3,$4) as value',
        [project, token, email, payload],
      );
    await role('anon');
    await assert.rejects(reserve(), /permission denied/);
    await role('authenticated', o);
    await assert.rejects(reserve(), /Only the freelancer/);
    await role('authenticated', f);
    await assert.rejects(reserve('bad\nemail'), /valid client email/);
    await assert.rejects(reserve('client@example.com', 'z'.repeat(64)), /expired or was used/);
    const first = await reserve('Client@Example.com');
    assert.ok(first.lease_token);
    assert.equal(first.cached, false);
    await assert.rejects(reserve(), /wait a minute/);
    await assert.rejects(
      reserve('client@example.com', 'a'.repeat(64), 'c'.repeat(64)),
      /retry changed/,
    );
    await assert.rejects(db.exec('select * from private.invitation_emails'), /permission denied/);
    await assert.rejects(
      db.query('select public.complete_invitation_email($1,$2,$3)', [
        first.id,
        first.lease_token,
        'provider',
      ]),
      /permission denied/,
    );
    await role('service_role');
    await assert.rejects(
      db.query('select public.complete_invitation_email($1,$2,$3)', [
        first.id,
        crypto.randomUUID(),
        'provider',
      ]),
      /confirmation unavailable/,
    );
    await db.query('select public.complete_invitation_email($1,$2,$3)', [
      first.id,
      first.lease_token,
      'provider',
    ]);
    await role('authenticated', f);
    assert.equal((await reserve()).cached, true);
    const uncertain = await reserve('pending@example.com');
    await role('postgres');
    await db.query(
      "update private.invitation_emails set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1",
      [uncertain.id],
    );
    await role('authenticated', f);
    const retry = await reserve('pending@example.com');
    assert.equal(retry.id, uncertain.id);
    assert.notEqual(retry.lease_token, uncertain.lease_token);
    await role('postgres');
    await db.query(
      "update private.invitation_emails set lease_until=null,next_attempt_at=now()-interval '1 second',created_at=now()-interval '24 hours' where id=$1",
      [uncertain.id],
    );
    await role('authenticated', f);
    await assert.rejects(reserve('pending@example.com'), /uncertain/);
    // Separate project budget test, same owner. Past uncertain rows do not count in the hour.
    for (let n = 0; n < 9; n++) await reserve(`client${n}@example.com`);
    await assert.rejects(reserve('over-limit@example.com'), /limit reached/);
    // Rotation revokes old links even when a send record was previously accepted.
    await db.query('select public.create_project_invite($1,$2)', [project, 'd'.repeat(64)]);
    await assert.rejects(reserve(), /expired or was used/);
    await role('authenticated', c);
    await db.query('select public.accept_project_invite($1,$2)', ['d'.repeat(64), 'Client']);
    await assert.rejects(reserve('client@example.com', 'd'.repeat(64)), /Only the freelancer/);
    await role('authenticated', f);
    await assert.rejects(reserve('client@example.com', 'd'.repeat(64)), /expired or was used/);
  } finally {
    await db.close();
  }
});
