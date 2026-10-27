'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import type { ActionResult } from '@/lib/action-result';
const uuid = z.string().uuid();
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
