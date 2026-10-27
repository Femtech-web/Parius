import 'server-only';
import { withMemory } from '@/features/memory/server/provider';
import { reportMemoryDiagnostic } from '@/features/memory/server/diagnostics';
import { runMemoryTask, type MemoryTask } from '@/features/memory/task';
export type { MemoryTask, MemoryProgress } from '@/features/memory/task';

export function advanceMemory(task: MemoryTask) {
  return runMemoryTask(task, {
    withClient: (work) =>
      withMemory(task.owner_id, task.scope === 'project' ? task.project_id : undefined, work),
    report: reportMemoryDiagnostic,
  });
}
