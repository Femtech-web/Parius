'use client';
import type { Dispatch, SetStateAction } from 'react';
import { Check, Flag, Plus } from 'lucide-react';
import { transitionMilestone } from '@/features/milestones/server/milestone-actions';
import { type ActionResult } from '@/lib/action-result';
import type { Milestone } from '@/lib/domain';
import { formatProjectDate as date } from '@/lib/project-date';
import { Feedback } from '@/components/ui/feedback';
import { MilestoneForm } from '@/features/milestones/components/milestone-form';
import { control } from '@/components/ui/control-styles';
const stateLabel = {
  planned: 'Planned',
  in_progress: 'In progress',
  ready_for_review: 'Ready for review',
  accepted: 'Accepted',
  changes_requested: 'Changes requested',
};
export function MilestonesTab({
  projectId,
  milestones,
  isFreelancer,
  milestoneForm,
  setMilestoneForm,
  feedback,
  pending,
  preview,
  onPreview,
  onViewFiles,
  run,
}: {
  projectId: string;
  milestones: Milestone[];
  isFreelancer: boolean;
  milestoneForm: boolean;
  setMilestoneForm: Dispatch<SetStateAction<boolean>>;
  feedback: ActionResult;
  pending: boolean;
  preview: boolean;
  onPreview: () => void;
  onViewFiles: (id: string) => void;
  run: (work: () => Promise<ActionResult>) => void;
}) {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
        <div>
          <h2>Milestones</h2>
        </div>
        {isFreelancer && (
          <button
            className={control.smallSecondary}
            onClick={() => (preview ? onPreview() : setMilestoneForm(!milestoneForm))}
          >
            <Plus size={14} />
            Add milestone
          </button>
        )}
      </div>
      {milestoneForm && <MilestoneForm projectId={projectId} />}
      <Feedback state={feedback} />
      {milestones.length ? (
        milestones.map((m, index) => (
          <article
            className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-slate p-6 [&_h3]:text-base [&_h3]:font-normal [&_p]:mt-2 [&_p]:text-xs [&_p]:text-ash"
            key={m.id}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] tabular-nums text-ash ${m.state === 'accepted' ? 'border-transparent! bg-ice/10 text-ice!' : 'border-ice/50! text-ice!'}`}
            >
              {m.state === 'accepted' ? <Check size={12} /> : index + 1}
            </span>
            <div>
              <h3>{m.title}</h3>
              <p>
                {stateLabel[m.state]}
                {m.due_date ? ` · Due ${date(m.due_date)}` : ''}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button className={control.smallSecondary} onClick={() => onViewFiles(m.id)}>
                View files
              </button>
              {isFreelancer && ['planned', 'changes_requested'].includes(m.state) && (
                <button
                  className={control.smallSecondary}
                  disabled={pending}
                  onClick={() =>
                    preview
                      ? onPreview()
                      : run(() => transitionMilestone(projectId, m.id, 'in_progress'))
                  }
                >
                  Start milestone
                </button>
              )}
              {isFreelancer && m.state === 'in_progress' && (
                <button
                  className={control.smallSecondary}
                  disabled={pending}
                  onClick={() =>
                    preview
                      ? onPreview()
                      : run(() => transitionMilestone(projectId, m.id, 'ready_for_review'))
                  }
                >
                  Submit for review
                </button>
              )}
              {!isFreelancer && m.state === 'ready_for_review' && (
                <>
                  <button
                    className={control.smallSecondary}
                    disabled={pending}
                    onClick={() =>
                      run(() => transitionMilestone(projectId, m.id, 'changes_requested'))
                    }
                  >
                    Request changes
                  </button>
                  <button
                    className={control.smallPrimary}
                    disabled={pending}
                    onClick={() => run(() => transitionMilestone(projectId, m.id, 'accepted'))}
                  >
                    Accept milestone
                  </button>
                </>
              )}
            </div>
          </article>
        ))
      ) : (
        <div className="rounded-2xl bg-slate px-6 py-16 text-center [&>svg]:mx-auto [&>svg]:mb-7 [&>svg]:text-ice [&_h3]:text-2xl [&_h3]:font-normal [&_h3]:tracking-tight [&_p]:mx-auto [&_p]:mt-5 [&_p]:max-w-lg [&_p]:text-sm [&_p]:text-ash">
          <Flag size={28} />
          <h3>Give the project a little structure.</h3>
          <p>Add the key deliverables as milestones so you both know what comes next.</p>
        </div>
      )}
    </>
  );
}
