'use server';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import { historyCursor, historyFilter, type HistoryCursor } from '@/lib/history';
const valid = (id: string, cursor?: HistoryCursor) =>
  z.uuid().safeParse(id).success && (!cursor || historyCursor.safeParse(cursor).success);
import type { Message } from '@/lib/domain';
export async function readMessages(
  projectId: string,
  cursor: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<{ messages?: Message[]; hasMore?: boolean; error?: string }> {
  if (!valid(projectId, cursor) || !['older', 'newer'].includes(direction))
    return { error: 'Invalid message page.' };
  const { supabase } = await requireSession();
  const asc = direction === 'newer';
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', projectId)
    .or(historyFilter(cursor, direction))
    .order('created_at', { ascending: asc })
    .order('id', { ascending: asc })
    .limit(101);
  return error
    ? { error: 'Messages could not be loaded. Please retry.' }
    : { messages: (data || []).slice(0, 100) as Message[], hasMore: (data || []).length > 100 };
}
