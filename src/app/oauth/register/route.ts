import { registerOAuthClient } from '@/features/agents/oauth';
import { oauthHeaders, oauthSecret } from '@/features/agents/server/oauth';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('Content-Length') || 0) > 8192) throw new Error('Too large');
    const body = await request.text();
    if (body.length > 8192) throw new Error('Too large');
    const client = registerOAuthClient(JSON.parse(body), oauthSecret());
    return Response.json(client, { status: 201, headers: oauthHeaders });
  } catch {
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
