import Link from 'next/link';
import { ArrowUpRight, FolderOpen, CircleHelp, ArrowLeft, LogOut, Plus } from 'lucide-react';
import { Brand } from '@/components/ui/brand';
import { PageMotion } from '@/components/ui/page-motion';
import { signOut } from '@/features/auth/server/actions';

const nav =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-ash transition-colors hover:bg-white/5 hover:text-paper';
export function Shell({
  children,
  name = 'Your workspace',
  preview = false,
  activePage = 'projects',
}: {
  children: React.ReactNode;
  name?: string;
  preview?: boolean;
  activePage?: 'projects' | 'new-project';
}) {
  return (
    <div className="min-h-svh bg-night text-paper">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-white/8 bg-slate/40 px-5 pt-8 md:flex">
        <Brand className="ml-3" />
        <nav aria-label="Main navigation" className="mt-12 space-y-2">
          <Link
            href={preview ? '/preview' : '/dashboard'}
            aria-current={activePage === 'projects' ? 'page' : undefined}
            className={`${nav} ${activePage === 'projects' ? 'bg-ice/8 text-ice!' : ''}`}
          >
            <FolderOpen size={17} strokeWidth={1.5} />
            Projects
          </Link>
          <Link
            href={preview ? '/preview?view=new-project' : '/projects/new'}
            aria-current={activePage === 'new-project' ? 'page' : undefined}
            className={`${nav} ${activePage === 'new-project' ? 'bg-ice/8 text-ice!' : ''}`}
          >
            <Plus size={17} strokeWidth={1.5} />
            New project
          </Link>
        </nav>
        <div className="mt-auto pt-12">
          <Link href="/guide" className={nav}>
            <CircleHelp size={17} strokeWidth={1.5} />
            Product guide
            <ArrowUpRight size={13} className="ml-auto" />
          </Link>
          {preview ? (
            <Link href="/login" className={nav}>
              <ArrowLeft size={17} strokeWidth={1.5} />
              Leave preview
            </Link>
          ) : (
            <form action={signOut}>
              <button className={`${nav} w-full`} type="submit">
                <LogOut size={17} strokeWidth={1.5} />
                Sign out
              </button>
            </form>
          )}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 px-3 py-6">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper/8 text-xs">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-xs">{name}</span>
              <span className="mt-1 block text-[10px] text-ash">
                {preview ? 'Design preview' : 'Personal account'}
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 md:ml-60">
        <header className="flex min-h-18 flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4 md:px-9">
          <span className="hidden text-xs text-ash md:block">
            <Link
              href={preview ? '/preview' : '/dashboard'}
              className="transition-colors hover:text-paper"
            >
              Workspace
            </Link>
            <span className="mx-3 text-white/20">/</span>
            {activePage === 'new-project' ? 'New project' : 'Projects'}
          </span>
          <Brand className="text-2xl! md:hidden" />
          <nav
            aria-label="Mobile navigation"
            className="flex w-full items-center gap-5 border-t border-white/8 pt-3 text-xs text-ash md:hidden"
          >
            <Link
              aria-current={activePage === 'projects' ? 'page' : undefined}
              className="flex min-h-11 items-center gap-2 aria-[current=page]:text-ice"
              href={preview ? '/preview' : '/dashboard'}
            >
              <FolderOpen size={15} />
              Projects
            </Link>
            <Link
              href={preview ? '/preview?view=new-project' : '/projects/new'}
              aria-current={activePage === 'new-project' ? 'page' : undefined}
              className="flex min-h-11 items-center gap-2 aria-[current=page]:text-ice"
            >
              <Plus size={15} />
              New project
            </Link>
            <Link href="/guide" className="flex min-h-11 items-center">
              Guide
            </Link>
            {preview ? (
              <Link href="/login" className="ml-auto flex min-h-11 items-center">
                Exit
              </Link>
            ) : (
              <form action={signOut} className="ml-auto">
                <button type="submit" className="min-h-11">
                  Sign out
                </button>
              </form>
            )}
          </nav>
        </header>
        <PageMotion>{children}</PageMotion>
      </div>
    </div>
  );
}
