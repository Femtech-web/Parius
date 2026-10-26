'use client';
import { Select } from '@/components/select';
import { useEffect, useRef, useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowUpRight, LoaderCircle } from 'lucide-react';
import {
  confirmLesson,
  processMemory,
  suppressLesson,
  requestLessonDeletion,
  readMemoryPage,
} from '@/app/memory-actions';
import type { MemoryReference, MemorySuggestion } from '@/lib/memory';
import { LessonSuggestions } from './lesson-suggestions';
import type { ActionResult } from '@/app/actions';
import { MemoryMark } from './memory-mark';
import { Feedback } from './workspace-forms';
import { control } from './control-styles';
import { Dialog } from './dialog';
const labels = {
  pending: 'Confirmed · awaiting storage',
  indexing: 'Walrus is indexing',
  ready: 'Stored on Walrus',
  failed: 'Needs attention',
  suppressed: 'Excluded from suggestions',
};
export function MemoryPanel({
  projectId,
  memories,
  isFreelancer,
  preview,
  ready,
  suggestions = [],
  suggestionsReady = true,
}: {
  projectId: string;
  memories: MemoryReference[];
  isFreelancer: boolean;
  preview: boolean;
  ready: boolean;
  suggestions?: MemorySuggestion[];
  suggestionsReady?: boolean;
}) {
  const [lesson, setLesson] = useState(''),
    [scope, setScope] = useState<'personal' | 'project'>('project');
  const [correcting, setCorrecting] = useState<MemoryReference | null>(null),
    [removing, setRemoving] = useState<MemoryReference | null>(null);
  const [deleting, setDeleting] = useState<MemoryReference | null>(null),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('active');
  const [showEditor, setShowEditor] = useState(false);
  const [older, setOlder] = useState<MemoryReference[]>([]),
    [hasMore, setHasMore] = useState(memories.length >= 100),
    [loadingMore, setLoadingMore] = useState(false);
  const allMemories = useMemo(
    () =>
      Array.from(
        new Map([...older, ...memories].map((memory) => [memory.id, memory])).values(),
      ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)),
    [older, memories],
  );
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (showEditor) editor.current?.focus();
  }, [showEditor, correcting]);
  const [feedback, setFeedback] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const key = useRef<string | null>(null);
  useEffect(() => {
    if (preview || !ready || !isFreelancer) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [preview, ready, isFreelancer, router]);
  const run = (work: () => Promise<ActionResult & { memory?: MemoryReference }>) =>
    startTransition(async () => {
      setFeedback({});
      try {
        const result = await work();
        setFeedback(result);
        if (result.memory)
          setOlder((items) =>
            items.map((item) => (item.id === result.memory!.id ? result.memory! : item)),
          );
        router.refresh();
      } catch {
        setFeedback({ error: 'The memory update could not be confirmed. Please retry.' });
      }
    });
  const visible = allMemories.filter(
    (memory) =>
      memory.lesson.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'active'
          ? memory.status !== 'suppressed'
          : filter === 'removed'
            ? memory.status === 'suppressed'
            : memory.scope === filter)),
  );
  if (!isFreelancer)
    return (
      <div className="rounded-2xl bg-slate px-6 py-14 text-center">
        <MemoryMark className="mx-auto mb-5 text-ice" size={28} />
        <h2 className="text-2xl tracking-tight">Your shared decisions stay in the agreement.</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ash">
          The freelancer’s personal lessons are private. Approved scope, messages and project
          activity remain available to both of you.
        </p>
      </div>
    );
  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-normal tracking-[-.04em]">Memory</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ash">
          Confirm what Parius should learn. Relevant lessons are recalled from Walrus Memory when
          you review scope, including after a new session.
        </p>
      </div>
      {!preview && suggestionsReady && (
        <LessonSuggestions projectId={projectId} suggestions={suggestions} />
      )}
      {!preview && !suggestionsReady && (
        <p className="mb-6 text-xs text-ash">Suggested lessons are temporarily unavailable.</p>
      )}
      <button
        className={`${control.smallSecondary} mb-6`}
        onClick={() => setShowEditor(!showEditor)}
        aria-expanded={showEditor}
        aria-controls="memory-editor"
      >
        {showEditor ? 'Close lesson editor' : 'Add a lesson manually'}
      </button>
      {(!ready || preview) && (
        <p className="mb-6 rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-ash">
          {preview
            ? 'Preview only. Save real lessons in your own project.'
            : 'Memory is being connected. Your project remains available.'}
        </p>
      )}
      {showEditor && (
        <form
          id="memory-editor"
          className="mb-9 rounded-2xl bg-slate p-5 md:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            if (!key.current) key.current = crypto.randomUUID();
            run(async () => {
              const result = await confirmLesson(
                projectId,
                lesson,
                scope,
                key.current!,
                correcting?.id || null,
              );
              if (result.id) {
                if (correcting)
                  setOlder((current) =>
                    current.map((row) =>
                      row.id === correcting.id ? { ...row, status: 'suppressed' } : row,
                    ),
                  );
                setLesson('');
                setCorrecting(null);
                setShowEditor(false);
                key.current = null;
              }
              if (result.id) {
                const storage = await processMemory(projectId, result.id);
                return storage.error
                  ? { success: 'Lesson confirmed. Storage will retry in the background.' }
                  : storage;
              }
              return result;
            });
          }}
        >
          <h3 className="mb-5 text-lg tracking-tight">
            {correcting ? 'Correct a lesson' : 'What should Parius remember?'}
          </h3>
          <label htmlFor="memory-lesson" className="mb-3 block text-xs text-paper">
            A preference or lesson you have confirmed
          </label>
          <textarea
            ref={editor}
            id="memory-lesson"
            value={lesson}
            onChange={(e) => {
              setLesson(e.target.value);
              key.current = null;
            }}
            rows={3}
            minLength={10}
            maxLength={600}
            required
            placeholder="For example: keep follow-up messages concise and offer a clear next step."
          />
          <label htmlFor="memory-scope" className="mt-5 mb-3 block text-xs text-paper">
            Where should it apply?
          </label>
          <Select
            id="memory-scope"
            disabled={Boolean(correcting)}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as 'personal' | 'project');
              key.current = null;
            }}
          >
            <option value="project">Only this project · private to me</option>
            <option value="personal">My general preference · across my projects</option>
          </Select>
          <p className="mt-4 max-w-xl text-xs leading-relaxed text-ash">
            Confirmation sends this text to Walrus Memory for encrypted, persistent storage. Keep
            credentials, payment details and sensitive client information out. A learned preference
            never changes an agreement or authorizes a payment.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ash">
            Keep client-specific preferences in this project. Use “Across my projects” for your own
            general working preferences.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className={control.primary} disabled={pending || preview || !ready}>
              {pending ? (
                <LoaderCircle size={15} className="motion-safe:animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Confirm & remember
            </button>
            {correcting && (
              <button
                type="button"
                className={control.secondary}
                onClick={() => {
                  setCorrecting(null);
                  setShowEditor(false);
                  setLesson('');
                  key.current = null;
                }}
              >
                Cancel correction
              </button>
            )}
          </div>
        </form>
      )}
      <Feedback state={feedback} />
      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="memory-search" className="mb-2 block text-xs text-ash">
            Search your confirmed lessons
          </label>
          <input
            id="memory-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a preference or decision…"
          />
        </div>
        <div>
          <label htmlFor="memory-filter" className="mb-2 block text-xs text-ash">
            Show
          </label>
          <Select
            id="memory-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="active">Active lessons</option>
            <option value="project">This project</option>
            <option value="personal">Across my projects</option>
            <option value="removed">Excluded / deletion requested</option>
            <option value="all">All loaded lessons</option>
          </Select>
        </div>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ash">
        Showing {visible.length} of {allMemories.length} loaded lessons. Personal memories remain
        private to you; project lessons stay within their project context.
      </p>
      <div className="space-y-4">
        {visible.length ? (
          visible.map((memory) => (
            <article key={memory.id} className="rounded-2xl border border-white/8 p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <span className={memory.status === 'ready' ? 'text-ice' : 'text-ash'}>
                  {memory.deletion_requested_at
                    ? 'Deletion requested · Walrus removal pending'
                    : labels[memory.status]}
                </span>
                <span className="text-ash">
                  {memory.scope === 'personal' ? 'Across my projects' : 'This project only'}
                </span>
              </div>
              <p
                className={`mt-4 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere ${memory.status === 'suppressed' ? 'text-ash' : 'text-paper/90'}`}
              >
                {memory.lesson}
              </p>
              {memory.blob_id && (
                <details className="mt-4 text-xs">
                  <summary className="min-h-8 cursor-pointer text-ice">Storage evidence</summary>
                  <p className="mt-2 break-all text-ash">Walrus blob: {memory.blob_id}</p>
                  <p className="mt-2 break-all text-ash">Job: {memory.job_id}</p>
                </details>
              )}
              {memory.status !== 'suppressed' && (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
                  <button
                    className="min-h-11 text-xs text-ice hover:text-paper"
                    disabled={pending || preview}
                    onClick={() => {
                      setCorrecting(memory);
                      setShowEditor(true);
                      setLesson(memory.lesson);
                      setScope(memory.scope);
                      key.current = null;
                    }}
                  >
                    Correct lesson
                    <ArrowUpRight className="ml-2 inline" size={12} />
                  </button>
                  <button
                    className="min-h-11 text-xs text-ash hover:text-paper"
                    disabled={pending || preview}
                    onClick={() => setRemoving(memory)}
                  >
                    Exclude from suggestions
                  </button>
                  {['pending', 'indexing', 'failed'].includes(memory.status) && (
                    <button
                      className="min-h-11 text-xs text-ice"
                      disabled={pending || preview}
                      onClick={() => run(() => processMemory(projectId, memory.id))}
                    >
                      {memory.status === 'failed' ? 'Retry storage' : 'Check storage'}
                    </button>
                  )}
                </div>
              )}
              {!memory.deletion_requested_at && (
                <button
                  className="mt-3 min-h-11 text-xs text-ash hover:text-paper"
                  disabled={pending || preview || !ready}
                  onClick={() => setDeleting(memory)}
                >
                  Request permanent deletion
                </button>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center text-sm leading-relaxed text-ash">
            {allMemories.length
              ? 'No lessons match this view.'
              : 'No confirmed lessons yet. Start with one useful preference.'}
          </div>
        )}
      </div>
      {(hasMore || (memories.length >= 100 && older.length === 0)) && !preview && (
        <button
          className={`${control.smallSecondary} mt-6`}
          disabled={loadingMore || pending || !ready}
          onClick={async () => {
            setLoadingMore(true);
            try {
              const last = allMemories.at(-1);
              const page = await readMemoryPage(
                projectId,
                last ? { created_at: last.created_at, id: last.id } : undefined,
              );
              if (page.error) setFeedback({ error: page.error });
              else {
                setOlder([...allMemories, ...(page.memories || [])]);
                setHasMore(Boolean(page.hasMore));
              }
            } catch {
              setFeedback({ error: 'Older lessons could not be loaded. Please retry.' });
            } finally {
              setLoadingMore(false);
            }
          }}
        >
          {loadingMore ? 'Loading older lessons…' : 'Load older lessons'}
        </button>
      )}
      {removing && (
        <Dialog title="Exclude this lesson?" onClose={() => setRemoving(null)}>
          <p>
            The lesson will immediately stop informing future suggestions. This does not guarantee
            deletion of existing encrypted Walrus blobs.
          </p>
          <footer>
            <button className={control.secondary} onClick={() => setRemoving(null)}>
              Keep lesson
            </button>
            <button
              className={control.primary}
              disabled={pending || preview}
              onClick={() =>
                run(async () => {
                  const result = await suppressLesson(projectId, removing.id);
                  if (!result.error) {
                    setOlder((current) =>
                      current.map((row) =>
                        row.id === removing.id ? { ...row, status: 'suppressed' } : row,
                      ),
                    );
                    setRemoving(null);
                  }
                  return result;
                })
              }
            >
              Exclude lesson
            </button>
          </footer>
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Request deletion of this lesson?" onClose={() => setDeleting(null)}>
          <blockquote className="mb-5 rounded-xl bg-night p-4 text-sm leading-relaxed text-paper/90">
            {deleting.lesson}
          </blockquote>
          <p>
            The lesson will immediately stop informing suggestions. Its text and associated private
            reviews will be removed from Parius. Agreements, messages and payments stay intact.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-ash">
            Permanent Walrus deletion requires the storage account owner’s signature. This saves a
            pending deletion request with its storage references; it does not claim that the remote
            blob has been erased.
          </p>
          <footer>
            <button
              className={control.secondary}
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Keep lesson
            </button>
            <button
              className={control.primary}
              disabled={pending || preview || !ready}
              onClick={() =>
                run(async () => {
                  const result = await requestLessonDeletion(projectId, deleting.id);
                  if (!result.error) {
                    setOlder((current) =>
                      current.map((row) =>
                        row.id === deleting.id
                          ? {
                              ...row,
                              status: 'suppressed',
                              lesson: 'Removal requested by you.',
                              deletion_requested_at: new Date().toISOString(),
                            }
                          : row,
                      ),
                    );
                    setDeleting(null);
                    setFilter('removed');
                    setSearch('');
                  }
                  return result;
                })
              }
            >
              Exclude & request deletion
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
