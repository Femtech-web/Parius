// Read-only verification. --save exports reviewed lesson text and public storage references.
import { writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { MemWal, delegateKeyToSuiAddress } from '@mysten-incubation/memwal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { memoryNamespace } from '../src/lib/memory';

process.loadEnvFile('.env.local');
const project = process.argv[2];
if (!project || !/^[0-9a-f-]{36}$/i.test(project))
  throw new Error('Supply the project UUID, optionally followed by --save.');
const relayer = 'https://relayer.memory.walrus.xyz';
if (process.env.MEMWAL_RELAYER_URL && process.env.MEMWAL_RELAYER_URL !== relayer)
  throw new Error('Mainnet Memory relayer required.');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
try {
  const { data: rows, error } = await db
    .from('memory_references')
    .select('id,owner_id,project_id,scope,lesson,status,job_id,blob_id')
    .eq('project_id', project)
    .eq('status', 'ready')
    .order('created_at');
  if (error || !rows?.length) throw new Error('Ready memory records unavailable.');
  const accountId = process.env.MEMWAL_ACCOUNT_ID!;
  const key = process.env.MEMWAL_PRIVATE_KEY!;
  const sui = new SuiGrpcClient({
    network: 'mainnet',
    baseUrl: 'https://fullnode.mainnet.sui.io:443',
  });
  const { object } = await sui.getObject({
    objectId: accountId,
    include: { json: true },
    signal: AbortSignal.timeout(15000),
  });
  const fields = object.json as Record<string, unknown>;
  const delegate = await delegateKeyToSuiAddress(key);
  if (
    !fields ||
    fields.active !== true ||
    typeof fields.owner !== 'string' ||
    fields.owner === delegate
  )
    throw new Error('Mainnet account/delegate check failed.');
  const evidence = [];
  for (let offset = 0; offset < rows.length; offset += 2) {
    const batch = await Promise.all(
      rows.slice(offset, offset + 2).map(async (row) => {
        const namespace = memoryNamespace(
          row.owner_id,
          row.scope === 'project' ? row.project_id : undefined,
        );
        const client = MemWal.create({
          key,
          accountId,
          namespace,
          serverUrl: relayer,
          requestTimeoutMs: 15000,
        });
        try {
          const remote = await client.getRememberStatus(row.job_id);
          const matches =
            remote.status === 'done' &&
            Boolean(remote.blob_id) &&
            remote.blob_id === row.blob_id &&
            (!remote.owner || remote.owner === fields.owner) &&
            (!remote.namespace || remote.namespace === namespace);
          return {
            lesson: row.lesson,
            scope: row.scope,
            jobId: row.job_id,
            blobId: row.blob_id,
            remoteStatus: remote.status,
            blobMatches: remote.blob_id === row.blob_id,
            provenanceFieldsPresent: Boolean(remote.owner && remote.namespace),
            verified: matches,
          };
        } finally {
          client.destroy();
        }
      }),
    );
    evidence.push(...batch);
    console.log(
      JSON.stringify({
        checked: evidence.length,
        verified: evidence.filter((r) => r.verified).length,
      }),
    );
  }
  const verified = evidence.filter((row) => row.verified);
  const distinct = new Set(verified.map((row) => row.blobId)).size;
  const report = {
    checkedAt: new Date().toISOString(),
    network: 'mainnet',
    relayer,
    method:
      'Read-only Mainnet account check and getRememberStatus for each saved job; no new writes.',
    accountActive: true,
    delegateIsNotOwner: true,
    readyRecords: rows.length,
    verifiedDistinctBlobs: distinct,
    tenStoredMemoriesVerified: distinct >= 10,
    memories: evidence,
  };
  if (process.argv.includes('--save')) {
    await mkdir('docs/evidence/memory', { recursive: true });
    await writeFile(
      'docs/evidence/memory/mainnet-storage.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  }
  console.log(
    JSON.stringify({
      readyRecords: rows.length,
      verifiedDistinctBlobs: distinct,
      tenStoredMemoriesVerified: report.tenStoredMemoriesVerified,
    }),
  );
  if (verified.length !== rows.length || distinct < 10) process.exitCode = 1;
} catch {
  console.error(
    'Memory verification did not complete. No credentials or raw provider errors printed.',
  );
  process.exitCode = 1;
}
