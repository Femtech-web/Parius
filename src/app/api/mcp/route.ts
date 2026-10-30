import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAgentMcp } from '@/features/agents/mcp';
import { agentContext, agentKeyHash, agentPaymentSecret } from '@/features/agents/server/access';
import {
  oauthChallenge,
  oauthHeaders,
  oauthOrigin,
  oauthSecret,
} from '@/features/agents/server/oauth';
import { readOAuthAccessToken } from '@/features/agents/oauth';
import { readBoundedText, RequestBodyError, requestBodyFailure } from '@/lib/request-body';
export const runtime = 'nodejs';
function mcpKeyHash(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  return agentKeyHash(
    token.startsWith('po1.')
      ? readOAuthAccessToken(token, `${oauthOrigin()}/api/mcp`, oauthSecret())
      : token,
  );
}
function unauthorized() {
  return Response.json(
    { error: 'A valid, unexpired project agent connection is required.' },
    { status: 401, headers: { ...oauthHeaders, 'WWW-Authenticate': oauthChallenge() } },
  );
}
// Stateless transport does not keep an SSE stream. Discovery still needs an auth challenge.
export async function GET(request: Request) {
  try {
    await agentContext(mcpKeyHash(request));
    return new Response(null, {
      status: 405,
      headers: { ...oauthHeaders, Allow: 'POST, OPTIONS' },
    });
  } catch {
    return unauthorized();
  }
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...oauthHeaders,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
      'Access-Control-Expose-Headers': 'WWW-Authenticate',
    },
  });
}
export async function POST(request: Request) {
  let hash: string;
  try {
    hash = mcpKeyHash(request);
    await agentContext(hash);
  } catch {
    return unauthorized();
  }
  let body: string;
  try {
    body = await readBoundedText(request, 16384);
  } catch (error) {
    if (error instanceof RequestBodyError) return requestBodyFailure(error, oauthHeaders);
    throw error;
  }
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
  });
  const server = createAgentMcp(
    () => agentContext(hash),
    new URL(request.url).host,
    agentPaymentSecret(),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(boundedRequest);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  } finally {
    await transport.close();
    await server.close();
  }
}
