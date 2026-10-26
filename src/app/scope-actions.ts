'use server';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { recallLessons } from '@/lib/server/memory';
import type { MemoryReference } from '@/lib/memory';
import { reviewScope } from '@/lib/server/groq';
import type { Agreement, Message } from '@/lib/domain';
import { type ScopeAssessment } from '@/lib/scope-review';
const columns =
  'id,project_id,agreement_id,message_id,status,result,model,created_at,completed_at,memory_revision,recalled_memory_ids,recall_status,prompt_version,memory_influences';
export async function analyzeMessageScope(
  projectId: string,
  messageId: string,
  agreementId: string,
): Promise<{ assessment?: ScopeAssessment; error?: string }> {
  if (![projectId, messageId, agreementId].every((value) => z.uuid().safeParse(value).success))
    return { error: 'Choose a request from this project.' };
  const { supabase, user } = await requireSession();
  // Fetch only authorized rows. Browser-supplied scope, message content and role
  // are never accepted as provider context or authorization.
  const [member, agreement, message] = await Promise.all([
    supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('agreement_versions')
      .select('*')
      .eq('project_id', projectId)
      .eq('id', agreementId)
      .single(),
    supabase.from('messages').select('*').eq('project_id', projectId).eq('id', messageId).single(),
  ]);
  if (member.data?.role !== 'freelancer' || agreement.error || message.error)
    return { error: 'This request is not available for scope review.' };
  if (!process.env.GROQ_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return { error: 'Scope review is not configured yet.' };
  const { data: memoryState, error: stateError } = await supabase
    .from('memory_state')
    .select('revision')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (stateError) return { error: 'Private learning is being connected. Please retry shortly.' };
  const { data: claim, error } = await supabase.rpc('reserve_scope_review', {
    p_project: projectId,
    p_message: messageId,
    p_agreement: agreementId,
    p_memory_revision: memoryState?.revision || 0,
  });
  if (error)
    return {
      error: ['PGRST202', 'PGRST205', '42P01'].includes(error.code)
        ? 'Scope review is being set up. You can keep working in your project.'
        : error.code === 'P0001'
          ? error.message
          : 'Scope review is temporarily unavailable.',
    };
  if (!claim?.id || (!claim.cached && !claim.lease_token))
    return { error: 'Scope review could not be started.' };
  if (!claim.cached) {
    let stage: 'lessons' | 'analysis' | 'save' = 'lessons';
    try {
      const { data: references, error: referencesError } = await supabase
        .from('memory_references')
        .select('id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at')
        .eq('owner_id', user.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(500);
      if (referencesError) throw new Error('Memory references unavailable.');
      const recall = await recallLessons(
        user.id,
        projectId,
        message.data.body,
        (references || []) as MemoryReference[],
      );
      stage = 'analysis';
      const { result, model, influences } = await reviewScope(
        agreement.data as Agreement,
        message.data as Message,
        recall.lessons,
      );
      stage = 'save';
      const { error: saveError } = await privilegedClient().rpc('finish_scope_review', {
        p_id: claim.id,
        p_token: claim.lease_token,
        p_result: result,
        p_model: model,
        p_memory_ids: recall.lessons.map((lesson) => lesson.id),
        p_recall_status: recall.status,
        p_influences: influences,
      });
      if (saveError) throw new Error('Result could not be recorded.');
    } catch (error) {
      unstable_rethrow(error);
      try {
        await privilegedClient().rpc('finish_scope_review', {
          p_id: claim.id,
          p_token: claim.lease_token,
          p_result: null,
          p_model: null,
        });
      } catch {
        /* An expired lease can be reclaimed after its deadline. */
      }
      // Do not return SDK errors: they may contain headers, prompts or raw output.
      return {
        error:
          stage === 'save'
            ? 'The review could not be saved. Refresh and retry in a minute.'
            : stage === 'lessons'
              ? 'Your confirmed lessons could not be loaded. Please retry in a minute.'
              : error instanceof Error &&
                  (error.message ===
                    'The analysis did not cite the supplied scope and request accurately.' ||
                    error.message === 'Unverified memory attribution.')
                ? 'The AI could not verify its supporting evidence. Please retry in a minute.'
                : 'The AI review could not finish. Please retry in a minute.',
      };
    }
  }
  const { data, error: readError } = await supabase
    .from('scope_assessments')
    .select(columns)
    .eq('id', claim.id)
    .single();
  if (readError || !data) return { error: 'The saved review could not be loaded. Please refresh.' };
  revalidatePath(`/projects/${projectId}`);
  return { assessment: data as ScopeAssessment };
}
