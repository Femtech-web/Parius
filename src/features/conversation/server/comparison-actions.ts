'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { recallLessons } from '@/features/memory/server/provider';
import { reviewScope } from '@/features/conversation/server/scope-review';
import {
  pairedScopeReview,
  scopeContext,
  type ScopeComparison,
} from '@/features/conversation/scope-review';
import type { Agreement, Message } from '@/lib/domain';
import type { MemoryReference } from '@/features/memory/domain';
const columns =
  'id,assessment_id,status,without_memory,with_memory,memory_influences,recalled_memory_ids,model,context_hash,prompt_version,completed_at,memory_revision';
export async function compareScopeMemory(
  assessmentId: string,
): Promise<{ comparison?: ScopeComparison; error?: string; retryAfterSeconds?: number }> {
  if (!z.uuid().safeParse(assessmentId).success) return { error: 'Review this request first.' };
  const { supabase, user } = await requireSession();
  const { data: assessment } = await supabase
    .from('scope_assessments')
    .select('id,project_id,agreement_id,message_id')
    .eq('id', assessmentId)
    .single();
  if (!assessment) return { error: 'This private review is unavailable.' };
  const { data: claim, error } = await supabase.rpc('reserve_scope_comparison', {
    p_assessment: assessmentId,
  });
  if (error || !claim)
    return {
      retryAfterSeconds:
        error?.message === 'Wait a minute before another comparison.' ? 60 : undefined,
      error:
        error?.code === 'P0001'
          ? error.message
          : 'Memory comparison is being connected. Please retry later.',
    };
  const reservedAt = Date.now();
  const retryAfterSeconds = () =>
    claim.cached ? undefined : Math.max(0, Math.ceil((reservedAt + 60000 - Date.now()) / 1000));
  if (!claim.cached) {
    const service = privilegedClient();
    let stage: 'context' | 'reviews' | 'save' = 'context';
    try {
      const [agreement, message, references] = await Promise.all([
        supabase
          .from('agreement_versions')
          .select('*')
          .eq('id', assessment.agreement_id)
          .eq('project_id', assessment.project_id)
          .single(),
        supabase
          .from('messages')
          .select('*')
          .eq('id', assessment.message_id)
          .eq('project_id', assessment.project_id)
          .single(),
        supabase
          .from('memory_references')
          .select(
            'id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at',
          )
          .eq('owner_id', user.id)
          .eq('status', 'ready')
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      if (agreement.error || message.error || references.error)
        throw new Error('Context unavailable.');
      const a = agreement.data as Agreement,
        m = message.data as Message;
      const recall = await recallLessons(
        user.id,
        assessment.project_id,
        m.body,
        references.data as MemoryReference[],
      );
      if (recall.status !== 'recalled' || !recall.lessons.length) {
        stage = 'save';
        const { error: saveError } = await service.rpc('finish_scope_comparison', {
          p_id: claim.id,
          p_token: claim.lease_token,
          p_status: recall.status === 'unavailable' ? 'unavailable' : 'no_matches',
        });
        if (saveError) throw new Error('Comparison could not be recorded.');
      } else {
        const model = process.env.GROQ_SCOPE_MODEL || 'openai/gpt-oss-120b';
        stage = 'reviews';
        const pair = await pairedScopeReview(a, m, recall.lessons, (agreement, message, lessons) =>
          reviewScope(agreement, message, lessons, { model, timeoutMs: 30000 }),
        );
        const hash = createHash('sha256')
          .update(scopeContext(a, m, []))
          .digest('hex');
        stage = 'save';
        const { error: saveError } = await service.rpc('finish_scope_comparison', {
          p_id: claim.id,
          p_token: claim.lease_token,
          p_status: 'completed',
          p_without: pair.without.result,
          p_with: pair.withMemory.result,
          p_ids: recall.lessons.map((lesson) => lesson.id),
          p_influences: pair.withMemory.influences,
          p_model: model,
          p_hash: hash,
        });
        if (saveError) throw new Error('Comparison context changed or could not be recorded.');
      }
    } catch {
      try {
        await service.rpc('finish_scope_comparison', {
          p_id: claim.id,
          p_token: claim.lease_token,
          p_status: 'failed',
        });
      } catch {
        /* Preserve the original failure if recording failure is unavailable. */
      }
      return {
        retryAfterSeconds: retryAfterSeconds(),
        error:
          stage === 'reviews'
            ? 'One or both AI reviews could not finish with verified evidence. Please retry the comparison in a minute.'
            : stage === 'save'
              ? 'The comparison could not be saved. Refresh and try again. If your agreement or memories changed, review the request again first.'
              : 'The comparison context could not be loaded. Please refresh and try again.',
      };
    }
  }
  const { data, error: readError } = await supabase
    .from('scope_comparisons')
    .select(columns)
    .eq('id', claim.id)
    .single();
  return readError || !data
    ? { error: 'The saved comparison could not be loaded.', retryAfterSeconds: retryAfterSeconds() }
    : { comparison: data as ScopeComparison, retryAfterSeconds: retryAfterSeconds() };
}
