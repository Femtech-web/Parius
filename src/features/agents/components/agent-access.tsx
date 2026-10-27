'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
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
import { CopyCode } from '@/components/ui/copy-code';
import { AgentClientSetup } from './agent-client-setup';
import { Dialog } from '@/components/ui/dialog';
type AgentAccessProps = {
  projectId: string;
  preview?: boolean;
  delegation?: { request: PaymentRequest; invoiceTitle: string };
};

export function AgentAccess({ projectId, preview = false, delegation }: AgentAccessProps) {
  const [open, setOpen] = useState(false);
  const title = delegation ? 'Delegate this payment' : 'Connect an AI assistant';
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={control.smallSecondary}
        onClick={() => setOpen(true)}
      >
        {title}
      </button>
      {open && (
        <Dialog title={title} onClose={() => setOpen(false)}>
          <AgentConnectionPanel projectId={projectId} preview={preview} delegation={delegation} />
        </Dialog>
      )}
    </>
  );
}

function AgentConnectionPanel({ projectId, preview = false, delegation }: AgentAccessProps) {
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [key, setKey] = useState(''),
    [label, setLabel] = useState('My project agent');
  const [error, setError] = useState('');
  const request = delegation?.request;
  const [pending, start] = useTransition();
  const [now, setNow] = useState(0);
  const [origin, setOrigin] = useState(
    process.env.NEXT_PUBLIC_APP_URL || 'https://parius.femdev.site',
  );
  const load = useCallback(async () => {
    setNow(Date.now());
    try {
      const result = await listAgentConnections(projectId);
      setError(result.error || '');
      if (result.connections) setConnections(result.connections);
    } catch {
      setError('Connections could not be loaded. Refresh connections to retry.');
    }
  }, [projectId]);
  useEffect(() => {
    if (!preview) start(load);
  }, [load, preview]);
  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-6 text-ash">
        Give an agent access to this project’s approved agreement, milestones, invoices and latest
        30 messages. Keys expire after one hour. Private memories, AI reviews and file contents are
        excluded.
      </p>
      <Link href="/docs/agents" className="mb-5 inline-block text-sm text-ice hover:underline">
        Connect Claude, ChatGPT, Codex or Cursor →
      </Link>
      {delegation && (
        <div className="mb-5 rounded-xl border border-white/10 p-4 text-xs leading-6">
          <p className="font-medium">{delegation.invoiceTitle}</p>
          <p>{displayAmount(delegation.request.amount_atomic, 'USDC', 6)} · One reviewed payment</p>
          <p className="mt-2 text-ash">Expected sending wallet</p>
          <p className="break-all">{delegation.request.payer}</p>
          <p className="mt-2 text-ash">
            Request {delegation.request.id.slice(0, 8)} · Expires{' '}
            {new Date(delegation.request.expires_at).toLocaleString()}
          </p>
        </div>
      )}
      <div className="space-y-4">
        {!key && !request && <AgentClientSetup origin={origin.replace(/\/$/, '')} />}
        <label className="block text-xs">
          Agent name
          <input
            className="mt-2"
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <p className="text-xs leading-6 text-ash">
          {request
            ? 'Use a dedicated agent wallet matching the confirmed sender above. This key permits verification of this one reviewed payment. Signing and spending happen in your agent’s local wallet. The freelancer must still reconcile the receipt and release files.'
            : 'Read-only access. Your assistant cannot send messages, change agreements, make payments, reconcile receipts or release files.'}
        </p>
        <button
          className={control.smallSecondary}
          disabled={pending || preview || Boolean(request && Date.parse(request.expires_at) <= now)}
          onClick={() =>
            start(async () => {
              setKey('');
              const result = await createAgentConnection(projectId, label, request?.id ?? null);
              setError(result.error || '');
              if (result.key) {
                setOrigin(window.location.origin);
                setKey(result.key);
                await load();
              }
            })
          }
        >
          Create one-hour key
        </button>
        {request && Date.parse(request.expires_at) <= now && (
          <p role="status" className="text-xs text-ash">
            These instructions have expired. Close this panel and review the invoice again before
            delegating.
          </p>
        )}
        {preview && (
          <p className="text-xs text-ash">
            Connect an agent from a real project. Preview does not create keys or authorize
            payments.
          </p>
        )}
        {key && (
          <div className="rounded-xl border border-ice/30 p-4">
            <p className="mb-3 text-xs text-ash">
              Copy this key now. It is shown once and disappears when you close this panel. Keep it
              in your agent’s local environment, out of chats and source control.
            </p>
            <CopyCode value={key} title="Private project key" label="Copy key" />
            <AgentClientSetup
              origin={origin.replace(/\/$/, '')}
              agentKey={key}
              paymentDelegation={Boolean(request)}
            />
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <h3 className="text-sm">Your connections</h3>
          <button
            className={control.smallSecondary}
            disabled={pending || preview}
            onClick={() => start(load)}
          >
            {pending ? 'Loading…' : 'Refresh connections'}
          </button>
        </div>
        {!pending &&
          !error &&
          connections.filter((a) => !request || a.request_id === request.id).length === 0 &&
          !preview && <p className="text-xs text-ash">No connections yet.</p>}
        {connections
          .filter((a) => !request || a.request_id === request.id)
          .map((a) => (
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
    </div>
  );
}
