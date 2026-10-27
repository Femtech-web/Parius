'use client';
import { Check } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { AgreementComparison } from '@/features/agreements/components/agreement-comparison';
import { Feedback } from '@/components/ui/feedback';
import { control } from '@/components/ui/control-styles';
import { displayAmount, type Agreement } from '@/lib/domain';
import type { ActionResult } from '@/lib/action-result';
export function AgreementDialogs({
  kind,
  selected,
  agreements,
  resolutionKind,
  reason,
  setReason,
  feedback,
  pending,
  preview,
  onClose,
  onResolve,
  onApprove,
}: {
  kind: 'resolve' | 'approve';
  selected: Agreement;
  agreements: Agreement[];
  resolutionKind: 'rejected' | 'withdrawn';
  reason: string;
  setReason: (reason: string) => void;
  feedback: ActionResult;
  pending: boolean;
  preview: boolean;
  onClose: () => void;
  onResolve: () => void;
  onApprove: () => void;
}) {
  return (
    <>
      {kind === 'resolve' && (
        <Dialog
          title={`${resolutionKind === 'rejected' ? 'Reject' : 'Withdraw'} version ${selected.version}?`}
          onClose={() => onClose()}
        >
          <p>
            This closes the proposal for <strong>{selected.title}</strong>. Existing approvals
            remain in its history, and the active agreement stays unchanged. Continuing with
            different terms requires a new proposal and fresh approvals.
          </p>
          <label htmlFor="resolution-reason" className="mt-6 mb-3 block text-xs text-paper">
            Reason (optional, shared with your project partner)
          </label>
          <textarea
            id="resolution-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
          {preview && (
            <p className="mt-5 text-xs text-ice">Preview only. No proposal will be changed.</p>
          )}
          <Feedback state={feedback} />
          <footer>
            <button className={control.secondary} onClick={() => onClose()}>
              Keep reviewing
            </button>
            <button disabled={pending || preview} className={control.primary} onClick={onResolve}>
              {pending
                ? 'Saving…'
                : resolutionKind === 'rejected'
                  ? 'Reject proposal'
                  : 'Withdraw proposal'}
            </button>
          </footer>
        </Dialog>
      )}
      {kind === 'approve' && (
        <Dialog title={`Approve version ${selected.version}?`} onClose={() => onClose()}>
          <p>
            You’re approving <strong>{selected.title}</strong>, including the complete scope shown
            in this version.
          </p>
          <div className="my-7 flex flex-wrap gap-x-10 gap-y-5 border-y border-white/10 py-6 [&_small]:mb-2 [&_small]:block [&_small]:text-xs [&_small]:text-ash [&_strong]:text-base [&_strong]:font-medium [&_strong]:tabular-nums">
            <div>
              <small>Total price</small>
              <strong>
                {displayAmount(selected.amount_atomic, selected.currency, selected.decimals)}
              </strong>
            </div>
            <div>
              <small>Revisions</small>
              <strong>{selected.revision_limit} rounds</strong>
            </div>
          </div>
          <p>
            The agreement becomes active only when both people approve this same version. This
            approval does not authorize a payment.
          </p>
          <details className="mt-5 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer text-xs text-ice">
              Read the complete scope and conditions
            </summary>
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper/85">
              {selected.scope}
            </p>
          </details>
          <AgreementComparison
            base={agreements.find((a) => a.id === selected.base_version_id)}
            next={selected}
          />
          {preview && (
            <p className="mt-5 text-xs text-ice">
              Preview only. Approval is available in your own project.
            </p>
          )}
          <Feedback state={feedback} />
          <footer>
            <button className={control.secondary} onClick={() => onClose()}>
              Keep reviewing
            </button>
            <button className={control.primary} disabled={pending || preview} onClick={onApprove}>
              Approve this version
              <Check size={15} />
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
