export type MemoryFailureCode =
  | 'configuration_missing'
  | 'account_invalid'
  | 'authorization_failed'
  | 'rate_limited'
  | 'timeout'
  | 'provider_unavailable'
  | 'provenance_mismatch'
  | 'job_failed'
  | 'job_not_found'
  | 'unexpected';

export class MemoryOperationError extends Error {
  constructor(readonly failureCode: MemoryFailureCode) {
    super('Memory operation could not complete.');
    this.name = 'MemoryOperationError';
  }
}

/** Classify structural provider fields without copying upstream messages into logs. */
export function memoryFailureCode(error: unknown): MemoryFailureCode {
  if (error instanceof MemoryOperationError) return error.failureCode;
  if (!error || typeof error !== 'object') return 'unexpected';
  const value = error as {
    status?: number;
    code?: string | number;
    name?: string;
    cause?: { code?: string };
  };
  if (value.status === 401 || value.status === 403) return 'authorization_failed';
  if (value.status === 429) return 'rate_limited';
  const code = value.code ?? value.cause?.code;
  if (
    value.status === 408 ||
    value.status === 504 ||
    code === 4 ||
    ['DEADLINE_EXCEEDED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(String(code)) ||
    ['TimeoutError', 'AbortError', 'MemWalRequestTimeout'].includes(value.name || '')
  )
    return 'timeout';
  if (
    (value.status && value.status >= 500 && value.status <= 599) ||
    code === 14 ||
    ['UNAVAILABLE', 'ECONNRESET', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(String(code))
  )
    return 'provider_unavailable';
  return 'unexpected';
}

export type MemoryDiagnostic = {
  operation: 'storage' | 'recall';
  stage: 'account' | 'remember' | 'status' | 'recall';
  code: MemoryFailureCode;
  memoryId?: string;
  jobId?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeMemoryDiagnostic(input: MemoryDiagnostic): MemoryDiagnostic {
  return {
    operation: input.operation,
    stage: input.stage,
    code: input.code,
    ...(input.memoryId && uuid.test(input.memoryId) ? { memoryId: input.memoryId } : {}),
    ...(input.jobId && uuid.test(input.jobId) ? { jobId: input.jobId } : {}),
  };
}
