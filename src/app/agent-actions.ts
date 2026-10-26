'use server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import { agentKeyHash } from '@/lib/server/agents';
export type AgentConnection = {
  id: string;
  label: string;
  request_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};
export async function listAgentConnections(
  project: string,
): Promise<{ connections?: AgentConnection[]; error?: string }> {
  if (!z.uuid().safeParse(project).success) return { error: 'Invalid project.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from('agent_connections')
    .select('id,label,request_id,expires_at,revoked_at')
    .eq('project_id', project)
    .order('created_at', { ascending: false })
    .limit(30);
  return error
    ? { error: 'Agent access is unavailable. Apply migration 16 first.' }
    : { connections: data || [] };
}
export async function createAgentConnection(
  project: string,
  label: string,
  paymentRequest: string | null,
): Promise<{ key?: string; error?: string }> {
  if (
    !z.uuid().safeParse(project).success ||
    !z.string().trim().min(2).max(80).safeParse(label).success ||
    !z.uuid().nullable().safeParse(paymentRequest).success
  )
    return { error: 'Check the agent name and payment request.' };
  const { supabase } = await requireSession();
  const key = `parius_${randomBytes(32).toString('base64url')}`;
  const { error } = await supabase.rpc('create_agent_connection', {
    p_project: project,
    p_label: label,
    p_hash: agentKeyHash(key),
    p_request: paymentRequest,
  });
  return error
    ? {
        error:
          error.code === 'P0001'
            ? error.message
            : 'Agent access could not be created. Apply migration 16 first.',
      }
    : { key };
}
export async function revokeAgentConnection(id: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid connection.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('revoke_agent_connection', { p_id: id });
  return error ? { error: 'Connection could not be revoked.' } : {};
}
