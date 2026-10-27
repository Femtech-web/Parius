'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import type { ActionResult } from '@/lib/action-result';
const uuid = z.string().uuid();
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
