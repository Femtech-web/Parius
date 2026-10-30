import { registerOAuthClient } from '@/features/agents/oauth';
import { oauthHeaders, oauthSecret } from '@/features/agents/server/oauth';
import { readBoundedText, RequestBodyError, requestBodyFailure } from '@/lib/request-body';
export async function POST(request: Request) {
  try {
    const body = await readBoundedText(request, 8192);
    const client = registerOAuthClient(JSON.parse(body), oauthSecret());
    return Response.json(client, { status: 201, headers: oauthHeaders });
  } catch (error) {
    if (error instanceof RequestBodyError) return requestBodyFailure(error, oauthHeaders);
    return Response.json(
      {
        error: 'invalid_client_metadata',
        error_description:
          'Use a public PKCE client with registered HTTPS or loopback redirect URIs.',
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
