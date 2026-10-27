'use server';
import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  authorizationRequest,
  encryptOAuthToken,
  hashOAuth,
  oauthRedirect,
} from '@/features/agents/oauth';
import { oauthOrigin, oauthSecret } from '@/features/agents/server/oauth';
import { requireSession } from '@/lib/server/session';
export async function authorizeOAuth(query: string, form: FormData) {
  const origin = oauthOrigin(),
    secret = oauthSecret();
  const request = authorizationRequest(new URLSearchParams(query), origin, secret);
  const { supabase } = await requireSession();
  if (form.get('decision') === 'deny')
    redirect(oauthRedirect(request, origin, { error: 'access_denied' }));
  const project = z.uuid().safeParse(form.get('project'));
  if (!project.success || form.get('decision') !== 'allow')
    redirect(`${origin}/projects/connect-agent?${query}&error=1`);
  const token = `parius_${randomBytes(32).toString('base64url')}`;
  const code = randomBytes(32).toString('base64url');
  const { error } = await supabase.rpc('authorize_agent_oauth', {
    p_project: project.data,
    p_label: `OAuth · ${request.client.client_name}`.slice(0, 80),
    p_token_hash: hashOAuth(token),
    p_code_hash: hashOAuth(code),
    p_client: request.client_id,
    p_redirect: request.redirect_uri,
    p_resource: request.resource,
    p_challenge: request.code_challenge,
    p_encrypted_token: encryptOAuthToken(token, secret),
  });
  if (error) redirect(`${origin}/projects/connect-agent?${query}&error=1`);
  redirect(oauthRedirect(request, origin, { code }));
}
