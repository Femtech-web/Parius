'use server';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { walletOrigin } from '@/lib/wallets';
import {
  invitationEmailInput,
  invitationMessage,
  submitInvitationEmail,
} from '@/lib/invitation-email';
import type { ActionResult } from './actions';
export async function emailProjectInvitation(input: {
  projectId: string;
  token: string;
  email: string;
}): Promise<ActionResult> {
  const parsed = invitationEmailInput.safeParse(input);
  if (!parsed.success) return { error: 'Enter a valid client email address.' };
  const { supabase } = await requireSession();
  const key = process.env.RESEND_API_KEY,
    from = process.env.INVITE_EMAIL_FROM;
  if (!key || !from || /[\r\n]/.test(from))
    return { error: 'Email invitations are not configured yet. You can still copy the link.' };
  let origin: string;
  try {
    origin = walletOrigin(
      process.env.NEXT_PUBLIC_APP_URL,
      (await headers()).get('origin'),
      process.env.NODE_ENV === 'development',
    );
  } catch {
    return { error: 'Open Parius at its configured address to send invitations.' };
  }
  const { projectId, token, email } = parsed.data;
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single();
  if (!project) return { error: 'This project is unavailable.' };
  const message = invitationMessage(origin, token, from, email, project.name);
  const { data, error } = await supabase.rpc('reserve_invitation_email', {
    p_project: projectId,
    p_token_hash: createHash('sha256').update(token).digest('hex'),
    p_email: email,
    p_payload_hash: createHash('sha256').update(JSON.stringify(message)).digest('hex'),
  });
  if (error?.code === 'P0001' && error.message.startsWith('Email delivery is uncertain'))
    return { error: 'Email could not be confirmed. Copy the link to continue.' };
  if (error?.code === 'P0001' && error.message.startsWith('This email retry changed'))
    return { error: 'Email settings changed. Copy the link or reopen the project to try again.' };
  if (error || !data)
    return {
      error:
        error?.code === 'P0001'
          ? error.message
          : 'The email could not be prepared. Copy the link or try again.',
    };
  if (data.cached) return { success: 'Invite email already sent to this address.' };
  try {
    const provider = await submitInvitationEmail(key, data.id, message);
    const { error: saveError } = await privilegedClient(10000).rpc('complete_invitation_email', {
      p_id: data.id,
      p_lease: data.lease_token,
      p_provider: provider,
    });
    if (saveError) throw new Error('Provider confirmation could not be saved');
    return {
      success: 'Invite email sent.',
    };
  } catch {
    return {
      error: 'Email could not be confirmed. Wait a minute and retry, or copy the link.',
    };
  }
}
