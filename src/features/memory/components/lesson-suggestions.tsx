'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveSuggestedLesson } from '@/features/memory/server/memory-actions';
import type { MemorySuggestion } from '@/features/memory/domain';
import { Select } from '@/components/ui/select';
import { control } from '@/components/ui/control-styles';

export function LessonSuggestions({
  projectId,
  suggestions,
}: {
  projectId: string;
  suggestions: MemorySuggestion[];
}) {
  if (!suggestions.length) return null;
  return (
    <section aria-label="Suggested lessons" className="mb-8 space-y-3">
      <h3 className="text-sm font-medium text-paper">Suggested for you</h3>
      <p className="text-xs text-ash">Only confirmed lessons are remembered.</p>
      {suggestions.map((suggestion) => (
        <LessonSuggestion key={suggestion.id} projectId={projectId} suggestion={suggestion} />
      ))}
    </section>
  );
}
function LessonSuggestion({
  projectId,
  suggestion,
}: {
  projectId: string;
  suggestion: MemorySuggestion;
}) {
  const [editing, setEditing] = useState(false);
  const [lesson, setLesson] = useState(suggestion.lesson);
  const [scope, setScope] = useState<'project' | 'personal'>('project');
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  function resolve(action: 'confirm' | 'dismiss') {
    setError('');
    start(async () => {
      try {
        const result = await resolveSuggestedLesson(
          projectId,
          suggestion.id,
          action,
          action === 'confirm' ? lesson : undefined,
          scope,
        );
        if (result.error) setError(result.error);
        else {
          setResolved(true);
          router.refresh();
        }
      } catch {
        setError('The suggestion could not be updated. Please retry.');
      }
    });
  }
  if (resolved) return null;
  return (
    <article className="rounded-xl border border-ice/15 bg-ice/[.03] p-5">
      <p className="mb-3 text-[11px] text-ash">
        {suggestion.kind === 'possible_change'
          ? 'A scope review flagged extra work.'
          : 'A scope review found a request that needs clarification.'}
      </p>
      {editing ? (
        <>
          <label htmlFor={`suggested-${suggestion.id}`} className="mb-2 block text-xs text-paper">
            Edit lesson
          </label>
          <textarea
            id={`suggested-${suggestion.id}`}
            value={lesson}
            onChange={(event) => setLesson(event.target.value)}
            rows={3}
            minLength={10}
            maxLength={600}
            disabled={pending}
          />
          <label
            htmlFor={`suggested-scope-${suggestion.id}`}
            className="mt-4 mb-2 block text-xs text-paper"
          >
            Where should it apply?
          </label>
          <Select
            id={`suggested-scope-${suggestion.id}`}
            value={scope}
            disabled={pending}
            onChange={(event) =>
              setScope(event.target.value === 'personal' ? 'personal' : 'project')
            }
          >
            <option value="project">Only this project · private to me</option>
            <option value="personal">My general preference · across my projects</option>
          </Select>
          {scope === 'personal' && (
            <p className="mt-2 text-xs text-ash">
              Use this only for your own general preference. Remove project-specific wording.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm leading-relaxed text-paper/90">{lesson}</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ash">
        Confirming saves this lesson to Walrus Memory. It never changes your agreement or payments.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          className={control.smallPrimary}
          disabled={pending || lesson.trim().length < 10}
          onClick={() => resolve('confirm')}
        >
          {pending ? 'Saving…' : 'Confirm & remember'}
        </button>
        <button
          className="min-h-11 text-xs text-ice hover:text-paper"
          disabled={pending}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done editing' : 'Edit'}
        </button>
        <button
          className="min-h-11 text-xs text-ash hover:text-paper"
          disabled={pending}
          onClick={() => resolve('dismiss')}
        >
          Dismiss
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
