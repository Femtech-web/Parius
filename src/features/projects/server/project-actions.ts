'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import type { ActionResult } from '@/lib/action-result';
const uuid = z.string().uuid();
import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { projectInput, type ActivityEvent } from '@/lib/domain';
function nameFor(user: { email?: string; user_metadata: Record<string, unknown> }) {
  return String(
    user.user_metadata.full_name || user.email?.split('@')[0] || 'Project member',
  ).slice(0, 100);
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
