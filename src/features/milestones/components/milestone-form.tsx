'use client';
import { useActionState } from 'react';
import { Plus } from 'lucide-react';
import { control } from '@/components/ui/control-styles';
import { Feedback } from '@/components/ui/feedback';
import { addMilestone } from '@/features/milestones/server/milestone-actions';
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
