import 'server-only';
import { withMemory } from './memory';
import { memoryNamespace, memoryPayload } from '@/lib/memory';
export type MemoryTask = {
  id: string;
  owner_id: string;
  project_id: string;
  scope: string;
  lesson: string;
  job_id: string | null;
  lease_token: string;
};
export type MemoryProgress = {
  job: string | null;
  blob: string | null;
  status: 'indexing' | 'ready' | 'failed';
  failed: boolean;
};
export async function advanceMemory(task: MemoryTask): Promise<MemoryProgress> {
  let job = task.job_id;
  try {
    return await withMemory(
      task.owner_id,
      task.scope === 'project' ? task.project_id : undefined,
      async (client, owner) => {
        if (!job) {
          const accepted = await client.remember(memoryPayload(task.id, task.lesson), {
            idempotencyKey: `parius-memory-${task.id}`,
          });
          job = accepted.job_id;
          return { job, blob: null, status: 'indexing', failed: false };
        }
        const state = await client.getRememberStatus(job);
        if (
          (state.owner && state.owner !== owner) ||
          (state.namespace &&
            state.namespace !==
              memoryNamespace(
                task.owner_id,
                task.scope === 'project' ? task.project_id : undefined,
              ))
        )
          throw new Error('Provenance mismatch');
        if (state.status === 'done' && state.blob_id)
          return { job, blob: state.blob_id, status: 'ready', failed: false };
        if (state.status === 'failed' || state.status === 'not_found')
          return { job, blob: null, status: 'failed', failed: true };
        return { job, blob: state.blob_id || null, status: 'indexing', failed: false };
      },
    );
  } catch {
    return { job, blob: null, status: job ? 'indexing' : 'failed', failed: true };
  }
}
