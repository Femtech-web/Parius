import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const origin = new URL(process.env.PARIUS_URL || 'http://localhost:3000');
if (
  origin.protocol !== 'https:' &&
  !(origin.protocol === 'http:' && origin.hostname === 'localhost')
)
  throw new Error('Use HTTPS or localhost.');
const key = process.env.PARIUS_AGENT_KEY;
if (!key) throw new Error('Set PARIUS_AGENT_KEY in the MCP client environment.');
const client = new Client({ name: 'parius-local-bridge', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', origin), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  }),
);
const bridge = new Server({ name: 'parius', version: '1.0.0' }, { capabilities: { tools: {} } });
bridge.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
bridge.setRequestHandler(CallToolRequestSchema, (request) => client.callTool(request.params));
await bridge.connect(new StdioServerTransport());
process.on('SIGINT', () => {
  void Promise.all([client.close(), bridge.close()]).then(() => process.exit(0));
});
