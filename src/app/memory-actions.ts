'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { advanceMemory } from '@/lib/server/memory-task';
import { memoryInput, type MemoryReference } from '@/lib/memory';
import type { ActionResult } from './actions';
export async function resolveSuggestedLesson(
  projectId: string,
  id: string,
  action: 'confirm' | 'dismiss',
  lesson?: string,
  scope: 'personal' | 'project' = 'project',
): Promise<ActionResult & { id?: string }> {
  const input = z
    .object({
      projectId: z.uuid(),
      id: z.uuid(),
      action: z.enum(['confirm', 'dismiss']),
      lesson: memoryInput.optional(),
      scope: z.enum(['personal', 'project']),
    })
    .safeParse({ projectId, id, action, lesson, scope });
  if (!input.success || (action === 'confirm' && !lesson))
    return { error: 'Check the suggested lesson before confirming.' };
  const { supabase } = await requireSession();
  const { data: suggestion, error: readError } = await supabase
    .from('memory_suggestions')
    .select('id')
    .eq('id', id)
    .eq('project_id', projectId)
    .maybeSingle();
  if (readError || !suggestion)
    return { error: 'This suggestion is unavailable. Refresh and try again.' };
  const { data, error } = await supabase.rpc('resolve_memory_suggestion', {
    p_id: id,
    p_action: action,
    p_lesson: input.data.lesson || null,
    p_scope: scope,
  });
  if (error)
    return {
      error: error.code === 'P0001' ? error.message : 'The suggestion could not be updated.',
    };
  revalidatePath(`/projects/${projectId}`);
  return action === 'dismiss'
    ? { success: 'Suggestion dismissed.' }
    : { id: data, success: 'Lesson confirmed. Walrus storage is pending.' };
}
export async function confirmLesson(
  projectId: string,
  lesson: string,
  scope: 'personal' | 'project',
  key: string,
  replaces: string | null,
): Promise<ActionResult & { id?: string }> {
  const input = z
    .object({
      projectId: z.uuid(),
      lesson: memoryInput,
      scope: z.enum(['personal', 'project']),
      key: z.uuid(),
      replaces: z.uuid().nullable(),
    })
    .safeParse({ projectId, lesson, scope, key, replaces });
  if (!input.success) return { error: input.error.issues[0].message };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc('confirm_memory', {
    p_project: projectId,
    p_lesson: input.data.lesson,
    p_scope: scope,
    p_key: key,
    p_replaces: replaces,
  });
  if (error)
    return { error: error.code === 'P0001' ? error.message : 'The lesson could not be confirmed.' };
  revalidatePath(`/projects/${projectId}`);
  return { id: data, success: 'Lesson confirmed. Walrus storage is pending.' };
}
export async function suppressLesson(projectId: string, id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(id).success)
    return { error: 'Invalid lesson.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('suppress_memory', { p_id: id });
  if (error) return { error: 'The lesson could not be removed from future suggestions.' };
  revalidatePath(`/projects/${projectId}`);
  return {
    success:
      'Lesson excluded from future suggestions. This does not promise erasure of existing Walrus blobs.',
  };
}
export async function requestLessonDeletion(projectId: string, id: string): Promise<ActionResult> {
  if (![projectId, id].every((value) => z.uuid().safeParse(value).success))
    return { error: 'Invalid lesson.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('request_memory_deletion', { p_id: id });
  if (error) return { error: 'The deletion request could not be saved. Please retry.' };
  revalidatePath(`/projects/${projectId}`);
  return {
    success:
      'Deletion requested. The lesson is excluded and its text and linked private reviews have been removed from Parius. Permanent Walrus deletion remains pending account-owner review.',
  };
}
export async function readMemoryPage(
  projectId: string,
  cursor?: { created_at: string; id: string },
): Promise<{ memories?: MemoryReference[]; hasMore?: boolean; error?: string }> {
  if (
    !z.uuid().safeParse(projectId).success ||
    (cursor &&
      (!z.uuid().safeParse(cursor.id).success ||
        !z.iso.datetime({ offset: true }).safeParse(cursor.created_at).success))
  )
    return { error: 'Invalid memory page.' };
  const { supabase, user } = await requireSession();
  const { data: member } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single();
  if (member?.role !== 'freelancer') return { error: 'Private memory access required.' };
  const filter = cursor
    ? `and(or(scope.eq.personal,project_id.eq.${projectId}),or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})))`
    : `scope.eq.personal,project_id.eq.${projectId}`;
  const { data, error } = await supabase
    .from('memory_references')
    .select(
      'id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at,deletion_requested_at',
    )
    .eq('owner_id', user.id)
    .or(filter)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(101);
  return error
    ? { error: 'Older lessons could not be loaded.' }
    : {
        memories: (data || []).slice(0, 100) as MemoryReference[],
        hasMore: (data || []).length > 100,
      };
}
export async function processMemory(
  projectId: string,
  id: string,
): Promise<ActionResult & { memory?: MemoryReference }> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(id).success)
    return { error: 'Invalid lesson.' };
  const { supabase } = await requireSession();
  const { data: claim, error } = await supabase.rpc('claim_memory_job', { p_id: id });
  if (error || !claim) return { error: 'The memory job is unavailable or already being checked.' };
  try {
    const progress = await advanceMemory(claim);
    const { error: saveError } = await privilegedClient().rpc('complete_memory_task', {
      p_id: id,
      p_token: claim.lease_token,
      p_job: progress.job,
      p_blob: progress.blob,
      p_status: progress.status,
      p_failed: progress.failed,
    });
    if (saveError) throw new Error('Storage progress unavailable.');
    const { data: updated } = await supabase
      .from('memory_references')
      .select(
        'id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at,deletion_requested_at',
      )
      .eq('id', id)
      .single();
    revalidatePath(`/projects/${projectId}`);
    return progress.failed || progress.status === 'failed'
      ? { error: 'Walrus could not complete this memory. You can retry the saved job.' }
      : {
          memory: (updated as MemoryReference) || undefined,
          success:
            progress.status === 'ready'
              ? 'Stored and indexed on Walrus.'
              : 'Walrus is storing and indexing this confirmed lesson.',
        };
  } catch {
    revalidatePath(`/projects/${projectId}`);
    return {
      error:
        'Walrus is unavailable. The confirmed lesson and retry identity are saved; no storage success is being assumed.',
    };
  }
}
