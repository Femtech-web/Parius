import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMemoryTask,
  type MemoryTask,
  type MemoryTaskDependencies,
} from '../src/features/memory/task';
import { memoryNamespace } from '../src/features/memory/domain';
import {
  memoryFailureCode,
  MemoryOperationError,
  safeMemoryDiagnostic,
  type MemoryDiagnostic,
} from '../src/features/memory/diagnostics';

const task: MemoryTask = {
  id: '00000000-0000-4000-8000-000000000001',
  owner_id: '00000000-0000-4000-8000-000000000002',
  project_id: '00000000-0000-4000-8000-000000000003',
  scope: 'project',
  lesson: 'Private fixture lesson, never write it to diagnostic logs.',
  job_id: null,
  lease_token: 'private-lease',
};
const job = '00000000-0000-4000-8000-000000000004';
const owner = 'account-owner';
const namespace = memoryNamespace(task.owner_id, task.project_id);

test('memory task submits once with a stable idempotency key, then checks its saved job', async () => {
  let writes = 0;
  const diagnostics: MemoryDiagnostic[] = [];
  const deps: MemoryTaskDependencies = {
    report: (event) => diagnostics.push(event),
    withClient: (work) =>
      work(
        {
          remember: async (payload, options) => {
            writes++;
            assert.deepEqual(JSON.parse(payload), {
              parius_memory_id: task.id,
              lesson: task.lesson,
            });
            assert.equal(options.idempotencyKey, `parius-memory-${task.id}`);
            return { job_id: job };
          },
          getRememberStatus: async (id) => {
            assert.equal(id, job);
            return { status: 'done', owner, namespace, blob_id: 'verified-blob' };
          },
        },
        owner,
      ),
  };
  const submitted = await runMemoryTask(task, deps);
  assert.deepEqual(submitted, { job, blob: null, status: 'indexing', failed: false });
  assert.deepEqual(await runMemoryTask({ ...task, job_id: job }, deps), {
    job,
    blob: 'verified-blob',
    status: 'ready',
    failed: false,
  });
  assert.equal(writes, 1);
  assert.deepEqual(diagnostics, []);
});

test('memory task diagnostics distinguish timeout and provenance mismatch without accepting a blob', async () => {
  for (const kind of ['timeout', 'owner', 'namespace'] as const) {
    const events: MemoryDiagnostic[] = [];
    let writes = 0;
    const progress = await runMemoryTask(
      { ...task, job_id: job },
      {
        report: (event) => events.push(event),
        withClient: (work) =>
          work(
            {
              remember: async () => {
                writes++;
                return { job_id: job };
              },
              getRememberStatus: async () => {
                if (kind === 'timeout')
                  throw Object.assign(new Error('SECRET upstream content'), { status: 504 });
                return {
                  status: 'done',
                  blob_id: 'untrusted-blob',
                  owner: kind === 'owner' ? 'other' : owner,
                  namespace: kind === 'namespace' ? 'other' : namespace,
                };
              },
            },
            owner,
          ),
      },
    );
    assert.deepEqual(progress, { job, blob: null, status: 'indexing', failed: true });
    assert.equal(writes, 0);
    assert.equal(events[0].code, kind === 'timeout' ? 'timeout' : 'provenance_mismatch');
    assert.equal(events[0].stage, 'status');
    assert.equal(events[0].jobId, job);
    assert(!JSON.stringify(events).includes('SECRET'));
    assert(!JSON.stringify(events).includes(task.lesson));
    assert(!JSON.stringify(events).includes(task.lease_token));
  }
});

test('memory task preserves failure and indexing states while reporting provider/configuration causes', async () => {
  for (const status of ['failed', 'not_found', 'pending', 'done']) {
    const events: MemoryDiagnostic[] = [];
    const progress = await runMemoryTask(
      { ...task, job_id: job },
      {
        report: (event) => events.push(event),
        withClient: (work) =>
          work(
            {
              remember: async () => {
                throw Error('No new write');
              },
              getRememberStatus: async () => ({ status, owner, namespace }),
            },
            owner,
          ),
      },
    );
    const failed = status === 'failed' || status === 'not_found';
    assert.equal(progress.status, failed ? 'failed' : 'indexing');
    assert.equal(progress.failed, failed);
    assert.equal(events.length, failed ? 1 : 0);
    if (failed) assert.equal(events[0].code, status === 'failed' ? 'job_failed' : 'job_not_found');
  }
  const events: MemoryDiagnostic[] = [];
  const progress = await runMemoryTask(task, {
    withClient: async () => {
      throw new MemoryOperationError('configuration_missing');
    },
    report: (event) => events.push(event),
  });
  assert.equal(progress.status, 'failed');
  assert.equal(events[0].stage, 'account');
  assert.equal(events[0].code, 'configuration_missing');
});

test('diagnostic classification and projection never retain messages, payloads or arbitrary identifiers', () => {
  for (const [error, code] of [
    [{ status: 403 }, 'authorization_failed'],
    [{ status: 429 }, 'rate_limited'],
    [{ code: 14 }, 'provider_unavailable'],
    [{ code: 4 }, 'timeout'],
    [{ name: 'MemWalRequestTimeout' }, 'timeout'],
    [{ cause: { code: 'ECONNRESET' } }, 'provider_unavailable'],
    [new MemoryOperationError('account_invalid'), 'account_invalid'],
    [new Error('SENSITIVE'), 'unexpected'],
  ] as const)
    assert.equal(memoryFailureCode(error), code);
  const input = {
    operation: 'recall' as const,
    stage: 'recall' as const,
    code: 'unexpected' as const,
    memoryId: 'SENSITIVE',
    jobId: job,
    lesson: 'SENSITIVE',
    authorization: 'SENSITIVE',
  };
  assert.deepEqual(safeMemoryDiagnostic(input), {
    operation: 'recall',
    stage: 'recall',
    code: 'unexpected',
    jobId: job,
  });
});
