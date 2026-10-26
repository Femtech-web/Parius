import test from 'node:test';
import assert from 'node:assert/strict';
import { retryMemoryRead, transientMemoryRead } from '../src/lib/memory-retry';

test('transient account/recall reads retry once and return only the successful remote result', async () => {
  let calls = 0,
    pauses = 0;
  const remote = { results: [{ blob_id: 'real-response-fixture', text: 'A returned lesson' }] };
  const recovered = await retryMemoryRead(
    async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('Read timed out'), { status: 504 });
      return remote;
    },
    async () => {
      pauses++;
    },
  );
  assert.equal(recovered, remote);
  assert.equal(calls, 2);
  assert.equal(pauses, 1);
  calls = 0;
  await assert.rejects(
    retryMemoryRead(
      async () => {
        calls++;
        throw Object.assign(new Error('Still unavailable'), { code: 'UNAVAILABLE' });
      },
      async () => {},
    ),
    /Still unavailable/,
  );
  assert.equal(calls, 2);
});
test('authorization, inactive account, bad input and throttling are never hidden or blindly retried', async () => {
  for (const error of [
    Object.assign(new Error('Not authorized'), { status: 401 }),
    Object.assign(new Error('Not delegated'), { status: 403 }),
    Object.assign(new Error('Throttled'), { status: 429 }),
    new Error('An active account and delegate key are required.'),
    new TypeError('Invalid query'),
  ]) {
    let calls = 0;
    assert.equal(transientMemoryRead(error), false);
    await assert.rejects(
      retryMemoryRead(
        async () => {
          calls++;
          throw error;
        },
        async () => {},
      ),
      error,
    );
    assert.equal(calls, 1);
  }
  assert.equal(transientMemoryRead({ cause: { code: 'ECONNRESET' } }), true);
  assert.equal(transientMemoryRead({ name: 'MemWalRequestTimeout' }), true);
});
