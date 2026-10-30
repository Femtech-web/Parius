import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedText, RequestBodyError, requestBodyFailure } from '../src/lib/request-body';

function streaming(chunks: Uint8Array[], headers?: HeadersInit) {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request('https://parius.example/api/mcp', {
      method: 'POST',
      body: stream,
      headers,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelled: () => cancelled,
  };
}

test('HTTP bodies enforce actual byte limits with absent, false or excessive Content-Length', async () => {
  const encoder = new TextEncoder();
  for (const headers of [undefined, { 'Content-Length': '1' }]) {
    const { request } = streaming([encoder.encode('123'), encoder.encode('456')], headers);
    await assert.rejects(
      readBoundedText(request, 5),
      (error: unknown) => error instanceof RequestBodyError && error.status === 413,
    );
  }
  const enormous = streaming([], { 'Content-Length': '999999999999999999999999999' });
  await assert.rejects(readBoundedText(enormous.request, 5), { status: 413 });
  const malformed = streaming([], { 'Content-Length': '-1' });
  await assert.rejects(readBoundedText(malformed.request, 5), { status: 400 });
  const exact = streaming([encoder.encode('12345')]);
  assert.equal(await readBoundedText(exact.request, 5), '12345');
});

test('HTTP body limits count UTF-8 bytes and preserve characters split across chunks', async () => {
  const bytes = new TextEncoder().encode('€');
  const valid = streaming([bytes.slice(0, 1), bytes.slice(1)]);
  assert.equal(await readBoundedText(valid.request, 3), '€');
  await assert.rejects(readBoundedText(streaming([bytes]).request, 2), { status: 413 });
  await assert.rejects(readBoundedText(streaming([bytes.slice(0, 1)]).request, 3), { status: 400 });
});

test('HTTP body deadline rejects stalled input even when stream cancellation never resolves', async () => {
  let cancelled = false;
  const request = new Request('https://parius.example/oauth/register', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  await assert.rejects(readBoundedText(request, 8192, 20), { status: 408 });
  assert.equal(cancelled, true);
});

test('HTTP body failures disclose only stable codes and prohibit caching', async () => {
  const response = requestBodyFailure(new RequestBodyError(413, 'request_too_large'), {
    'Access-Control-Allow-Origin': '*',
  });
  assert.equal(response.status, 413);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { error: 'request_too_large' });
});
