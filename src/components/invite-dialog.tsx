'use client';
import { useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Copy, LoaderCircle, Mail } from 'lucide-react';
import { emailProjectInvitation } from '@/app/invitation-actions';
import type { ActionResult } from '@/app/actions';
import { Dialog } from './dialog';
import { Feedback } from './workspace-forms';
import { control } from './control-styles';
const subscribeOrigin = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => '';
export function InviteDialog({
  projectId,
  invite,
  creating,
  onClose,
}: {
  projectId: string;
  invite: ActionResult & { emailReady?: boolean };
  creating: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(''),
    [notice, setNotice] = useState<ActionResult>({});
  const [sending, start] = useTransition();
  const [emailSent, setEmailSent] = useState(false);
  const link = useRef<HTMLTextAreaElement>(null);
  const origin = useSyncExternalStore(subscribeOrigin, browserOrigin, serverOrigin);
  return (
    <Dialog title="Bring your client in." onClose={onClose}>
      <p>Copy the link or email it to your client.</p>
      {creating ? (
        <p role="status" className="mt-6 text-xs text-ash">
          Creating your invite…
        </p>
      ) : invite.url ? (
        <>
          <label htmlFor="invitation-link" className="sr-only">
            Private invitation link
          </label>
          <textarea
            ref={link}
            id="invitation-link"
            readOnly
            rows={2}
            value={`${origin}${invite.url}`}
            className="mt-6 w-full resize-none rounded-xl border border-white/10 bg-night p-4 font-mono text-xs leading-relaxed text-ice"
          />
          <button
            type="button"
            disabled={!origin}
            className={`${control.secondary} mt-3 w-full`}
            onClick={async () => {
              setNotice({});
              setEmailSent(false);
              try {
                await navigator.clipboard.writeText(link.current?.value || '');
                setNotice({ success: 'Invite link copied.' });
              } catch {
                link.current?.focus();
                link.current?.select();
                setNotice({ error: 'Select and copy the link above.' });
              }
            }}
          >
            <Copy size={14} />
            Copy invite link
          </button>
          <form
            className="mt-6 border-t border-white/10 pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice({});
              setEmailSent(false);
              start(async () => {
                try {
                  const result = await emailProjectInvitation({
                    projectId,
                    token: invite.url!.split('/').at(-1)!,
                    email: email.trim(),
                  });
                  setNotice(result);
                  if (result.success && !result.error) {
                    setEmail('');
                    setEmailSent(true);
                  }
                } catch {
                  setNotice({
                    error:
                      'The email request could not be confirmed. Retry after a minute or copy the link.',
                  });
                }
              });
            }}
          >
            <label htmlFor="invite-email" className="mb-3 block text-xs">
              Client email
            </label>
            <input
              id="invite-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="client@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setNotice({});
                setEmailSent(false);
              }}
              maxLength={254}
              required
              disabled={sending || !invite.emailReady}
            />
            <button
              className={`${control.primary} mt-3 w-full`}
              disabled={sending || !invite.emailReady || !email.trim()}
            >
              {sending ? (
                <LoaderCircle size={15} className="motion-safe:animate-spin" />
              ) : (
                <Mail size={15} />
              )}
              {sending ? 'Sending invitation…' : 'Send invite email'}
            </button>
            {!invite.emailReady && (
              <p className="mt-3 text-xs text-ash">
                Email invitations aren’t configured yet. You can still copy the link.
              </p>
            )}
          </form>
          <p className="mt-5 text-xs leading-relaxed text-ash">
            Single use · Valid for 7 days. Share privately.
          </p>
          <Feedback state={notice} />
          {emailSent && (
            <p className="mt-2 text-xs text-ash">Not in the inbox? Check spam.</p>
          )}
        </>
      ) : (
        <Feedback state={invite} />
      )}
    </Dialog>
  );
}
