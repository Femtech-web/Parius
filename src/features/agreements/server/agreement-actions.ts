'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import type { ActionResult } from '@/lib/action-result';
const uuid = z.string().uuid();
import { unstable_rethrow } from 'next/navigation';
import { agreementInput, atomicAmount } from '@/lib/domain';
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export async function proposeAgreement(
  projectId: string,
  _: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = agreementInput.safeParse(Object.fromEntries(form));
  if (!uuid.safeParse(projectId).success || !parsed.success)
    return { error: !parsed.success ? parsed.error.issues[0].message : 'Invalid project.' };
  try {
    const expectedBase = z.union([uuid, z.literal('')]).safeParse(form.get('expected_base'));
    if (!expectedBase.success) return { error: 'Reload the current agreement before publishing.' };
    const data = parsed.data;
    const decimals = data.currency === 'USDC' ? 6 : 2;
    const amount = atomicAmount(data.amount, decimals);
    if (BigInt(amount) <= 0n) return { error: 'Enter an amount greater than zero.' };
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc('propose_agreement', {
      p_project: projectId,
      p_title: data.title,
      p_scope: data.scope,
      p_amount: amount,
      p_currency: data.currency,
      p_decimals: decimals,
      p_revisions: data.revision_limit,
      p_expected_base: expectedBase.data || null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/projects/${projectId}`);
    return { success: 'Proposal published. Both participants must approve these terms.' };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorText(error) };
  }
}

export async function approveAgreement(
  projectId: string,
  agreementId: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(agreementId).success)
    return { error: 'Invalid agreement.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('approve_agreement', {
    p_project: projectId,
    p_agreement: agreementId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Your approval was recorded for this exact version.' };
}

export async function resolveAgreementProposal(
  projectId: string,
  agreementId: string,
  kind: 'rejected' | 'withdrawn',
  reason: string,
): Promise<ActionResult> {
  const parsed = z
    .object({
      projectId: uuid,
      agreementId: uuid,
      kind: z.enum(['rejected', 'withdrawn']),
      reason: z.string().trim().max(1000),
    })
    .safeParse({ projectId, agreementId, kind, reason });
  if (!parsed.success)
    return { error: 'Check the proposal and use a reason of at most 1,000 characters.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('resolve_agreement_proposal', {
    p_project: projectId,
    p_agreement: agreementId,
    p_kind: kind,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {
    success:
      kind === 'rejected'
        ? 'Proposal rejected. The active terms stay unchanged.'
        : 'Proposal withdrawn. The active terms stay unchanged.',
  };
}
