// Read-only setup check. Never prints credentials, endpoints or database rows.
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
try {
  const schemaClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await schemaClient
    .from('agreement_resolutions')
    .select('agreement_id', { head: true })
    .limit(0);
  console.log(
    JSON.stringify({ check: 'Supabase agreement schema', ok: !error, code: error?.code || null }),
  );
  const { error: scopeError } = await schemaClient
    .from('scope_assessments')
    .select('id,status,result', { head: true })
    .limit(0);
  console.log(
    JSON.stringify({
      check: 'Private scope schema',
      ok: !scopeError,
      code: scopeError?.code || null,
    }),
  );
  const { error: reserveError } = await client.rpc('reserve_scope_review', {
    p_project: '00000000-0000-4000-8000-000000000000',
    p_message: '00000000-0000-4000-8000-000000000000',
    p_agreement: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous analysis reservation denied',
      ok: reserveError?.code === '42501',
      code: reserveError?.code || null,
    }),
  );
  const { error: rpcError } = await client.rpc('read_project_activity', {
    p_project: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous history access denied',
      ok: rpcError?.code === '42501',
      code: rpcError?.code || null,
    }),
  );
  let newSchemaFailed = false;
  const { error: suggestedLessonsError } = await schemaClient
    .from('memory_suggestions')
    .select('id,status,assessment_id,memory_id', { head: true })
    .limit(0);
  console.log(
    JSON.stringify({
      check: 'Private suggested lessons schema',
      ok: !suggestedLessonsError,
      code: suggestedLessonsError?.code || null,
    }),
  );
  const { error: suggestedLessonsAnon } = await client.rpc('resolve_memory_suggestion', {
    p_id: '00000000-0000-4000-8000-000000000000',
    p_action: 'dismiss',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous suggestion resolution denied',
      ok: suggestedLessonsAnon?.code === '42501',
      code: suggestedLessonsAnon?.code || null,
    }),
  );
  if (suggestedLessonsError || suggestedLessonsAnon?.code !== '42501') newSchemaFailed = true;
  // Public Auth settings are separate from database schema and Enoki readiness.
  const authSettings = await fetch(
    new URL('/auth/v1/settings', process.env.NEXT_PUBLIC_SUPABASE_URL),
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10000),
    },
  );
  const auth = authSettings.ok ? await authSettings.json() : null;
  const signupsEnabled = auth?.disable_signup === false;
  console.log(
    JSON.stringify({ check: 'First-time account registration enabled', ok: signupsEnabled }),
  );
  if (!signupsEnabled) newSchemaFailed = true;
  for (const provider of ['google', 'email']) {
    const enabled = auth?.external?.[provider] === true;
    console.log(JSON.stringify({ check: `Supabase ${provider} sign-in enabled`, ok: enabled }));
    if (!enabled) newSchemaFailed = true;
  }

  for (const table of [
    'memory_state',
    'memory_references',
    'invoices',
    'payment_records',
    'payment_requests',
    'payment_claims',
    'invoice_balances',
    'wallet_bindings',
    'payment_checkouts',
    'scope_comparisons',
    'memory_deletion_requests',
    'project_files',
    'payment_promises',
  ]) {
    const { error: tableError } = await schemaClient
      .from(table)
      .select('*', { head: true })
      .limit(0);
    console.log(
      JSON.stringify({ check: `${table} schema`, ok: !tableError, code: tableError?.code || null }),
    );
    if (tableError) newSchemaFailed = true;
  }
  const { error: memoryAnon } = await client.rpc('claim_memory_job', {
    p_id: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous memory processing denied',
      ok: memoryAnon?.code === '42501',
      code: memoryAnon?.code || null,
    }),
  );
  if (memoryAnon?.code !== '42501') newSchemaFailed = true;
  const { error: walletAnon } = await client.rpc('begin_wallet_challenge', {
    p_owner: '00000000-0000-4000-8000-000000000000',
    p_address: '0x' + '0'.repeat(64),
    p_network: 'testnet',
    p_origin: 'http://localhost:3000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous wallet challenge denied',
      ok: walletAnon?.code === '42501',
      code: walletAnon?.code || null,
    }),
  );
  if (walletAnon?.code !== '42501') newSchemaFailed = true;
  const { error: checkoutAnon } = await client.rpc('reserve_payment_checkout', {
    p_request: '00000000-0000-4000-8000-000000000000',
    p_mode: 'wallet',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous checkout reservation denied',
      ok: checkoutAnon?.code === '42501',
      code: checkoutAnon?.code || null,
    }),
  );
  if (checkoutAnon?.code !== '42501') newSchemaFailed = true;
  const { error: comparisonAnon } = await client.rpc('reserve_scope_comparison', {
    p_assessment: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous memory comparison denied',
      ok: comparisonAnon?.code === '42501',
      code: comparisonAnon?.code || null,
    }),
  );
  if (comparisonAnon?.code !== '42501') newSchemaFailed = true;
  const { data: bucket, error: bucketError } =
    await schemaClient.storage.getBucket('parius-project-files');
  const bucketOk =
    !bucketError && bucket?.public === false && Number(bucket?.file_size_limit) === 10485760;
  console.log(JSON.stringify({ check: 'Private file bucket configuration', ok: bucketOk }));
  if (!bucketOk) newSchemaFailed = true;
  const { error: fileAnon } = await client.rpc('authorize_file_download', {
    p_id: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous file download denied',
      ok: fileAnon?.code === '42501',
      code: fileAnon?.code || null,
    }),
  );
  if (fileAnon?.code !== '42501') newSchemaFailed = true;
  for (const [table, column] of [
    ['messages', 'project_id'],
    ['invoices', 'project_id'],
    ['payment_records', 'invoice_id'],
    ['payment_requests', 'invoice_id'],
    ['payment_claims', 'request_id'],
  ]) {
    const zero = '00000000-0000-4000-8000-000000000000';
    const { error: cursorError } = await schemaClient
      .from(table)
      .select('id', { head: true })
      .eq(column, zero)
      .or(
        `created_at.lt.2026-10-24T00:00:00.123456Z,and(created_at.eq.2026-10-24T00:00:00.123456Z,id.lt.${zero})`,
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    console.log(
      JSON.stringify({
        check: `${table} cursor query`,
        ok: !cursorError,
        code: cursorError?.code || null,
      }),
    );
    if (cursorError) newSchemaFailed = true;
  }
  const { error: followupSchema } = await schemaClient
    .from('payment_followups')
    .select('id,status,revision', { head: true })
    .limit(0);
  console.log(
    JSON.stringify({
      check: 'Private follow-up schema',
      ok: !followupSchema,
      code: followupSchema?.code || null,
    }),
  );
  if (followupSchema) newSchemaFailed = true;
  const { error: followupAnon } = await client.rpc('reserve_payment_followup', {
    p_invoice: '00000000-0000-4000-8000-000000000000',
  });
  console.log(
    JSON.stringify({
      check: 'Anonymous follow-up reservation denied',
      ok: followupAnon?.code === '42501',
      code: followupAnon?.code || null,
    }),
  );
  if (followupAnon?.code !== '42501') newSchemaFailed = true;
  const { error: workerSchema } = await schemaClient.rpc('background_status');
  console.log(
    JSON.stringify({
      check: 'Background worker schema',
      ok: !workerSchema,
      code: workerSchema?.code || null,
    }),
  );
  if (workerSchema) newSchemaFailed = true;
  for (const roleClient of [client]) {
    const { error: denied } = await roleClient.rpc('claim_background_run');
    console.log(
      JSON.stringify({
        check: 'Anonymous worker claim denied',
        ok: denied?.code === '42501',
        code: denied?.code || null,
      }),
    );
    if (denied?.code !== '42501') newSchemaFailed = true;
  }
  for (const [name, args] of [
    [
      'reserve_invitation_email',
      {
        p_project: '00000000-0000-4000-8000-000000000000',
        p_token_hash: '0'.repeat(64),
        p_email: 'probe@example.com',
        p_payload_hash: '0'.repeat(64),
      },
    ],
    [
      'complete_invitation_email',
      {
        p_id: '00000000-0000-4000-8000-000000000000',
        p_lease: '00000000-0000-4000-8000-000000000000',
        p_provider: 'probe',
      },
    ],
  ]) {
    const { error: denied } = await client.rpc(name, args);
    console.log(
      JSON.stringify({
        check: `Anonymous ${name} denied`,
        ok: denied?.code === '42501',
        code: denied?.code || null,
      }),
    );
    if (denied?.code !== '42501') newSchemaFailed = true;
  }
  if (
    newSchemaFailed ||
    error ||
    scopeError ||
    reserveError?.code !== '42501' ||
    rpcError?.code !== '42501'
  )
    process.exitCode = 1;
} catch {
  console.log(
    JSON.stringify({ check: 'Supabase connectivity', ok: false, reason: 'Network request failed' }),
  );
  process.exitCode = 1;
}
