import 'server-only';
import { randomUUID } from 'node:crypto';
import { safeMemoryDiagnostic, type MemoryDiagnostic } from '@/features/memory/diagnostics';

export function reportMemoryDiagnostic(diagnostic: MemoryDiagnostic) {
  console.warn(
    '[parius.memory]',
    JSON.stringify({
      correlationId: randomUUID(),
      ...safeMemoryDiagnostic(diagnostic),
    }),
  );
}
