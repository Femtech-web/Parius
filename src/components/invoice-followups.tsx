'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  readFollowups,
  recordPromise,
  updatePromise,
  prepareFollowup,
  saveFollowup,
  discardFollowup,
  sendFollowup,
} from '@/app/followup-actions';
import { mergeHistory, cursorOf } from '@/lib/history';
import { displayAmount } from '@/lib/domain';
import type { Invoice } from '@/lib/payments';
import type { PaymentPromise, FollowupDraft } from '@/lib/followups';
import type { ActionResult } from '@/app/actions';
import { control } from './control-styles';
import { Feedback } from './workspace-forms';
import { Dialog } from './dialog';
export function InvoiceFollowups({
  invoice,
  outstanding,
  isFreelancer,
  preview,
  onSent,
}: {
  invoice: Invoice;
  outstanding: string;
  isFreelancer: boolean;
  preview: boolean;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [editor, setEditor] = useState(false),
    [pending, setPending] = useState(false);
  const [promises, setPromises] = useState<PaymentPromise[]>([]),
    [active, setActive] = useState<PaymentPromise | null>(null),
    [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState<FollowupDraft | null>(null),
    [body, setBody] = useState(''),
    [feedback, setFeedback] = useState<ActionResult>({}),
    [review, setReview] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [dirty, setDirty] = useState(false);
  const key = useRef<string | null>(null);
  async function load(older = false, keepEdits = false) {
    const page = await readFollowups(
      invoice.id,
      older && promises.length ? cursorOf(promises.at(-1)!) : undefined,
    );
    if (page.error) throw new Error(page.error);
    setPromises((previous) =>
      older ? mergeHistory(previous, page.promises || []) : page.promises || [],
    );
    setActive(page.active || null);
    setHasMore(Boolean(page.hasMore));
    if (!keepEdits) {
      setDraft(page.draft || null);
      setBody(page.draft?.body || '');
      setDirty(false);
    }
  }
  async function run(work: () => Promise<ActionResult>, reload = true) {
    setPending(true);
    setFeedback({});
    try {
      const result = await work();
      setFeedback(result);
      if (!result.error && reload) {
        await load();
        router.refresh();
      }
      return result;
    } catch {
      const result = { error: 'This update could not be confirmed. Refresh before retrying.' };
      setFeedback(result);
      return result;
    } finally {
      setPending(false);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const status = (p: PaymentPromise) =>
    p.status === 'reported'
      ? 'Recorded by freelancer · not client-confirmed'
      : p.status === 'confirmed'
        ? 'Client-confirmed'
        : p.status === 'fulfilled'
          ? 'Closed against recorded receipts'
          : p.status === 'superseded'
            ? 'Replaced'
            : 'Withdrawn';
  const stale =
    draft &&
    (draft.context.outstanding !== outstanding ||
      invoice.status !== 'issued' ||
      draft.context.promise?.id !== active?.id ||
      draft.context.promise?.status !== active?.status);
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <button
        className="min-h-11 text-xs text-ice hover:text-paper"
        aria-expanded={open}
        aria-controls={`followups-${invoice.id}`}
        disabled={pending}
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          if (!preview)
            await run(async () => {
              await load();
              return {};
            }, false);
        }}
      >
        {isFreelancer ? 'Promises & follow-ups' : 'Payment promise'}
      </button>
      {open && (
        <div id={`followups-${invoice.id}`} className="mt-4 space-y-5">
          {preview ? (
            <p className="text-xs leading-relaxed text-ash">
              In your project, record a payment promise or review a follow-up before sending. No
              messages are sent from this preview.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <button
                  className={control.smallSecondary}
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await load(false, dirty);
                      return {
                        success: dirty
                          ? 'Promise history refreshed. Your unsaved draft edits were kept.'
                          : 'Promises and draft refreshed.',
                      };
                    }, false)
                  }
                >
                  Refresh
                </button>
                {invoice.status === 'issued' &&
                  BigInt(outstanding) > 0n &&
                  (!isFreelancer || active?.status !== 'confirmed') && (
                    <button
                      className={control.smallSecondary}
                      disabled={pending}
                      aria-expanded={editor}
                      onClick={() => setEditor(!editor)}
                    >
                      {editor
                        ? 'Close promise form'
                        : active
                          ? 'Replace promise'
                          : isFreelancer
                            ? 'Record a reported promise'
                            : 'Add payment promise'}
                    </button>
                  )}
                {invoice.status === 'issued' &&
                  isFreelancer &&
                  BigInt(outstanding) > 0n &&
                  !draft && (
                    <button
                      className={control.smallSecondary}
                      disabled={pending}
                      onClick={() => void run(async () => prepareFollowup(invoice.id))}
                    >
                      Draft follow-up
                    </button>
                  )}
              </div>
              {editor && (
                <form
                  className="space-y-4 rounded-xl border border-white/10 p-4"
                  onChange={() => {
                    key.current = null;
                  }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    key.current ??= crypto.randomUUID();
                    const result = await run(() =>
                      recordPromise(
                        invoice.id,
                        String(form.get('amount')),
                        String(form.get('date')),
                        String(form.get('note') || ''),
                        key.current!,
                        active?.id || null,
                      ),
                    );
                    if (!result.error) {
                      setEditor(false);
                      key.current = null;
                    }
                  }}
                >
                  <p className="text-xs leading-relaxed text-ash">
                    {isFreelancer
                      ? 'This records what you understood, and stays unconfirmed until the client confirms it.'
                      : 'This records your promised amount and date. It does not send or authorize payment.'}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`promise-amount-${invoice.id}`}
                        className="mb-2 block text-xs"
                      >
                        Promised amount ({invoice.currency})
                      </label>
                      <input
                        id={`promise-amount-${invoice.id}`}
                        name="amount"
                        inputMode="decimal"
                        placeholder="0.00"
                        required
                        disabled={pending}
                      />
                    </div>
                    <div>
                      <label htmlFor={`promise-date-${invoice.id}`} className="mb-2 block text-xs">
                        Payment date
                      </label>
                      <input
                        id={`promise-date-${invoice.id}`}
                        name="date"
                        type="date"
                        required
                        disabled={pending}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`promise-note-${invoice.id}`} className="mb-2 block text-xs">
                      Note (optional)
                    </label>
                    <textarea
                      id={`promise-note-${invoice.id}`}
                      name="note"
                      rows={2}
                      maxLength={500}
                      disabled={pending}
                    />
                  </div>
                  <button className={control.smallPrimary} disabled={pending}>
                    {pending
                      ? 'Saving…'
                      : isFreelancer
                        ? 'Record unconfirmed promise'
                        : 'Confirm my payment promise'}
                  </button>
                </form>
              )}
              {active && (
                <div className="rounded-xl border border-white/10 p-4 text-xs">
                  <p className="text-paper">
                    {displayAmount(active.amount_atomic, invoice.currency, invoice.decimals)} ·{' '}
                    {active.promised_date}
                    {active.promised_date < today && BigInt(outstanding) > 0n
                      ? ' · date passed'
                      : ''}
                  </p>
                  <p className="mt-2 text-ash">{status(active)}</p>
                  {active.note && (
                    <p className="mt-3 whitespace-pre-wrap wrap-anywhere text-ash">{active.note}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {invoice.status === 'issued' &&
                      !isFreelancer &&
                      active.status === 'reported' && (
                        <button
                          className={control.smallSecondary}
                          disabled={pending}
                          onClick={() => void run(() => updatePromise(active.id, 'confirm'))}
                        >
                          Confirm this promise
                        </button>
                      )}
                    {(!isFreelancer || active.status === 'reported') && (
                      <button
                        className={control.smallSecondary}
                        disabled={pending}
                        onClick={() => void run(() => updatePromise(active.id, 'withdraw'))}
                      >
                        Withdraw promise
                      </button>
                    )}
                    {invoice.status === 'issued' && isFreelancer && (
                      <button
                        className={control.smallSecondary}
                        disabled={pending}
                        onClick={() => void run(() => updatePromise(active.id, 'fulfill'))}
                      >
                        Close against recorded receipts
                      </button>
                    )}
                  </div>
                  <p className="mt-3 leading-relaxed text-ash">
                    Promises don’t change the invoice due date or count toward received payments.
                    Closed entries describe the receipt record at that time; later reversals still
                    affect the invoice balance.
                  </p>
                </div>
              )}
              {!active && <p className="text-xs text-ash">No active payment promise.</p>}
              {promises.some((p) => p.id !== active?.id) && (
                <details className="text-xs">
                  <summary className="min-h-8 cursor-pointer text-ash">Promise history</summary>
                  <ul className="mt-3 space-y-3">
                    {promises
                      .filter((p) => p.id !== active?.id)
                      .map((p) => (
                        <li key={p.id} className="border-l border-white/10 pl-3 leading-relaxed">
                          <p>
                            {displayAmount(p.amount_atomic, invoice.currency, invoice.decimals)} ·{' '}
                            {p.promised_date}
                          </p>
                          <p className="mt-1 text-ash">{status(p)}</p>
                          {p.note && (
                            <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-ash">
                              {p.note}
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              {hasMore && (
                <button
                  className={control.smallSecondary}
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await load(true, true);
                      return {};
                    }, false)
                  }
                >
                  Load earlier promises
                </button>
              )}
              {draft && isFreelancer && (
                <section className="space-y-4 rounded-xl border border-white/10 p-4">
                  <h4 className="text-sm">Private follow-up draft</h4>
                  <p className="text-xs text-ash">
                    {draft.revision === 0
                      ? 'Preparation is pending. Refresh shortly, or discard and retry.'
                      : draft.source === 'groq'
                        ? 'AI-assisted wording · invoice facts supplied by Parius'
                        : 'Template draft · AI assistance was unavailable'}
                  </p>
                  {stale && (
                    <p role="status" className="text-xs text-warning">
                      The invoice or promise changed. Discard this draft and prepare a fresh one.
                    </p>
                  )}
                  {draft.revision > 0 && (
                    <>
                      <label className="sr-only" htmlFor={`followup-body-${draft.id}`}>
                        Edit follow-up message
                      </label>
                      <textarea
                        id={`followup-body-${draft.id}`}
                        rows={8}
                        maxLength={2000}
                        value={body}
                        disabled={pending}
                        onChange={(e) => {
                          setBody(e.target.value);
                          setDirty(true);
                        }}
                      />
                      <p className="text-xs leading-relaxed text-ash">
                        Review the text before sending. It will appear in the project conversation
                        as your message. No email, payment or agreement change is automatic.
                      </p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {dirty && (
                      <button
                        className={control.smallSecondary}
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            await load(false, false);
                            return { success: 'Saved draft reloaded; unsaved edits discarded.' };
                          }, false)
                        }
                      >
                        Reload saved draft (discard edits)
                      </button>
                    )}
                    {draft.revision > 0 && (
                      <>
                        <button
                          className={control.smallSecondary}
                          disabled={pending || !body.trim()}
                          onClick={() =>
                            void run(() => saveFollowup(draft.id, draft.revision, body))
                          }
                        >
                          Save draft
                        </button>
                        <button
                          className={control.smallPrimary}
                          disabled={pending || !body.trim() || Boolean(stale)}
                          onClick={() => {
                            setReview(true);
                            setConfirmed(false);
                          }}
                        >
                          Review & send
                        </button>
                      </>
                    )}
                    <button
                      className={control.smallSecondary}
                      disabled={pending}
                      onClick={() => void run(() => discardFollowup(draft.id))}
                    >
                      Discard draft
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          <Feedback state={feedback} />
        </div>
      )}
      {review && draft && (
        <Dialog
          title="Send follow-up to the project?"
          onClose={() => {
            if (!pending) setReview(false);
          }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{body}</p>
          <label className="mt-5 flex items-start gap-3 text-xs leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-ice"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={pending}
            />
            I reviewed this message and want to send it to the project conversation.
          </label>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={control.smallPrimary}
              disabled={pending || !confirmed}
              onClick={async () => {
                const result = await run(() =>
                  sendFollowup(draft.id, draft.revision, body, confirmed),
                );
                if (!result.error) {
                  setReview(false);
                  onSent?.();
                }
              }}
            >
              {pending ? 'Sending…' : 'Send follow-up'}
            </button>
            <button
              className={control.smallSecondary}
              disabled={pending}
              onClick={() => setReview(false)}
            >
              Cancel
            </button>
          </div>
          <Feedback state={feedback} />
        </Dialog>
      )}
    </div>
  );
}
