/** Read-only provider recovery. Never apply this to writes or authorization failures. */
export function transientMemoryRead(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; code?: string; name?: string; cause?: { code?: string } };
  if (e.status && e.status >= 400 && e.status < 500 && e.status !== 408) return false;
  return (
    e.status === 408 ||
    e.status === 502 ||
    e.status === 503 ||
    e.status === 504 ||
    e.name === 'TimeoutError' ||
    e.name === 'MemWalRequestTimeout' ||
    ['UNAVAILABLE', 'DEADLINE_EXCEEDED'].includes(e.code || '') ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(
      e.cause?.code || '',
    )
  );
}
export async function retryMemoryRead<T>(
  read: () => Promise<T>,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 300)),
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!transientMemoryRead(error)) throw error;
    await pause();
    return read();
  }
}
