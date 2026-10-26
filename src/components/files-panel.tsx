'use client';
import { Select } from '@/components/select';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, LoaderCircle } from 'lucide-react';
import {
  reserveFile,
  finishFile,
  readFilePage,
  readFileRecord,
  releaseFile,
  removeFile,
} from '@/app/file-actions';
import { createClient } from '@/lib/supabase/client';
import { FILE_BUCKET, MAX_FILE_BYTES, fileMime, type ProjectFile } from '@/lib/files';
import type { Agreement, Milestone } from '@/lib/domain';
import type { Invoice } from '@/lib/payments';
import type { ActionResult } from '@/app/actions';
import { control } from './control-styles';
import { Dialog } from './dialog';
import { Feedback } from './workspace-forms';

export function FilesPanel({
  projectId,
  userId,
  isFreelancer,
  files,
  hasMore: initialHasMore,
  ready,
  preview,
  active,
  milestones,
  invoices,
  initialMilestone = '',
}: {
  projectId: string;
  userId: string;
  isFreelancer: boolean;
  files: ProjectFile[];
  hasMore: boolean;
  ready: boolean;
  preview: boolean;
  active?: Agreement;
  milestones: Milestone[];
  invoices: Invoice[];
  initialMilestone?: string;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [editor, setEditor] = useState(false),
    [kind, setKind] = useState<'attachment' | 'preview' | 'final'>('attachment');
  const [milestone, setMilestone] = useState(initialMilestone),
    [filter, setFilter] = useState(initialMilestone);
  const [rule, setRule] = useState<'invoice_paid' | 'on_approval'>('invoice_paid');
  const [upload, setUpload] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<ActionResult>({});
  const [older, setOlder] = useState<ProjectFile[]>([]),
    [more, setMore] = useState(initialHasMore);
  const [dialog, setDialog] = useState<{ kind: 'release' | 'remove'; file: ProjectFile } | null>(
      null,
    ),
    [confirmed, setConfirmed] = useState(false);
  const all = useMemo(
    () =>
      Array.from(new Map([...older, ...files].map((f) => [f.id, f])).values()).sort(
        (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      ),
    [older, files],
  );
  async function run(work: () => Promise<ActionResult>, refreshId?: string) {
    setPending(true);
    setFeedback({});
    try {
      const result = await work();
      setFeedback(result);
      if (!result.error) {
        if (refreshId) {
          const updated = await readFileRecord(refreshId);
          if (updated)
            setOlder((previous) => [...previous.filter((f) => f.id !== updated.id), updated]);
        }
        router.refresh();
      }
      return result;
    } catch {
      const result = { error: 'The file operation could not be confirmed. Please retry.' };
      setFeedback(result);
      return result;
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-normal tracking-[-.04em]">Files</h2>
        <button
          className={control.smallSecondary}
          disabled={pending || (!ready && !preview)}
          aria-expanded={editor}
          aria-controls="file-upload"
          onClick={() => setEditor(!editor)}
        >
          <Plus size={14} />
          {editor ? 'Close upload' : 'Upload file'}
        </button>
      </header>
      {!ready && !preview && (
        <p role="status" className="mb-6 text-sm text-ash">
          Files are being connected. Your project remains available.
        </p>
      )}
      {editor && (
        <form
          id="file-upload"
          className="mb-8 space-y-5 rounded-2xl border border-white/10 bg-slate p-5 md:p-7"
          onChange={() => {
            key.current = null;
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (preview) {
              setFeedback({ success: 'Preview only. Upload files in your own project.' });
              return;
            }
            if (
              !upload ||
              !fileMime(upload.name) ||
              upload.size < 1 ||
              upload.size > MAX_FILE_BYTES
            ) {
              setFeedback({ error: 'Choose a PDF, image, TXT or ZIP file up to 10 MB.' });
              return;
            }
            const form = new FormData(e.currentTarget);
            key.current ??= crypto.randomUUID();
            const result = await run(async () => {
              const reservation = await reserveFile({
                projectId,
                key: key.current!,
                name: upload.name,
                size: upload.size,
                kind,
                milestoneId: milestone || null,
                rule: kind === 'final' ? rule : null,
                invoiceId:
                  kind === 'final' && rule === 'invoice_paid'
                    ? String(form.get('invoice') || '') || null
                    : null,
                quote: kind === 'final' ? String(form.get('quote') || '') : null,
              });
              if (reservation.error || !reservation.id || !reservation.path || !reservation.mime)
                return { error: reservation.error || 'Upload could not be prepared.' };
              if (reservation.status !== 'ready') {
                // No overwrite or read/list policy. If a retry finds an existing object,
                // server verification decides whether it is the original valid upload.
                await createClient().storage.from(FILE_BUCKET).upload(reservation.path, upload, {
                  contentType: reservation.mime,
                  upsert: false,
                });
              }
              return finishFile(reservation.id);
            });
            if (!result.error) {
              setEditor(false);
              setUpload(null);
              key.current = null;
            }
          }}
        >
          <div>
            <label htmlFor="project-upload" className="mb-2 block text-xs text-ash">
              Choose a file
            </label>
            <input
              id="project-upload"
              type="file"
              required
              disabled={pending || preview}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.zip"
              onChange={(e) => setUpload(e.target.files?.[0] || null)}
            />
            <p className="mt-2 text-xs text-ash">PDF, PNG, JPG, WebP, TXT or ZIP · up to 10 MB</p>
          </div>
          {isFreelancer && (
            <div>
              <label htmlFor="file-kind" className="mb-2 block text-xs text-ash">
                File type
              </label>
              <Select
                id="file-kind"
                aria-describedby="file-kind-help"
                value={kind}
                disabled={pending}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option
                  value="attachment"
                  data-description="Reference files both people can download."
                >
                  Shared attachment
                </option>
                <option value="preview" data-description="Work the client can download and review.">
                  Milestone preview
                </option>
                <option
                  value="final"
                  data-description="Finished files held until the agreed release conditions are met."
                >
                  Final deliverable
                </option>
              </Select>
              <p id="file-kind-help" className="mt-2 text-xs leading-relaxed text-ash">
                {kind === 'attachment'
                  ? 'Both people can download this file.'
                  : kind === 'preview'
                    ? 'The client can download this to review the milestone.'
                    : 'The client can pay while this file is locked. Download opens after the agreed conditions and your release.'}
              </p>
            </div>
          )}
          <div>
            <label htmlFor="file-milestone" className="mb-2 block text-xs text-ash">
              Milestone {kind === 'attachment' ? '(optional)' : ''}
            </label>
            <Select
              id="file-milestone"
              value={milestone}
              required={kind !== 'attachment'}
              disabled={pending}
              onChange={(e) => setMilestone(e.target.value)}
            >
              <option value="">Choose a milestone</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </div>
          {kind === 'final' && (
            <>
              <p className="text-xs leading-relaxed text-ash">
                Share a milestone preview if the client needs to review the work first. Final files
                require client acceptance before release.
              </p>
              {!active ? (
                <p className="text-xs text-warning">
                  Approve an agreement before uploading a final deliverable.
                </p>
              ) : (
                <details className="text-xs leading-relaxed text-ash">
                  <summary className="min-h-8 cursor-pointer text-ice">
                    Approved agreement v{active.version}
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap wrap-anywhere">{active.scope}</p>
                </details>
              )}
              <div>
                <label htmlFor="file-rule" className="mb-2 block text-xs text-ash">
                  Release condition in the agreement
                </label>
                <Select
                  id="file-rule"
                  value={rule}
                  disabled={pending}
                  onChange={(e) => setRule(e.target.value as typeof rule)}
                >
                  <option value="invoice_paid">Client acceptance and linked invoice paid</option>
                  <option value="on_approval">Client acceptance, without a payment gate</option>
                </Select>
              </div>
              {rule === 'invoice_paid' && (
                <div>
                  <label htmlFor="file-invoice" className="mb-2 block text-xs text-ash">
                    Linked invoice
                  </label>
                  <Select id="file-invoice" name="invoice" required disabled={pending}>
                    <option value="">Choose an issued invoice</option>
                    {invoices
                      .filter((i) => i.status === 'issued' && i.agreement_id === active?.id)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.title}
                        </option>
                      ))}
                  </Select>
                  <p className="mt-2 text-xs text-ash">
                    The full invoice must be covered by recorded receipts. Manual receipts remain
                    separate from Tatum-verified payments.
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="release-quote" className="mb-2 block text-xs text-ash">
                  Exact release clause from the approved agreement
                </label>
                <textarea
                  id="release-quote"
                  name="quote"
                  rows={3}
                  maxLength={1000}
                  required
                  disabled={pending}
                />
              </div>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-ash">
                <input
                  type="checkbox"
                  required
                  disabled={pending}
                  className="mt-1 size-4 shrink-0 accent-ice"
                />
                These conditions match our approved terms. This upload does not change them.
              </label>
            </>
          )}
          <button
            className={control.smallPrimary}
            disabled={pending || preview || (kind === 'final' && !active)}
          >
            {pending ? (
              <>
                <LoaderCircle size={14} className="motion-safe:animate-spin" />
                Uploading and checking…
              </>
            ) : kind === 'final' ? (
              'Upload locked final'
            ) : (
              'Upload file'
            )}
          </button>
          {preview && (
            <p className="text-xs text-ash">Uploads are disabled in this fictional preview.</p>
          )}
        </form>
      )}
      <Feedback state={feedback} />
      {milestones.length > 0 && (
        <div className="mb-5 max-w-xs">
          <label htmlFor="file-filter" className="mb-2 block text-xs text-ash">
            Show
          </label>
          <Select id="file-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All files</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="space-y-3">
        {all
          .filter((f) => !filter || f.milestone_id === filter)
          .map((f) => (
            <article key={f.id} className="rounded-xl border border-white/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium wrap-anywhere">{f.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ash">
                    {f.kind === 'attachment'
                      ? 'Attachment'
                      : f.kind === 'preview'
                        ? 'Milestone preview'
                        : 'Final deliverable'}{' '}
                    · {(f.size_bytes / 1024 / 1024).toFixed(2)} MB
                    {f.milestone_id &&
                      ` · ${milestones.find((m) => m.id === f.milestone_id)?.title || 'Milestone'}`}
                  </p>
                  <p className="mt-2 text-xs text-ash">
                    {f.status === 'removed'
                      ? f.object_deleted_at
                        ? 'Removed'
                        : 'Removed · storage cleanup pending'
                      : f.status === 'pending'
                        ? 'Upload not yet verified'
                        : f.kind === 'final'
                          ? f.released_at
                            ? 'Released · current conditions apply'
                            : 'Locked · awaiting release'
                          : 'Shared with project members'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!preview &&
                    f.status === 'ready' &&
                    (f.kind !== 'final' || isFreelancer || f.released_at) && (
                      <a
                        href={`/api/files/${f.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={control.smallSecondary}
                      >
                        <Download size={14} />
                        Download<span className="sr-only"> {f.name} (opens a new tab)</span>
                      </a>
                    )}
                  {isFreelancer && f.status === 'ready' && f.kind === 'final' && !f.released_at && (
                    <button
                      className={control.smallSecondary}
                      disabled={pending || preview}
                      onClick={() => {
                        setDialog({ kind: 'release', file: f });
                        setConfirmed(false);
                      }}
                    >
                      Release final
                    </button>
                  )}
                  {f.uploaded_by === userId && f.status === 'pending' && (
                    <button
                      className={control.smallSecondary}
                      disabled={pending || preview}
                      onClick={() => void run(() => finishFile(f.id), f.id)}
                    >
                      Retry verification
                    </button>
                  )}
                  {f.uploaded_by === userId && (f.status !== 'removed' || !f.object_deleted_at) && (
                    <button
                      className={control.smallSecondary}
                      disabled={pending || preview}
                      onClick={() => {
                        setDialog({ kind: 'remove', file: f });
                        setConfirmed(false);
                      }}
                    >
                      {f.status === 'removed' ? 'Retry cleanup' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
              {f.kind === 'final' && (
                <details className="mt-4 text-xs leading-relaxed text-ash">
                  <summary className="min-h-8 cursor-pointer text-ice">Release terms</summary>
                  <blockquote className="mt-2 border-l border-white/15 pl-3 whitespace-pre-wrap wrap-anywhere">
                    {f.terms_quote}
                  </blockquote>
                  <p className="mt-3">
                    Client-accepted milestone
                    {f.release_rule === 'invoice_paid'
                      ? ` and full recorded payment of ${invoices.find((i) => i.id === f.invoice_id)?.title || 'the linked invoice'}`
                      : ''}
                    . Freelancer release is required. A changed agreement, reversed receipt or
                    withdrawn file blocks new client downloads.
                  </p>
                </details>
              )}
            </article>
          ))}
        {!all.some((f) => !filter || f.milestone_id === filter) && (
          <p className="rounded-xl border border-white/10 px-6 py-12 text-center text-sm text-ash">
            {filter
              ? 'No files for this milestone yet.'
              : 'No files yet. Upload an attachment or milestone deliverable.'}
          </p>
        )}
      </div>
      {(more || (initialHasMore && older.length === 0)) && (
        <button
          className={`${control.smallSecondary} mt-5`}
          disabled={pending || preview}
          onClick={async () => {
            const cursor = all.at(-1);
            if (!cursor) return;
            await run(async () => {
              const page = await readFilePage(projectId, {
                created_at: cursor.created_at,
                id: cursor.id,
              });
              if (page.error) return { error: page.error };
              setOlder((previous) => [...previous, ...(page.files || [])]);
              setMore(Boolean(page.hasMore));
              return {};
            });
          }}
        >
          Load older files
        </button>
      )}
      {dialog && (
        <Dialog
          title={dialog.kind === 'release' ? 'Release final deliverable?' : 'Remove file?'}
          onClose={() => {
            if (!pending) setDialog(null);
          }}
        >
          <p className="text-sm wrap-anywhere">{dialog.file.name}</p>
          <p className="mt-4 text-sm leading-relaxed text-ash">
            {dialog.kind === 'release'
              ? 'This gives your client access only when the approved release conditions are met. It does not accept a milestone, change the agreement or authorize payment.'
              : 'This removes access and requests permanent removal from private storage. Download links already issued may remain valid for up to 60 seconds.'}
          </p>
          {dialog.kind === 'release' && (
            <>
              <blockquote className="mt-4 border-l border-white/15 pl-3 text-xs leading-relaxed text-ash whitespace-pre-wrap wrap-anywhere">
                {dialog.file.terms_quote}
              </blockquote>
              <label className="mt-5 flex items-start gap-3 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-ice"
                />
                I confirm release follows our approved agreement.
              </label>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={control.smallPrimary}
              disabled={pending || (dialog.kind === 'release' && !confirmed)}
              onClick={async () => {
                const result = await run(
                  () =>
                    dialog.kind === 'release'
                      ? releaseFile(dialog.file.id, confirmed)
                      : removeFile(dialog.file.id),
                  dialog.file.id,
                );
                if (!result.error) setDialog(null);
              }}
            >
              {pending ? 'Saving…' : dialog.kind === 'release' ? 'Release final' : 'Remove file'}
            </button>
            <button
              className={control.smallSecondary}
              disabled={pending}
              onClick={() => setDialog(null)}
            >
              Cancel
            </button>
          </div>
          <Feedback state={feedback} />
        </Dialog>
      )}
    </>
  );
}
