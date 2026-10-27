'use client';
import { ArrowRight, Check, Circle, FileText, Plus } from 'lucide-react';
import { AgreementComparison } from '@/features/agreements/components/agreement-comparison';
import { agreementState, agreementStateLabel } from '@/features/agreements/domain';
import {
  displayAmount,
  type Agreement,
  type Project,
  type Approval,
  type AgreementResolution,
} from '@/lib/domain';
import { formatProjectDate as date } from '@/lib/project-date';
import { control } from '@/components/ui/control-styles';
import { Feedback } from '@/components/ui/feedback';
import { ProposalForm } from '@/features/agreements/components/proposal-form';
import type { ActionResult } from '@/lib/action-result';
export function AgreementTab({
  project,
  agreements,
  approvals,
  resolutions,
  active,
  isFreelancer,
  userId,
  pending,
  preview,
  proposal,
  feedback,
  onToggleProposal,
  onCloseProposal,
  onPublished,
  onApprove,
  onResolve,
}: {
  project: Project;
  agreements: Agreement[];
  approvals: Approval[];
  resolutions: AgreementResolution[];
  active?: Agreement;
  isFreelancer: boolean;
  userId: string;
  pending: boolean;
  preview: boolean;
  proposal: boolean;
  feedback: ActionResult;
  onToggleProposal: () => void;
  onCloseProposal: () => void;
  onPublished: (result: ActionResult) => void;
  onApprove: (agreement: Agreement) => void;
  onResolve: (agreement: Agreement) => void;
}) {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
        <div>
          <h2>Agreement</h2>
          <p>Current terms and previous versions.</p>
        </div>
        {isFreelancer && (
          <button className={control.smallSecondary} onClick={() => onToggleProposal()}>
            <Plus size={14} />
            {active ? 'Propose changes' : 'Propose terms'}
          </button>
        )}
      </div>
      {proposal && (
        <ProposalForm
          projectId={project.id}
          base={active}
          preview={preview}
          onClose={() => onCloseProposal()}
          onPublished={onPublished}
        />
      )}
      <Feedback state={feedback} />
      {!agreements.length ? (
        <div className="rounded-2xl bg-slate px-6 py-16 text-center [&>svg]:mx-auto [&>svg]:mb-7 [&>svg]:text-ice [&_h3]:text-2xl [&_h3]:font-normal [&_h3]:tracking-tight [&_p]:mx-auto [&_p]:mt-5 [&_p]:max-w-lg [&_p]:text-sm [&_p]:text-ash">
          <FileText size={28} />
          <h3>No agreement yet</h3>
          <p>
            {isFreelancer
              ? 'Publish a proposal with the scope, price and revision limit. You and your client will each approve the same version.'
              : 'Your freelancer will propose the project terms here for you to review.'}
          </p>
        </div>
      ) : (
        agreements.map((a) => {
          const approved = approvals.filter((p) => p.agreement_id === a.id);
          const isActive = a.id === project.active_agreement_id;
          const resolution = resolutions.find((r) => r.agreement_id === a.id);
          const status = agreementState(a, project.active_agreement_id, approvals, resolution);
          const canClose = status === 'pending' || status === 'stale';
          return (
            <article
              className="mb-6 rounded-2xl bg-slate p-6 md:p-8 [&_header]:mb-7 [&_header]:flex [&_header]:flex-wrap [&_header]:items-center [&_header]:justify-between [&_header]:gap-4 [&_h3]:text-2xl [&_h3]:font-normal [&_h3]:tracking-tight"
              key={a.id}
            >
              <header>
                <div>
                  <span className="block text-[11px] font-medium tracking-[.08em] text-ash mb-2">
                    VERSION {a.version}
                  </span>
                  <h3>{a.title}</h3>
                </div>
                <span
                  className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] leading-relaxed text-ash ${isActive ? 'bg-ice/10! text-ice!' : status !== 'pending' ? '' : 'bg-warning-soft! text-warning!'}`}
                >
                  {agreementStateLabel[status]}
                </span>
              </header>
              <AgreementComparison
                base={agreements.find((base) => base.id === a.base_version_id)}
                next={a}
              />
              {resolution && (
                <p className="mb-6 rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-ash">
                  {resolution.kind === 'rejected'
                    ? 'Client rejected this proposal'
                    : 'Freelancer withdrew this proposal'}{' '}
                  on {date(resolution.created_at)}.
                  {resolution.reason && (
                    <span className="mt-2 block whitespace-pre-wrap wrap-anywhere text-paper/85">
                      {resolution.reason}
                    </span>
                  )}
                </p>
              )}
              {status === 'stale' && (
                <p className="mb-5 text-xs leading-relaxed text-ash">
                  The active terms changed after this proposal was written. A new proposal is needed
                  before approval.
                </p>
              )}
              <p className="max-w-prose text-sm leading-loose whitespace-pre-wrap wrap-anywhere text-paper/85">
                {a.scope}
              </p>
              <div className="my-7 flex flex-wrap gap-x-10 gap-y-5 border-y border-white/10 py-6 [&_small]:mb-2 [&_small]:block [&_small]:text-xs [&_small]:text-ash [&_strong]:text-base [&_strong]:font-medium [&_strong]:tabular-nums">
                <div>
                  <small>
                    {isActive || status === 'previous' ? 'Agreed total' : 'Proposed total'}
                  </small>
                  <strong>{displayAmount(a.amount_atomic, a.currency, a.decimals)}</strong>
                </div>
                <div>
                  <small>Revisions</small>
                  <strong>{a.revision_limit} rounds</strong>
                </div>
                <div>
                  <small>Proposed</small>
                  <strong>{date(a.created_at)}</strong>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-5 [&>button]:ml-auto">
                {(['freelancer', 'client'] as const).map((role) => (
                  <span
                    key={role}
                    className={`flex items-center gap-2 text-xs text-ash ${approved.some((p) => p.role === role) ? 'text-ice!' : ''}`}
                  >
                    {approved.some((p) => p.role === role) ? (
                      <Check size={13} />
                    ) : (
                      <Circle size={11} />
                    )}
                    {role === 'freelancer' ? 'Freelancer' : 'Client'}
                    {approved.some((p) => p.role === role)
                      ? ' approved'
                      : canClose
                        ? ' · pending'
                        : ' · not approved'}
                  </span>
                ))}
                {status === 'pending' && !approved.some((p) => p.actor_id === userId) && (
                  <button
                    disabled={pending}
                    className={control.smallPrimary}
                    onClick={() => onApprove(a)}
                  >
                    Review & approve
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              {canClose && (
                <button
                  className="mt-5 min-h-11 text-xs text-ash underline decoration-white/20 underline-offset-4 transition-colors hover:text-paper"
                  disabled={pending}
                  onClick={() => onResolve(a)}
                >
                  {isFreelancer ? 'Withdraw proposal' : 'Reject proposal'}
                </button>
              )}
            </article>
          );
        })
      )}
    </>
  );
}
