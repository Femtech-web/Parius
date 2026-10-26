import { privilegedClient } from '@/lib/server/privileged';
import { advanceMemory, type MemoryTask } from '@/lib/server/memory-task';
import { workerAuthorized, runWorker } from '@/lib/worker';
import { FILE_BUCKET } from '@/lib/files';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
function authorized(request: Request) {
  return workerAuthorized(
    request.headers.get('authorization'),
    process.env.BACKGROUND_WORKER_SECRET,
  );
}
export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const { data, error } = await privilegedClient().rpc('background_status');
    if (error) throw error;
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: 'Worker status unavailable' }, { status: 503, headers });
  }
}
export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const db = privilegedClient(10000);
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      const { data, error } = await db.rpc(name, args);
      if (error) throw new Error('Worker database operation failed');
      return data;
    };
    const result = await runWorker({
      claimRun: () => rpc('claim_background_run'),
      claimMemory: (token) =>
        process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID
          ? rpc('claim_background_memory', { p_token: token })
          : Promise.resolve(null),
      claimFile: (token) => rpc('claim_file_cleanup', { p_token: token }),
      memory: async (raw) => {
        const task = raw as MemoryTask;
        const progress = await advanceMemory(task);
        await rpc('complete_memory_task', {
          p_id: task.id,
          p_token: task.lease_token,
          p_job: progress.job,
          p_blob: progress.blob,
          p_status: progress.status,
          p_failed: progress.failed,
        });
        return !progress.failed;
      },
      file: async (raw) => {
        const task = raw as { id: string; path: string; token: string };
        const { error } = await db.storage.from(FILE_BUCKET).remove([task.path]);
        await rpc('complete_file_cleanup', {
          p_id: task.id,
          p_token: task.token,
          p_success: !error,
        });
        return !error;
      },
      finish: (token, memories, files, errors) =>
        rpc('finish_background_run', {
          p_token: token,
          p_memories: memories,
          p_files: files,
          p_errors: errors,
        }).then(() => {}),
    });
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: 'Worker run could not finish; leases will recover.' },
      { status: 503, headers },
    );
  }
}
