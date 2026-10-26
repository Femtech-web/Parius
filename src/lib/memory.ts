import { z } from 'zod';
export type MemorySuggestion = {
  id: string;
  project_id: string;
  assessment_id: string | null;
  kind: 'possible_change' | 'needs_clarification';
  lesson: string;
  created_at: string;
};
export const memoryInput = z
  .string()
  .trim()
  .min(10)
  .max(600)
  .refine(
    (text) => !/(suiprivkey1|\b(?:sk|gsk)_[a-z0-9]{16,}|-----BEGIN .*PRIVATE KEY)/i.test(text),
    'Keep keys and credentials out of memory.',
  );
export type MemoryReference = {
  id: string;
  owner_id: string;
  project_id: string;
  scope: 'personal' | 'project';
  lesson: string;
  status: 'pending' | 'indexing' | 'ready' | 'failed' | 'suppressed';
  job_id: string | null;
  blob_id: string | null;
  created_at: string;
  replaces_id: string | null;
  deletion_requested_at?: string | null;
};
export type RecalledLesson = { id: string; blob_id: string; lesson: string };
export function memoryNamespace(ownerId: string, projectId?: string) {
  const uuid = /^[a-f0-9-]{36}$/i;
  if (!uuid.test(ownerId) || (projectId && !uuid.test(projectId)))
    throw new Error('Invalid memory identity.');
  return projectId
    ? `parius-user-${ownerId.toLowerCase()}-project-${projectId.toLowerCase()}`
    : `parius-user-${ownerId.toLowerCase()}-personal`;
}
export function memoryPayload(id: string, lesson: string) {
  return JSON.stringify({ parius_memory_id: id, lesson });
}
export function filterRecalledLessons(
  hits: { blob_id: string; text: string }[],
  allowed: MemoryReference[],
): RecalledLesson[] {
  return hits
    .flatMap((hit) => {
      const ref = allowed.find((r) => r.status === 'ready' && r.blob_id === hit.blob_id);
      if (!ref) return [];
      try {
        const payload = JSON.parse(hit.text);
        return payload.parius_memory_id === ref.id && payload.lesson === ref.lesson
          ? [{ id: ref.id, blob_id: hit.blob_id, lesson: payload.lesson }]
          : [];
      } catch {
        return [];
      }
    })
    .filter((hit, index, all) => all.findIndex((other) => other.id === hit.id) === index)
    .slice(0, 5);
}
