import {
  agentScope,
  createOAuthAccessToken,
  decryptOAuthToken,
  hashOAuth,
  pkceChallenge,
  tokenRequest,
} from '@/features/agents/oauth';
import { oauthHeaders, oauthOrigin, oauthSecret } from '@/features/agents/server/oauth';
import { privilegedClient } from '@/lib/server/privileged';
import { readBoundedText, RequestBodyError, requestBodyFailure } from '@/lib/request-body';
export async function POST(request: Request) {
  try {
    if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))
      throw new Error('Invalid content type');
    const body = await readBoundedText(request, 16384);
    const secret = oauthSecret();
    const input = tokenRequest(new URLSearchParams(body), oauthOrigin(), secret);
    const { data, error } = await privilegedClient(12000).rpc('exchange_agent_oauth', {
      p_code_hash: hashOAuth(input.code),
      p_client: input.client_id,
      p_redirect: input.redirect_uri,
      p_resource: input.resource,
      p_challenge: pkceChallenge(input.code_verifier),
    });
    if (error || !data || data.expires_in <= 0) throw new Error('Invalid grant');
    const token = decryptOAuthToken(data.encrypted_token, secret);
    return Response.json(
      {
        access_token: createOAuthAccessToken(token, input.resource, data.expires_in, secret),
        token_type: 'Bearer',
        expires_in: data.expires_in,
        scope: agentScope,
      },
      { headers: oauthHeaders },
    );
  } catch (error) {
    if (error instanceof RequestBodyError) return requestBodyFailure(error, oauthHeaders);
    return Response.json(
      {
        error: 'invalid_grant',
        error_description:
          'The code is invalid, expired or already used. Connect again from your AI client.',
      },
      { status: 400, headers: oauthHeaders },
    );
  }
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...oauthHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
