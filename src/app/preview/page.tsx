import Link from 'next/link';
import { DashboardView } from '@/features/projects/components/dashboard-view';
import { NewProjectView } from '@/features/projects/components/new-project-view';
import { Shell } from '@/components/layout/shell';
import { Workspace } from '@/features/projects/components/workspace';
import type { Agreement, Message, Milestone, Project } from '@/lib/domain';
// Fictional content is confined to this explicitly labeled, non-persistent preview.
const project: Project = {
  id: 'preview',
  name: 'Forma studio website',
  client_name: 'Forma Studio',
  description: 'A thoughtful digital home for an independent design studio.',
  created_at: '2026-10-20T08:00:00Z',
  active_agreement_id: 'v1',
};
const agreement: Agreement = {
  id: 'v1',
  project_id: 'preview',
  title: 'A new home for Forma Studio',
  scope:
    'DELIVERABLES\nDesign and development of a five-page portfolio website: Home, About, Work, Project detail, and Contact.\n\nINCLUDED\nResponsive layouts, a contact form, and two rounds of design revisions.\n\nOUTSIDE THIS SCOPE\nE-commerce, payment checkout, product management, and ongoing maintenance. Any additions require a separately approved change proposal.\n\nPAYMENT TERMS\n50% deposit and 50% on final delivery. Final files are released after the balance is paid.',
  amount_atomic: '2400000000',
  decimals: 6,
  currency: 'USDC',
  revision_limit: 2,
  version: 1,
  base_version_id: null,
  created_at: '2026-10-20T09:00:00Z',
};
const proposal: Agreement = {
  ...agreement,
  id: 'v2',
  version: 2,
  base_version_id: 'v1',
  title: 'Forma Studio website & print shop',
  scope: agreement.scope
    .replace(
      'E-commerce, payment checkout, product management, and ongoing maintenance.',
      'Ongoing maintenance and fulfillment.',
    )
    .replace(
      'Responsive layouts, a contact form, and two rounds of design revisions.',
      'Responsive layouts, a contact form, two rounds of design revisions, and a print shop with up to 10 product pages and checkout integration.',
    ),
  amount_atomic: '3200000000',
  created_at: '2026-10-22T10:00:00Z',
};
const messages: Message[] = [
  {
    id: '1',
    project_id: 'preview',
    author_id: 'client',
    author_name: 'Amara Okafor',
    body: 'The homepage direction feels just right. The team loves how much space the work has to breathe.',
    created_at: '2026-10-22T09:41:00Z',
    source: 'chat',
  },
  {
    id: '2',
    project_id: 'preview',
    author_id: 'freelancer',
    author_name: 'Alex Morgan',
    body: 'So glad to hear that! I’ve refined the project pages too. I’ll share those for your review tomorrow.',
    created_at: '2026-10-22T09:44:00Z',
    source: 'chat',
  },
  {
    id: '3',
    project_id: 'preview',
    author_id: 'client',
    author_name: 'Amara Okafor',
    body: 'One more thought — we’re launching a small collection of prints. Could we add a shop with product pages and checkout to the website?',
    created_at: '2026-10-22T09:48:00Z',
    source: 'chat',
  },
  {
    id: '4',
    project_id: 'preview',
    author_id: 'freelancer',
    author_name: 'Alex Morgan',
    body: 'Love the idea. That would be a new part of the project, so let me put together a clear proposal for the storefront. We can review the scope and price together before I start.',
    created_at: '2026-10-22T09:52:00Z',
    source: 'chat',
  },
];
const milestones: Milestone[] = [
  {
    id: 'm1',
    project_id: 'preview',
    title: 'Direction & discovery',
    due_date: '2026-10-21',
    state: 'accepted',
    created_at: '2026-10-20T09:00:00Z',
  },
  {
    id: 'm2',
    project_id: 'preview',
    title: 'Website design',
    due_date: '2026-10-28',
    state: 'in_progress',
    created_at: '2026-10-20T09:00:00Z',
  },
  {
    id: 'm3',
    project_id: 'preview',
    title: 'Build & handoff',
    due_date: '2026-11-04',
    state: 'planned',
    created_at: '2026-10-20T09:00:00Z',
  },
];
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; state?: string; role?: string }>;
}) {
  const { view, state, role } = await searchParams;
  const overview = view !== 'project' && view !== 'new-project';
  const newProject = view === 'new-project';
  return (
    <Shell
      preview
      name={role === 'client' ? 'Amara Okafor' : 'Alex Morgan'}
      activePage={newProject ? 'new-project' : 'projects'}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-white/8 px-5 py-2 text-[11px] text-ash md:px-9">
        <span>Preview · Fictional project · Changes aren’t saved</span>
        {!overview && !newProject && (
          <Link
            href={role === 'client' ? '/preview?view=project' : '/preview?view=project&role=client'}
            className="flex min-h-11 items-center text-ice hover:text-paper"
          >
            {role === 'client' ? 'View as freelancer' : 'View as client'}
          </Link>
        )}
      </div>
      {overview ? (
        <DashboardView
          preview
          projects={
            state === 'empty' || state === 'error'
              ? []
              : [{ ...project, role: role === 'client' ? 'client' : 'freelancer' }]
          }
          error={state === 'error'}
        />
      ) : newProject ? (
        <NewProjectView preview />
      ) : (
        <Workspace
          preview
          project={project}
          messages={messages}
          agreements={[proposal, agreement]}
          activity={[
            {
              id: 'e4',
              project_id: 'preview',
              actor_id: 'freelancer',
              kind: 'agreement_proposed',
              record_id: 'v2',
              created_at: proposal.created_at,
            },
            {
              id: 'e3',
              project_id: 'preview',
              actor_id: 'client',
              kind: 'agreement_activated',
              record_id: 'v1',
              created_at: '2026-10-20T10:00:00Z',
            },
            {
              id: 'e2',
              project_id: 'preview',
              actor_id: 'freelancer',
              kind: 'agreement_proposed',
              record_id: 'v1',
              created_at: agreement.created_at,
            },
            {
              id: 'e1',
              project_id: 'preview',
              actor_id: 'freelancer',
              kind: 'project_created',
              record_id: null,
              created_at: project.created_at,
            },
          ]}
          approvals={[
            {
              agreement_id: 'v1',
              actor_id: 'freelancer',
              role: 'freelancer',
              created_at: agreement.created_at,
            },
            {
              agreement_id: 'v1',
              actor_id: 'client',
              role: 'client',
              created_at: agreement.created_at,
            },
          ]}
          invoices={[
            {
              id: 'invoice-preview',
              project_id: 'preview',
              agreement_id: 'v1',
              milestone_id: 'm1',
              title: 'Forma Studio website · deposit',
              amount_atomic: '1200000000',
              currency: 'USDC',
              decimals: 6,
              status: 'issued',
              due_date: '2026-10-28',
              recipient: null,
              network: null,
              coin_type: null,
              created_at: '2026-10-21T10:00:00Z',
              issued_at: '2026-10-21T10:00:00Z',
            },
          ]}
          filesReady
          files={[
            {
              id: 'file-preview',
              project_id: 'preview',
              uploaded_by: 'freelancer',
              name: 'Website design preview.pdf',
              mime: 'application/pdf',
              size_bytes: 204800,
              kind: 'preview',
              milestone_id: 'm2',
              agreement_id: null,
              release_rule: null,
              invoice_id: null,
              terms_quote: null,
              status: 'ready',
              created_at: '2026-10-22T09:00:00Z',
              released_at: null,
              object_deleted_at: null,
            },
          ]}
          milestones={milestones}
          members={[
            { user_id: 'freelancer', role: 'freelancer', display_name: 'Alex Morgan' },
            { user_id: 'client', role: 'client', display_name: 'Amara Okafor' },
          ]}
          userId={role === 'client' ? 'client' : 'freelancer'}
        />
      )}
    </Shell>
  );
}
