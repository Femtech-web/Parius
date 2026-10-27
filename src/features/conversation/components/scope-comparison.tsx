'use client';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { compareScopeMemory } from '@/features/conversation/server/comparison-actions';
import type { ScopeComparison, MemoryInfluence } from '@/features/conversation/scope-review';
import { control } from '@/components/ui/control-styles';
export function MemoryInfluences({ influences }: { influences: MemoryInfluence[] }) {
  return (
    <ul className="space-y-4">
      {influences.map((influence) => (
        <li key={influence.memory_id} className="border-l border-ice/30 pl-3">
          <blockquote className="text-paper/90">“{influence.quote}”</blockquote>
          <p className="mt-1 text-ash">{influence.reason}</p>
        </li>
      ))}
    </ul>
  );
}
export function ScopeComparisonView({
  assessmentId,
  agreementVersion,
  onTeach,
}: {
  assessmentId: string;
  agreementVersion: number;
  onTeach?: () => void;
}) {
  const [comparison, setComparison] = useState<ScopeComparison>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [retryIn, setRetryIn] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const retryUntil = useRef(0);
  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(
      () => setRetryIn(Math.max(0, Math.ceil((retryUntil.current - Date.now()) / 1000))),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retryIn]);
  const completed =
    comparison?.status === 'completed' && comparison.without_memory && comparison.with_memory;
  return (
    <div className="mt-5 border-t border-white/10 pt-5 text-xs" aria-busy={pending}>
      <h4 className="text-sm tracking-tight text-paper">With memory. Without memory.</h4>
      <p className="mt-2 leading-relaxed text-ash">
        Two fresh reviews of agreement v{agreementVersion} and this same request. Only recalled
        lessons differ.
      </p>
      {!completed && (
        <button
          className={`${control.smallSecondary} mt-4`}
          disabled={pending || retryIn > 0}
          onClick={async () => {
            setPending(true);
            setError('');
            setComparison(undefined);
            setAttempted(true);
            try {
              const result = await compareScopeMemory(assessmentId);
              if (result.retryAfterSeconds) {
                retryUntil.current = Date.now() + result.retryAfterSeconds * 1000;
                setRetryIn(result.retryAfterSeconds);
              }
              if (result.error && result.error !== 'Wait a minute before another comparison.')
                setError(result.error);
              if (result.comparison) setComparison(result.comparison);
            } catch {
              setError('The comparison could not be confirmed. Please retry.');
            } finally {
              setPending(false);
            }
          }}
        >
          {pending && <LoaderCircle size={13} className="motion-safe:animate-spin" />}
          {pending
            ? 'Running both reviews…'
            : retryIn > 0
              ? `Retry in ${retryIn}s`
              : attempted
                ? 'Retry comparison'
                : 'Compare suggestions'}
        </button>
      )}
      {comparison?.status === 'no_matches' && (
        <p className="mt-4 leading-relaxed text-ash">
          No relevant confirmed lessons were recalled. There is no memory-backed comparison to show
          yet.
          {onTeach && (
            <button className="ml-1 min-h-11 text-ice" onClick={onTeach}>
              Review your memories
            </button>
          )}
        </p>
      )}
      {comparison?.status === 'unavailable' && (
        <p role="status" className="mt-4 leading-relaxed text-ash">
          Walrus is temporarily unavailable. Your stored lessons are unchanged.
        </p>
      )}
      {completed && (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(
              [
                { label: 'Without historical memory', result: comparison.without_memory },
                { label: 'With Walrus Memory', result: comparison.with_memory },
              ] as const
            ).map(({ label, result }) => (
              <section
                key={label}
                className="min-w-0 rounded-xl border border-white/10 bg-night/40 p-4"
              >
                <h5 className="text-xs text-ice">{label}</h5>
                <p className="mt-3 font-medium text-paper">{result!.title}</p>
                <p className="mt-2 leading-relaxed text-ash">{result!.explanation}</p>
                <p className="mt-4 border-t border-white/10 pt-4 leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper/90">
                  {result!.suggested_reply}
                </p>
              </section>
            ))}
          </div>
          <p className="mt-4 leading-relaxed text-ash">
            Walrus retrieved {comparison.recalled_memory_ids.length} confirmed lesson
            {comparison.recalled_memory_ids.length === 1 ? '' : 's'}. The memory-enabled review
            cited {comparison.memory_influences.length}. Similar results are valid; model variation
            can also affect wording. Neither review changes your agreement or sends a reply.
          </p>
          {comparison.memory_influences.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-8 cursor-pointer text-ice">
                Lessons cited by the memory-enabled review
              </summary>
              <div className="mt-3 leading-relaxed">
                <MemoryInfluences influences={comparison.memory_influences} />
              </div>
            </details>
          )}
          <details className="mt-4">
            <summary className="min-h-8 cursor-pointer text-ice">
              How this comparison was run
            </summary>
            <p className="mt-2 leading-relaxed text-ash">
              Same saved agreement and request, system prompt, model, temperature, output schema and
              token limit. Two independent calls; historical lessons are the only changed input.
              Both outputs passed source-quote checks. This demonstrates differences, not a
              guarantee that memory improved the answer.
            </p>
            <p className="mt-2 text-ash">
              {comparison.model} · {comparison.prompt_version}
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-ash">
              Shared context SHA-256: {comparison.context_hash}
            </p>
          </details>
        </>
      )}
      {pending && (
        <p role="status" className="mt-3 text-ash">
          You can keep working while the two private reviews run.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 leading-relaxed text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
