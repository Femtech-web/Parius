import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { control } from '@/components/control-styles';
import type { Member, Project } from '@/lib/domain';
import { ProjectRole } from './project-role';

export function DashboardView({
  projects,
  error = false,
  preview = false,
}: {
  projects: (Project & { role?: Member['role'] })[];
  error?: boolean;
  preview?: boolean;
}) {
  return (
    <main id="main" className="mx-auto max-w-5xl px-5 py-9 md:px-10 md:py-12">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <h1 className="text-3xl font-normal tracking-[-.04em]">Projects</h1>
        <Link
          className={control.primary}
          href={preview ? '/preview?view=new-project' : '/projects/new'}
        >
          <Plus size={16} /> New project
        </Link>
      </header>
      <section aria-label="Your projects" className="mt-9">
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft p-5 text-sm text-danger">
            We couldn’t load your projects. Refresh the page to try again.
          </p>
        ) : projects.length ? (
          <ul className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10 bg-slate/40">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={preview ? '/preview?view=project' : `/projects/${project.id}`}
                  className="group flex min-h-28 items-center gap-5 px-5 py-6 transition-colors hover:bg-white/[.03] md:px-7"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="text-lg font-normal tracking-tight wrap-anywhere">
                        {project.name}
                      </h2>
                      <ProjectRole role={project.role} />
                    </div>
                    <p className="mt-2 text-xs text-ash wrap-anywhere">{project.client_name}</p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-ash sm:block">
                    {project.active_agreement_id ? 'Agreement active' : 'No agreement yet'}
                  </span>
                  <ArrowUpRight
                    size={17}
                    className="shrink-0 text-ash transition-colors group-hover:text-ice"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-white/10 px-6 py-16 text-center">
            <h2 className="text-xl font-normal tracking-tight">No projects yet</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ash">
              Create a project, then invite your client to get started.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
