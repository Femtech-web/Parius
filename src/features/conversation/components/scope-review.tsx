'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, ScanText, ArrowUpRight } from 'lucide-react';
import { analyzeMessageScope } from '@/features/conversation/server/scope-actions';
import type { Agreement } from '@/lib/domain';
import { type ScopeAssessment } from '@/features/conversation/scope-review';
import {
  MemoryInfluences,
  ScopeComparisonView,
} from '@/features/conversation/components/scope-comparison';
const labels = {
  within_scope: 'Within scope',
  possible_change: 'Possible change',
  needs_clarification: 'Needs clarification',
};
export function ScopeReview({
  projectId,
  messageId,
  agreement,
  initial,
  ready,
  onDraft,
  onTeach,
}: {
  projectId: string;
  messageId: string;
  agreement: Agreement;
  initial?: ScopeAssessment;
  ready: boolean;
  onDraft: (draft: string) => void;
  onTeach?: () => void;
}) {
  const [saved, setSaved] = useState<ScopeAssessment>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const assessment = saved || initial;
  const router = useRouter();
  const result = assessment?.status === 'completed' ? assessment.result : null;
  const requestReview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await analyzeMessageScope(projectId, messageId, agreement.id);
      if (response.error) setError(response.error);
      else if (response.assessment) {
        setSaved(response.assessment);
        router.refresh();
      }
    } catch {
      setError('Scope review is unavailable. Please retry.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="mt-1 mb-6 max-w-xl sm:ml-11">
      {!result ? (
        <>
          <button
            title="Privately review this message and the active agreement with Groq"
            disabled={loading || !ready}
            className="inline-flex min-h-11 items-center gap-2 text-xs text-ice transition-colors hover:text-paper disabled:opacity-50"
            onClick={requestReview}
          >
            {loading ? (
              <LoaderCircle size={14} className="motion-safe:animate-spin" />
            ) : (
              <ScanText size={14} />
            )}{' '}
            {loading ? 'Reviewing the agreed scope…' : 'Review scope'}
          </button>
          {!ready && (
            <p className="text-[11px] leading-relaxed text-ash">
              Scope review is temporarily unavailable. You can keep messaging.
            </p>
          )}
          {loading && (
            <p className="text-[11px] text-ash" role="status">
              You can keep messaging while the review runs.
            </p>
          )}
        </>
      ) : (
        <details className="border-l border-white/15 pl-4">
          <summary className="min-h-11 cursor-pointer py-3 text-xs text-ice">
            Scope check · {labels[result.classification]}
          </summary>
          <p className="text-[11px] text-ash">Private to you · Agreement v{agreement.version}</p>
          <p className="mt-3 text-xs leading-relaxed text-ash">{result.explanation}</p>
          <details className="mt-4 text-xs">
            <summary className="min-h-8 cursor-pointer text-ice">
              Why did Parius suggest this?
            </summary>
            <dl className="mt-3 space-y-3 leading-relaxed text-ash">
              <div>
                <dt className="mb-1 text-paper">Agreed scope</dt>
                <dd className="whitespace-pre-wrap wrap-anywhere">“{result.agreement_quote}”</dd>
              </div>
              <div>
                <dt className="mb-1 text-paper">Request</dt>
                <dd className="whitespace-pre-wrap wrap-anywhere">“{result.message_quote}”</dd>
              </div>
            </dl>
            <div className="mt-4 leading-relaxed">
              <p className="mb-3 text-paper">Confirmed lessons cited in this review</p>
              {assessment?.memory_influences?.length ? (
                <MemoryInfluences influences={assessment.memory_influences} />
              ) : (
                <p className="text-ash">
                  No confirmed lesson was cited as an influence. The explanation above is grounded
                  in the agreement and request.
                </p>
              )}
              <p className="mt-3 text-ash">
                Agreement v{agreement.version}. Memory quotations are checked against the recalled,
                confirmed lesson; relevance explanations are the model’s advisory evidence summary.
              </p>
            </div>
          </details>
          <p className="mt-3 text-[11px] leading-relaxed text-ash">
            {assessment?.recall_status === 'recalled'
              ? `Walrus recalled ${assessment.recalled_memory_ids?.length || 0} confirmed lesson${assessment.recalled_memory_ids?.length === 1 ? '' : 's'}. This review cited ${assessment.memory_influences?.length || 0}.`
              : assessment?.recall_status === 'unavailable'
                ? 'Walrus recall was unavailable; no learned lessons informed this review.'
                : 'No matching confirmed lessons were recalled for this review.'}
          </p>
          <details className="mt-3 text-xs">
            <summary className="min-h-8 cursor-pointer text-ice">Review suggested reply</summary>
            <p className="mt-3 whitespace-pre-wrap wrap-anywhere leading-relaxed text-paper/85">
              {result.suggested_reply}
            </p>
            <button
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-ice hover:text-paper"
              onClick={() => onDraft(result.suggested_reply)}
            >
              Use reply draft
              <ArrowUpRight size={13} />
            </button>
          </details>
          <p className="mt-4 text-[10px] leading-relaxed text-ash">
            AI suggestion based on version {agreement.version}. Review it before responding. No
            terms or payments were changed.
          </p>
          {assessment?.recall_status === 'unavailable' && (
            <button
              disabled={loading}
              className="mt-3 mr-4 min-h-11 text-xs text-ice"
              onClick={requestReview}
            >
              {loading ? 'Retrying…' : 'Retry learning lookup'}
            </button>
          )}
          {onTeach && result.classification !== 'within_scope' && (
            <button className="mt-3 min-h-11 text-xs text-ice hover:text-paper" onClick={onTeach}>
              Review suggested lessons
              <ArrowUpRight className="ml-2 inline" size={12} />
            </button>
          )}
          {assessment && (
            <details className="mt-3 text-xs">
              <summary className="min-h-11 cursor-pointer py-3 text-ice">
                Compare suggestions
              </summary>
              <ScopeComparisonView
                key={assessment.id}
                assessmentId={assessment.id}
                agreementVersion={agreement.version}
                onTeach={onTeach}
              />
            </details>
          )}
        </details>
      )}
      {error && (
        <p className="mt-3 text-xs leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
