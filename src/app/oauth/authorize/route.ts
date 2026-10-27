import { authorizationRequest } from '@/features/agents/oauth';
import { oauthOrigin, oauthSecret } from '@/features/agents/server/oauth';
export function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    authorizationRequest(query, oauthOrigin(), oauthSecret());
    return Response.redirect(`${oauthOrigin()}/projects/connect-agent?${query}`, 303);
  } catch {
    return Response.json(
      {
        error: 'invalid_request',
        error_description: 'The connection request is invalid. Start again from your AI client.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
