import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAgentMcp } from '@/features/agents/mcp';
import { agentContext, agentKeyHash, agentPaymentSecret } from '@/features/agents/server/access';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let hash: string;
  try {
    hash = agentKeyHash((request.headers.get('Authorization') || '').replace(/^Bearer /, ''));
    await agentContext(hash);
  } catch {
    return Response.json(
      { error: 'A valid, unexpired project agent key is required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (Number(request.headers.get('Content-Length') || 0) > 16384)
    return Response.json({ error: 'Request too large.' }, { status: 413 });
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
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } finally {
    await transport.close();
    await server.close();
  }
}
