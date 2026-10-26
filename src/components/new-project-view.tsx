import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectForm } from '@/components/project-form';

export function NewProjectView({ preview = false }: { preview?: boolean }) {
  return (
    <main
      id="main"
      className="mx-auto max-w-2xl px-6 pt-8 pb-20 md:px-10 [&>h1]:mt-5 [&>h1]:mb-4 [&>h1]:text-4xl [&>h1]:font-normal [&>h1]:leading-tight [&>h1]:tracking-[-.05em] [&>span]:mt-10 [&>span]:text-ash [&>p]:text-sm"
    >
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ice transition-colors hover:text-paper"
        href={preview ? '/preview' : '/dashboard'}
      >
        <ArrowLeft size={15} />
        Back to projects
      </Link>
      <h1>New project</h1>
      <p className="text-ash">Add the details. You can invite your client next.</p>
      <fieldset disabled={preview}>
        <ProjectForm />
      </fieldset>
    </main>
  );
}
