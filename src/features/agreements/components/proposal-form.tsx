'use client';
import { useActionState, useId, useState } from 'react';
import { ArrowUpRight, CircleHelp, LoaderCircle } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { editableAmount } from '@/features/agreements/domain';
import type { Agreement } from '@/lib/domain';
import { control } from '@/components/ui/control-styles';
import type { ActionResult } from '@/lib/action-result';
import { Feedback } from '@/components/ui/feedback';
import { proposeAgreement } from '@/features/agreements/server/agreement-actions';
export function ProposalForm({
  projectId,
  onClose,
  onPublished,
  base: latestBase,
  preview = false,
}: {
  projectId: string;
  onClose: () => void;
  onPublished: (result: ActionResult) => void;
  base?: Agreement;
  preview?: boolean;
}) {
  const [base] = useState(latestBase);
  const [revisionHelpOpen, setRevisionHelpOpen] = useState(false);
  const revisionHelpId = useId();
  const baseChanged = base?.id !== latestBase?.id;
  const [state, action, pending] = useActionState(
    async (previous: ActionResult, form: FormData) => {
      const result = await proposeAgreement(projectId, previous, form);
      if (result.success && !result.error) onPublished(result);
      return result;
    },
    {},
  );
  return (
    <form
      action={action}
      className="mt-9 [&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_label]:font-medium [&_input]:mb-6 [&_textarea]:mb-6 [&_[data-select]]:mb-6 [&>button]:mt-6 mb-8 rounded-2xl border border-white/10 bg-slate p-5 md:p-7 [&_h3]:mb-5 [&_h3]:text-xl [&_h3]:font-normal"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h2]:text-3xl [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
        <h3>{base ? 'Propose changes' : 'Propose terms'}</h3>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-ice transition-colors hover:text-paper"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <input type="hidden" name="expected_base" value={base?.id || ''} />
      <label htmlFor="title">Agreement title</label>
      <input
        defaultValue={base?.title}
        id="title"
        name="title"
        placeholder="Website design & development"
        minLength={3}
        maxLength={150}
        required
      />
      <label htmlFor="scope">Scope, deliverables and conditions</label>
      <textarea
        defaultValue={base?.scope}
        id="scope"
        name="scope"
        rows={6}
        placeholder="Describe what’s included, excluded, delivery expectations and payment conditions."
        minLength={20}
        maxLength={12000}
        required
      />
      <div className="grid gap-x-5 sm:grid-cols-2 [&>div]:min-w-0">
        <div>
          <label htmlFor="amount">Total price</label>
          <input
            defaultValue={base ? editableAmount(base) : undefined}
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            pattern="[0-9]+([.][0-9]{1,6})?"
          />
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <Select id="currency" name="currency" defaultValue={base?.currency || 'USDC'}>
            <option>USDC</option>
            <option>USD</option>
            <option>NGN</option>
          </Select>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-1.5">
        <label htmlFor="revision_limit" className="mb-0!">
          Included revision rounds
        </label>
        <span
          className="relative inline-flex"
          onMouseEnter={() => setRevisionHelpOpen(true)}
          onMouseLeave={() => setRevisionHelpOpen(false)}
        >
          <button
            type="button"
            aria-label="About included revision rounds"
            aria-describedby={revisionHelpId}
            className="inline-flex size-7 items-center justify-center rounded-full text-ash transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
            onFocus={() => setRevisionHelpOpen(true)}
            onBlur={() => setRevisionHelpOpen(false)}
            onClick={() => setRevisionHelpOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setRevisionHelpOpen(false);
              }
            }}
          >
            <CircleHelp size={14} aria-hidden="true" />
          </button>
          <span
            id={revisionHelpId}
            role="tooltip"
            hidden={!revisionHelpOpen}
            className="absolute right-0 bottom-full z-20 w-60 rounded-lg border border-white/10 bg-night px-3 py-2 text-xs leading-relaxed text-paper shadow-lg"
          >
            How many rounds of client changes are included in the agreed price.
          </span>
        </span>
      </div>
      <input
        id="revision_limit"
        aria-describedby={revisionHelpId}
        name="revision_limit"
        type="number"
        min="0"
        max="100"
        defaultValue={base?.revision_limit ?? 2}
        required
      />
      <p className="text-xs leading-relaxed text-ash">
        This publishes a new version for review. The active agreement stays unchanged until both
        people approve. No payment is authorized.
      </p>
      {baseChanged && (
        <p role="alert" className="mt-4 text-xs leading-relaxed text-warning">
          The active agreement changed while you were writing. Copy any edits you want to keep, then
          close and reopen this form to review the current terms.
        </p>
      )}
      {preview && (
        <p className="mt-4 text-xs text-ice">
          Preview only. Publishing is available in your own project.
        </p>
      )}
      <Feedback state={state} />
      <button
        disabled={preview || baseChanged || pending || Boolean(state.success)}
        className={control.primary}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" size={16} />
        ) : (
          <>
            Publish proposal
            <ArrowUpRight size={15} />
          </>
        )}
      </button>
    </form>
  );
}
