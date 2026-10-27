'use client';
import { useId, useState } from 'react';
import { CopyCode } from '@/components/ui/copy-code';
import { Select } from '@/components/ui/select';

export function AgentClientSetup({ origin, agentKey }: { origin: string; agentKey?: string }) {
  const [client, setClient] = useState('claude');
  const [checkout, setCheckout] = useState('');
  const [executable, setExecutable] = useState('pnpm');
  const id = useId();
  const endpoint = `${origin}/api/mcp`;
  const absolutePath = /^(\/|[A-Za-z]:[\\/])/.test(checkout.trim());
  let config = '',
    destination = '';
  if (agentKey && client === 'cursor') {
    config = JSON.stringify(
      {
        mcpServers: { parius: { url: endpoint, headers: { Authorization: `Bearer ${agentKey}` } } },
      },
      null,
      2,
    );
    destination = 'Cursor · personal ~/.cursor/mcp.json';
  } else if (agentKey && client === 'codex') {
    config = `[mcp_servers.parius]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${agentKey}`)} }`;
    destination = 'Codex · private ~/.codex/config.toml';
  } else if (agentKey && client === 'desktop' && absolutePath && executable.trim()) {
    config = JSON.stringify(
      {
        mcpServers: {
          parius: {
            command: executable.trim(),
            args: ['--dir', checkout.trim(), 'agent:mcp'],
            env: { PARIUS_URL: origin, PARIUS_AGENT_KEY: agentKey },
          },
        },
      },
      null,
      2,
    );
    destination = 'Claude Desktop · local stdio configuration';
  }
  return (
    <div>
      <CopyCode value={endpoint} title="MCP server URL" label="Copy URL" />
      {!agentKey && (
        <p className="text-xs leading-6 text-ash">
          For ChatGPT or another OAuth client, add this URL, sign in to Parius and choose one
          project. No copied key is needed. For a key-based client, create a key below to get
          filled-in settings.
        </p>
      )}
      {agentKey && (
        <>
          <label htmlFor={id} className="mb-2 block text-xs">
            Where are you connecting?
          </label>
          <Select id={id} value={client} onChange={(event) => setClient(event.target.value)}>
            <option value="claude">Claude · remote connector</option>
            <option value="cursor">Cursor · JSON</option>
            <option value="codex">Codex · TOML</option>
            <option value="desktop">Claude Desktop · local bridge</option>
            <option value="oauth">ChatGPT / OAuth</option>
          </Select>
          {client === 'claude' && (
            <>
              <p className="mt-4 text-xs leading-6 text-ash">
                Choose No sign in before adding a Request header named Authorization. Claude may
                disable that name when Sign in now is selected because OAuth manages it. Paste the
                value below into the header’s value field. For OAuth instead, remove the manual
                header and use Sign in now with Register automatically.
              </p>
              <CopyCode
                value={`Bearer ${agentKey}`}
                title="Authorization header value"
                label="Copy value"
              />
            </>
          )}
          {client === 'oauth' && (
            <p className="mt-4 text-xs leading-6 text-ash">
              ChatGPT uses OAuth, so this key is not needed. Add the server URL, choose OAuth with
              automatic registration, then sign in to Parius and approve one project. You may revoke
              this unused key below.
            </p>
          )}
          {client === 'desktop' && (
            <div className="mt-4 space-y-4">
              <p className="text-xs leading-6 text-ash">
                Use this only for a local stdio client. Enter the actual Parius checkout path so the
                generated configuration is ready to paste.
              </p>
              <label className="block text-xs">
                Absolute path to Parius checkout
                <input
                  className="mt-2"
                  value={checkout}
                  maxLength={500}
                  placeholder="/Users/you/projects/parius"
                  onChange={(event) => setCheckout(event.target.value)}
                />
              </label>
              <label className="block text-xs">
                pnpm executable
                <input
                  className="mt-2"
                  value={executable}
                  maxLength={500}
                  onChange={(event) => setExecutable(event.target.value)}
                />
              </label>
              <p className="text-xs leading-6 text-ash">
                If the desktop app cannot find pnpm, use the absolute path from your terminal’s
                command -v pnpm output.
              </p>
              {!absolutePath && (
                <p className="text-xs text-ash">
                  Enter an absolute checkout path to generate the configuration.
                </p>
              )}
            </div>
          )}
          {config && (
            <>
              <CopyCode value={config} title={destination} label="Copy configuration" />
              <p className="text-xs leading-6 text-ash">
                This includes your private one-hour key. Paste it only into your personal client
                settings. Merge the Parius entry with existing settings; do not overwrite other
                servers or commit this configuration.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
