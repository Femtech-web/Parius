/** Bound memory and time while reading untrusted HTTP bodies, even without Content-Length. */
export class RequestBodyError extends Error {
  constructor(
    readonly status: 400 | 408 | 413,
    readonly code: 'invalid_request_body' | 'request_body_timeout' | 'request_too_large',
  ) {
    super(code);
  }
}

export async function readBoundedText(
  request: Request,
  maxBytes: number,
  timeoutMs = 5000,
): Promise<string> {
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new RequestBodyError(400, 'invalid_request_body');
    if (BigInt(length) > BigInt(maxBytes)) throw new RequestBodyError(413, 'request_too_large');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let size = 0;
  let text = '';
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError(408, 'request_body_timeout'));
      // Cancellation can itself stall; the deadline must not await a client-controlled stream.
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new RequestBodyError(413, 'request_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, 'invalid_request_body');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export function requestBodyFailure(error: RequestBodyError, headers: HeadersInit = {}) {
  return Response.json(
    { error: error.code },
    {
      status: error.status,
      headers: { ...Object.fromEntries(new Headers(headers)), 'Cache-Control': 'no-store' },
    },
  );
}
