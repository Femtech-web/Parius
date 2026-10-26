// Read-only credential/account check; no raw keys, account IDs or memory content printed.
import { MemWal, delegateKeyToSuiAddress } from '@mysten-incubation/memwal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
process.loadEnvFile('.env.local');
let client: ReturnType<typeof MemWal.create> | undefined;
try {
  const key = process.env.MEMWAL_PRIVATE_KEY!,
    accountId = process.env.MEMWAL_ACCOUNT_ID!;
  client = MemWal.create({
    key,
    accountId,
    serverUrl: 'https://relayer.memory.walrus.xyz',
    namespace: 'parius-connection-check',
    requestTimeoutMs: 10000,
    preflightTimeoutMs: 5000,
  });
  await client.health();
  console.log(JSON.stringify({ check: 'Walrus relayer health', ok: true }));
  const sui = new SuiGrpcClient({
    network: 'mainnet',
    baseUrl: 'https://fullnode.mainnet.sui.io:443',
  });
  const { object } = await sui.getObject({
    objectId: accountId,
    include: { json: true },
    signal: AbortSignal.timeout(15000),
  });
  const json = object.json as Record<string, unknown>;
  const owner = typeof json?.owner === 'string' ? json.owner : null;
  const delegate = await delegateKeyToSuiAddress(key);
  console.log(
    JSON.stringify({
      check: 'Walrus account owner guard',
      ok: Boolean(owner) && owner !== delegate,
      ownerFieldPresent: Boolean(owner),
      keyIsOwner: owner === delegate,
      fields: Object.keys(json || {}),
    }),
  );
} catch (error) {
  const safe = error as { code?: string; name?: string; status?: number };
  console.log(
    JSON.stringify({
      check: 'Walrus setup',
      ok: false,
      code: safe.code || null,
      name: safe.name,
      status: safe.status || null,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
}
