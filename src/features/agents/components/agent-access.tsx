'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  createAgentConnection,
  listAgentConnections,
  revokeAgentConnection,
  type AgentConnection,
} from '@/features/agents/server/agent-actions';
import { displayAmount } from '@/lib/domain';
import type { PaymentRequest } from '@/features/payments/domain';
import { control } from '@/components/ui/control-styles';
import { Select } from '@/components/ui/select';
export function AgentAccess({
  projectId,
  requests,
  client,
  preview = false,
}: {
  projectId: string;
  requests: PaymentRequest[];
  client: boolean;
  preview?: boolean;
}) {
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [key, setKey] = useState(''),
    [label, setLabel] = useState('My project agent');
  const [requestId, setRequestId] = useState('read'),
    [error, setError] = useState('');
  const [pending, start] = useTransition();
  const [now, setNow] = useState(0);
  async function load() {
    setNow(Date.now());
    const result = await listAgentConnections(projectId);
    setError(result.error || '');
    if (result.connections) setConnections(result.connections);
  }
  return (
    <details
      className="mb-8 border-b border-white/10 pb-6"
      onToggle={(event) => {
        if (event.currentTarget.open && !preview) start(load);
      }}
    >
      <summary className="cursor-pointer py-3 text-sm text-ice">
        Connect a project agent <span className="ml-2 text-xs text-ash">MCP · optional</span>
      </summary>
      <p className="mb-5 max-w-2xl text-sm leading-6 text-ash">
        Give an agent access to this project’s approved agreement, milestones, invoices and latest
        30 messages. Keys expire after one hour. Private memories, AI reviews and file contents are
        excluded.
      </p>
      <Link href="/docs/agents" className="mb-5 inline-block text-sm text-ice hover:underline">
        Connect Claude, ChatGPT, Codex or Cursor →
      </Link>
      <div className="max-w-xl space-y-4">
        <label className="block text-xs">
          Agent name
          <input
            className="mt-2"
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="block text-xs">
          Access
          <Select value={requestId} onChange={(event) => setRequestId(event.target.value)}>
            <option value="read">Read project only</option>
            {client &&
              requests
                .filter((r) => Date.parse(r.expires_at) > now)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    One payment · {displayAmount(r.amount_atomic, 'USDC', 6)} · {r.id.slice(0, 8)}
                  </option>
                ))}
          </Select>
        </label>
        {requestId !== 'read' && (
          <p className="text-xs leading-6 text-ash">
            Use a dedicated agent wallet whose address matches these confirmed instructions. This
            key permits verification of that one payment; signing and spending happen in your
            agent’s local wallet. The freelancer must still reconcile and release files.
          </p>
        )}
        <button
          className={control.smallSecondary}
          disabled={pending || preview}
          onClick={() =>
            start(async () => {
              setKey('');
              const result = await createAgentConnection(
                projectId,
                label,
                requestId === 'read' ? null : requestId,
              );
              setError(result.error || '');
              if (result.key) {
                setKey(result.key);
                await load();
              }
            })
          }
        >
          Create one-hour key
        </button>
        {preview && (
          <p className="text-xs text-ash">
            Connect an agent from a real project. Preview does not create keys or authorize
            payments.
          </p>
        )}
        {key && (
          <div className="rounded-xl border border-ice/30 p-4">
            <p className="mb-3 text-xs text-ash">
              Copy this key now. It is shown once. Keep it in your agent’s local environment, out of
              chats and source control.
            </p>
            <code className="block break-all text-xs">{key}</code>
            <button
              className={`${control.smallSecondary} mt-4`}
              onClick={() => {
                setKey('');
              }}
            >
              Hide key
            </button>
          </div>
        )}
        {connections.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-4 border-t border-white/10 py-3 text-xs"
          >
            <span>
              {a.label}
              <span className="mt-1 block text-ash">
                {a.revoked_at
                  ? 'Revoked'
                  : Date.parse(a.expires_at) <= now
                    ? 'Expired'
                    : `Expires ${new Date(a.expires_at).toLocaleTimeString()}`}{' '}
                · {a.request_id ? 'One payment' : 'Read only'}
              </span>
            </span>
            {!a.revoked_at && Date.parse(a.expires_at) > now && (
              <button
                className={control.smallSecondary}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await revokeAgentConnection(a.id);
                    if (result.error) setError(result.error);
                    else await load();
                  })
                }
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
