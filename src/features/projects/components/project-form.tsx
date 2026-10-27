'use client';
import { control } from '@/components/ui/control-styles';

import { useActionState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { createProject } from '@/features/projects/server/project-actions';
export function ProjectForm() {
  const [state, action, pending] = useActionState(createProject, {});
  return (
    <form
      action={action}
      className="mt-9 [&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_label]:font-medium [&_input]:mb-6 [&_textarea]:mb-6 [&_[data-select]]:mb-6 [&>button]:mt-6"
    >
      <label htmlFor="name">Project name</label>
      <input
        id="name"
        name="name"
        placeholder="e.g. Studio website redesign"
        minLength={3}
        maxLength={100}
        required
        autoFocus
      />
      <label htmlFor="client_name">Client or company name</label>
      <input
        id="client_name"
        name="client_name"
        placeholder="Who are you working with?"
        minLength={2}
        maxLength={100}
        required
      />
      <label htmlFor="description">
        Project summary <span className="text-ash">(optional)</span>
      </label>
      <textarea
        id="description"
        name="description"
        rows={4}
        placeholder="What are you creating together?"
        maxLength={2000}
      />
      <p className="text-xs leading-relaxed text-ash">
        You’ll invite your client and agree on the scope inside the project.
      </p>
      {state.error && (
        <p
          className="mt-5 rounded-xl bg-white/5 p-4 text-[13px] leading-relaxed text-ash [&_p]:mt-2 [&_strong]:font-medium [&_strong]:text-paper bg-danger-soft! text-danger! [&_strong]:text-danger!"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <button className={control.primary} disabled={pending}>
        {pending ? (
          <LoaderCircle size={17} className="motion-safe:animate-spin" />
        ) : (
          <>
            Create project
            <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
