import { memoryNamespace, memoryPayload } from '@/features/memory/domain';
import {
  memoryFailureCode,
  MemoryOperationError,
  safeMemoryDiagnostic,
  type MemoryDiagnostic,
} from '@/features/memory/diagnostics';

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
type MemoryTaskClient = {
  remember: (payload: string, options: { idempotencyKey: string }) => Promise<{ job_id: string }>;
  getRememberStatus: (
    job: string,
  ) => Promise<{ status: string; owner?: string; namespace?: string; blob_id?: string }>;
};
export type MemoryTaskDependencies = {
  withClient: (
    work: (client: MemoryTaskClient, owner: string) => Promise<MemoryProgress>,
  ) => Promise<MemoryProgress>;
  report: (diagnostic: MemoryDiagnostic) => void;
};

/** Progress and retries retain the worker's existing contract; providers are injected for tests. */
export async function runMemoryTask(
  task: MemoryTask,
  deps: MemoryTaskDependencies,
): Promise<MemoryProgress> {
  let job = task.job_id;
  let stage: MemoryDiagnostic['stage'] = 'account';
  const report = (code: MemoryDiagnostic['code']) =>
    deps.report(
      safeMemoryDiagnostic({
        operation: 'storage',
        stage,
        code,
        memoryId: task.id,
        jobId: job || undefined,
      }),
    );
  try {
    return await deps.withClient(async (client, owner) => {
      if (!job) {
        stage = 'remember';
        const accepted = await client.remember(memoryPayload(task.id, task.lesson), {
          idempotencyKey: `parius-memory-${task.id}`,
        });
        job = accepted.job_id;
        return { job, blob: null, status: 'indexing', failed: false };
      }
      stage = 'status';
      const state = await client.getRememberStatus(job);
      if (
        (state.owner && state.owner !== owner) ||
        (state.namespace &&
          state.namespace !==
            memoryNamespace(task.owner_id, task.scope === 'project' ? task.project_id : undefined))
      )
        throw new MemoryOperationError('provenance_mismatch');
      if (state.status === 'done' && state.blob_id)
        return { job, blob: state.blob_id, status: 'ready', failed: false };
      if (state.status === 'failed' || state.status === 'not_found') {
        report(state.status === 'failed' ? 'job_failed' : 'job_not_found');
        return { job, blob: null, status: 'failed', failed: true };
      }
      return { job, blob: state.blob_id || null, status: 'indexing', failed: false };
    });
  } catch (error) {
    report(memoryFailureCode(error));
    return { job, blob: null, status: job ? 'indexing' : 'failed', failed: true };
  }
}
