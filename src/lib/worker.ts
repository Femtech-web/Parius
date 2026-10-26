import { timingSafeEqual } from 'node:crypto';
export function workerAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7)),
    expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
export type WorkerDependencies = {
  claimRun: () => Promise<string | null>;
  claimMemory: (token: string) => Promise<unknown | null>;
  claimFile: (token: string) => Promise<unknown | null>;
  memory: (task: unknown) => Promise<boolean>;
  file: (task: unknown) => Promise<boolean>;
  finish: (token: string, memories: number, files: number, errors: number) => Promise<void>;
};
export async function runWorker(deps: WorkerDependencies) {
  const token = await deps.claimRun();
  if (!token) return { outcome: 'busy', memories: 0, files: 0, errors: 0 };
  const claims = await Promise.allSettled([
    deps.claimMemory(token),
    deps.claimMemory(token),
    deps.claimFile(token),
    deps.claimFile(token),
  ]);
  const results = await Promise.allSettled(
    claims.map((claim, index) => {
      if (claim.status === 'rejected') return Promise.reject(new Error('Task claim failed'));
      const task = claim.value;
      return task ? (index < 2 ? deps.memory(task) : deps.file(task)) : Promise.resolve(null);
    }),
  );
  let memories = 0,
    files = 0,
    errors = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected' || result.value === false) errors++;
    else if (result.value === true) {
      if (index < 2) memories++;
      else files++;
    }
  });
  await deps.finish(token, memories, files, errors);
  return { outcome: errors ? 'needs_retry' : 'completed', memories, files, errors };
}
