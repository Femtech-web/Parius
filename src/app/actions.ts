'use server';
import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';
import { requireSession } from '@/lib/server/session';
import { createClient } from '@/lib/supabase/server';
import { projectInput, agreementInput, atomicAmount, type ActivityEvent } from '@/lib/domain';
export type ActionResult = { error?: string; success?: string; url?: string };
const uuid = z.string().uuid();
function nameFor(user: { email?: string; user_metadata: Record<string, unknown> }) {
  return String(
    user.user_metadata.full_name || user.email?.split('@')[0] || 'Project member',
  ).slice(0, 100);
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
export async function createProject(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = projectInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireSession();
  const { data, error } = await supabase.rpc('create_project', {
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_client_name: parsed.data.client_name,
    p_display_name: nameFor(user),
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  redirect(`/projects/${data}`);
}
export async function sendMessage(
  projectId: string,
  body: string,
  key: string,
  source: 'chat' | 'imported',
): Promise<ActionResult> {
  const parsed = z
    .object({
      projectId: uuid,
      body: z.string().trim().min(1).max(6000),
      key: uuid,
      source: z.enum(['chat', 'imported']),
    })
    .safeParse({ projectId, body, key, source });
  if (!parsed.success) return { error: 'Enter a message of 1–6,000 characters.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('send_message', {
    p_project: projectId,
    p_body: parsed.data.body,
    p_key: key,
    p_source: source,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Message sent' };
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
export async function createInvite(
  projectId: string,
): Promise<ActionResult & { emailReady?: boolean }> {
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' };
  const { supabase } = await requireSession();
  const token = randomBytes(32).toString('hex');
  const { error } = await supabase.rpc('create_project_invite', {
    p_project: projectId,
    p_token_hash: createHash('sha256').update(token).digest('hex'),
  });
  if (error) return { error: error.message };
  return {
    url: `/invite/${token}`,
    emailReady: Boolean(process.env.RESEND_API_KEY && process.env.INVITE_EMAIL_FROM),
    success:
      'Private invite ready. It expires in 7 days. Creating another invite revokes this one.',
  };
}
export async function acceptInvite(token: string): Promise<ActionResult> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { error: 'Invalid invitation.' };
  const { supabase, user } = await requireSession();
  const { data, error } = await supabase.rpc('accept_project_invite', {
    p_token_hash: createHash('sha256').update(token).digest('hex'),
    p_display_name: nameFor(user),
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return { url: `/projects/${data}` };
}
export async function addMilestone(
  projectId: string,
  _: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const title = z.string().trim().min(3).max(150).safeParse(form.get('title'));
  const due = form.get('due_date');
  if (!title.success || !uuid.safeParse(projectId).success)
    return { error: 'Enter a milestone title of 3–150 characters.' };
  if (due && !z.iso.date().safeParse(due).success) return { error: 'Enter a valid date.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('add_milestone', {
    p_project: projectId,
    p_title: title.data,
    p_due: due || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Milestone added. This does not change agreed scope or price.' };
}
export async function transitionMilestone(
  projectId: string,
  milestoneId: string,
  state: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(projectId).success ||
    !uuid.safeParse(milestoneId).success ||
    !['in_progress', 'ready_for_review', 'accepted', 'changes_requested'].includes(state)
  )
    return { error: 'Invalid milestone.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('transition_milestone', {
    p_project: projectId,
    p_milestone: milestoneId,
    p_state: state,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Milestone updated.' };
}
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
  if (error) throw new Error('Sign-out could not be fully confirmed. Please retry.');
  redirect('/login');
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
export async function loadProjectActivity(
  projectId: string,
  before: { time: string; id: string },
): Promise<{ events?: ActivityEvent[]; hasMore?: boolean; error?: string }> {
  const parsed = z
    .object({
      projectId: uuid,
      before: z.object({ time: z.iso.datetime({ offset: true }), id: uuid }),
    })
    .safeParse({ projectId, before });
  if (!parsed.success) return { error: 'Reload the activity history and try again.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc('read_project_activity', {
    p_project: projectId,
    p_before_time: before.time,
    p_before_id: before.id,
    p_limit: 51,
  });
  if (error) return { error: 'Activity could not be loaded. Please retry.' };
  return { events: (data || []).slice(0, 50), hasMore: (data || []).length > 50 };
}
