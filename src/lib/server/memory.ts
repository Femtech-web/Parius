import 'server-only';
import { MemWal, delegateKeyToSuiAddress } from '@mysten-incubation/memwal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { memoryNamespace, filterRecalledLessons, type MemoryReference } from '@/lib/memory';
import { retryMemoryRead } from '@/lib/memory-retry';
let guard: { owner: string; expires: number; accountId: string; delegate: string } | undefined;
export async function withMemory<T>(
  ownerId: string,
  projectId: string | undefined,
  work: (client: MemWal, accountOwner: string) => Promise<T>,
): Promise<T> {
  const key = process.env.MEMWAL_PRIVATE_KEY,
    accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error('Memory is not configured.');
  if (
    process.env.MEMWAL_RELAYER_URL &&
    process.env.MEMWAL_RELAYER_URL !== 'https://relayer.memory.walrus.xyz'
  )
    throw new Error('Mainnet Walrus Memory relayer required.');
  const delegate = await delegateKeyToSuiAddress(key);
  if (
    !guard ||
    guard.expires < Date.now() ||
    guard.accountId !== accountId ||
    guard.delegate !== delegate
  ) {
    const sui = new SuiGrpcClient({
      network: 'mainnet',
      baseUrl: 'https://fullnode.mainnet.sui.io:443',
    });
    const { object } = await retryMemoryRead(async () => {
      const signal = AbortSignal.timeout(10000);
      try {
        return await sui.getObject({ objectId: accountId, include: { json: true }, signal });
      } catch (error) {
        if (signal.aborted)
          throw Object.assign(new Error('Memory account read timed out.'), { status: 504 });
        throw error;
      }
    });
    const json = object.json as Record<string, unknown>;
    const owner = typeof json?.owner === 'string' ? json.owner : null;
    if (!owner || json.active !== true || owner === delegate)
      throw new Error('An active account and delegate key are required.');
    guard = { owner, expires: Date.now() + 300000, accountId, delegate };
  }
  const client = MemWal.create({
    key,
    accountId,
    namespace: memoryNamespace(ownerId, projectId),
    serverUrl: 'https://relayer.memory.walrus.xyz',
    requestTimeoutMs: 12000,
    recallTimeoutMs: 10000,
    preflightTimeoutMs: 5000,
  });
  try {
    return await work(client, guard.owner);
  } finally {
    client.destroy();
  }
}
export async function recallLessons(
  ownerId: string,
  projectId: string,
  query: string,
  references: MemoryReference[],
) {
  const ready = references.filter(
    (r) => r.status === 'ready' && (r.scope === 'personal' || r.project_id === projectId),
  );
  if (!ready.length) return { lessons: [], status: 'no_matches' as const };
  try {
    const groups = await Promise.all(
      (['personal', 'project'] as const).map(async (scope) => {
        const allowed = ready.filter((r) => r.scope === scope);
        if (!allowed.length) return [];
        return withMemory(ownerId, scope === 'project' ? projectId : undefined, async (client) => {
          const recalled = await retryMemoryRead(() =>
            client.recall({ query, limit: 5, maxTokens: 1500 }),
          );
          return filterRecalledLessons(recalled.results, allowed);
        });
      }),
    );
    const lessons = groups.flat().slice(0, 5);
    return { lessons, status: lessons.length ? ('recalled' as const) : ('no_matches' as const) };
  } catch {
    return { lessons: [], status: 'unavailable' as const };
  }
}
