'use client';
import { Select } from '@/components/select';
import { editableAmount } from '@/lib/agreements';
import type { Agreement } from '@/lib/domain';
import { control } from '@/components/control-styles';

import { useActionState, useId, useState } from 'react';
import { ArrowUpRight, CircleHelp, LoaderCircle, Plus, X } from 'lucide-react';
import { addMilestone, proposeAgreement, type ActionResult } from '@/app/actions';
export function Feedback({ state }: { state: ActionResult }) {
  const [dismissed, setDismissed] = useState<ActionResult | null>(null);
  if (dismissed === state || (!state.error && !state.success)) return null;
  return (
    <div
      className={`my-5 flex items-start gap-3 rounded-xl p-4 text-[13px] leading-relaxed ${state.error ? 'bg-danger-soft text-danger' : 'bg-ice/10 text-ice'}`}
    >
      <p className="min-w-0 flex-1" role={state.error ? 'alert' : 'status'}>
        {state.error || state.success}
      </p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onClick={() => setDismissed(state)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
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
export function MilestoneForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(addMilestone.bind(null, projectId), {});
  return (
    <form
      action={action}
      className="mb-8 rounded-2xl border border-white/10 bg-slate p-5 md:p-7 [&_h3]:mb-5 [&_h3]:text-xl [&_h3]:font-normal mt-9 [&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_label]:font-medium [&_input]:mb-6 [&_textarea]:mb-6 [&_[data-select]]:mb-6 [&>button]:mt-6"
    >
      <h3>Add a milestone</h3>
      <div className="grid gap-x-5 sm:grid-cols-2 [&>div]:min-w-0">
        <div>
          <label htmlFor="milestone-title">Deliverable</label>
          <input
            id="milestone-title"
            name="title"
            placeholder="e.g. Homepage design"
            minLength={3}
            maxLength={150}
            required
          />
        </div>
        <div>
          <label htmlFor="due_date">Due date (optional)</label>
          <input id="due_date" name="due_date" type="date" />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-ash">
        A planning milestone does not change the approved scope or payment terms.
      </p>
      <Feedback state={state} />
      <button className={control.primary} disabled={pending}>
        Add milestone
        <Plus size={15} />
      </button>
    </form>
  );
}
