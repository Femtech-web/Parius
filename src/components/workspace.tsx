'use client';
import { FilesPanel } from './files-panel';
import { InviteDialog } from './invite-dialog';
import { ProjectRole } from './project-role';
import type { ProjectFile } from '@/lib/files';
import { MemoryPanel } from './memory-panel';
import { PaymentsPanel } from './payments-panel';
import type { MemoryReference, MemorySuggestion } from '@/lib/memory';
import type {
  Invoice,
  PaymentRecord,
  PaymentRequest,
  PaymentClaim,
  InvoiceBalance,
} from '@/lib/payments';
import { ScopeReview } from './scope-review';
import { SCOPE_PROMPT_VERSION, type ScopeAssessment } from '@/lib/scope-review';
import { ActivityFeed } from './activity-feed';
import { AgreementComparison } from './agreement-comparison';
import { agreementState, agreementStateLabel } from '@/lib/agreements';
import { control } from '@/components/control-styles';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useMessageHistory } from './use-message-history';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Flag,
  LockKeyhole,
  MessageSquare,
  Plus,
  Send,
  LoaderCircle,
  Circle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  approveAgreement,
  resolveAgreementProposal,
  createInvite,
  sendMessage,
  transitionMilestone,
  type ActionResult,
} from '@/app/actions';
import {
  displayAmount,
  type ActivityEvent,
  type AgreementResolution,
  type Agreement,
  type Approval,
  type Member,
  type Message,
  type Milestone,
  type Project,
} from '@/lib/domain';
import { Dialog } from './dialog';
import { PageMotion } from './page-motion';
import { Feedback, ProposalForm, MilestoneForm } from './workspace-forms';
const tabs = [
  'Conversation',
  'Agreement',
  'Milestones',
  'Payments',
  'Files',
  'Memory',
  'Activity',
] as const;
const tabChangeEvent = 'parius:project-tab';
function subscribeToTabChange(notify: () => void) {
  window.addEventListener('popstate', notify);
  window.addEventListener(tabChangeEvent, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(tabChangeEvent, notify);
  };
}
function currentTabQuery() {
  return new URLSearchParams(window.location.search).get('tab') ?? '';
}
type Tab = (typeof tabs)[number];
type Props = {
  project: Project;
  messages: Message[];
  messagesHasMore?: boolean;
  invoicesHasMore?: boolean;
  agreements: Agreement[];
  approvals: Approval[];
  milestones: Milestone[];
  members: Member[];
  userId: string;
  preview?: boolean;
  resolutions?: AgreementResolution[];
  activity?: ActivityEvent[];
  activityHasMore?: boolean;
  assessments?: ScopeAssessment[];
  scopeReviewReady?: boolean;
  memories?: MemoryReference[];
  memoryRevision?: number;
  memoryReady?: boolean;
  memorySuggestions?: MemorySuggestion[];
  suggestionsReady?: boolean;
  invoices?: Invoice[];
  paymentRecords?: PaymentRecord[];
  paymentRequests?: PaymentRequest[];
  paymentClaims?: PaymentClaim[];
  paymentsReady?: boolean;
  invoiceBalances?: InvoiceBalance[];
  files?: ProjectFile[];
  filesHasMore?: boolean;
  filesReady?: boolean;
};
function date(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
const stateLabel = {
  planned: 'Planned',
  in_progress: 'In progress',
  ready_for_review: 'Ready for review',
  accepted: 'Accepted',
  changes_requested: 'Changes requested',
};
export function Workspace({
  project,
  messages,
  messagesHasMore = false,
  invoicesHasMore = false,
  agreements,
  approvals,
  milestones,
  members,
  userId,
  preview = false,
  resolutions = [],
  activity = [],
  activityHasMore = false,
  assessments = [],
  scopeReviewReady = false,
  memories = [],
  memoryRevision = 0,
  memoryReady = false,
  memorySuggestions = [],
  suggestionsReady = false,
  invoices = [],
  paymentRecords = [],
  paymentRequests = [],
  paymentClaims = [],
  paymentsReady = false,
  invoiceBalances = [],
  files = [],
  filesHasMore = false,
  filesReady = false,
}: Props) {
  const searchParams = useSearchParams();
  const tabQuery = useSyncExternalStore(
    subscribeToTabChange,
    currentTabQuery,
    () => searchParams.get('tab') ?? '',
  );
  const tab = tabs.find((item) => item.toLowerCase() === tabQuery) ?? 'Conversation';
  const setTab = (next: Tab) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next.toLowerCase());
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(tabChangeEvent));
  };
  const [fileMilestone, setFileMilestone] = useState('');
  const messageHistory = useMessageHistory(project.id, messages, messagesHasMore, preview);
  const visibleMessages = messageHistory.items;
  const prependAnchor = useRef<{ id: string; offset: number } | null>(null);
  const historyPane = useRef<HTMLDivElement>(null);
  const [proposal, setProposal] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState(false);
  const [dialog, setDialog] = useState<'invite' | 'approve' | 'resolve' | 'preview' | null>(null);
  const [resolutionKind, setResolutionKind] = useState<'rejected' | 'withdrawn'>('rejected');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Agreement | null>(null);
  const [feedback, setFeedback] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [imported, setImported] = useState(false);
  const [invite, setInvite] = useState<ActionResult & { emailReady?: boolean }>({});
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const retryKey = useRef<string | null>(null);
  const followLatest = useRef(true);
  const currentRole = members.find((m) => m.user_id === userId)?.role;
  const isFreelancer = currentRole === 'freelancer';
  const active = agreements.find((a) => a.id === project.active_agreement_id);
  const client = members.find((m) => m.role === 'client');
  const lastMessageId = visibleMessages.at(-1)?.id;
  const firstMessageId = visibleMessages[0]?.id;
  useEffect(() => {
    if (preview) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`project-messages-${project.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `project_id=eq.${project.id}`,
        },
        () => router.refresh(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') router.refresh();
      });
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [preview, project.id, router]);
  useEffect(() => {
    // Scroll only the history pane. scrollIntoView also moves the document on mobile.
    const history = end.current?.parentElement;
    if (history && followLatest.current) history.scrollTop = history.scrollHeight;
  }, [lastMessageId, tab]);
  useLayoutEffect(() => {
    const anchor = prependAnchor.current,
      pane = historyPane.current;
    if (!anchor || !pane) return;
    const target = pane.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"] article`);
    if (target)
      pane.scrollTop +=
        target.getBoundingClientRect().top - pane.getBoundingClientRect().top - anchor.offset;
    prependAnchor.current = null;
  }, [firstMessageId, messageHistory.hasOlder]);
  function run(work: () => Promise<ActionResult>) {
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await work();
        setFeedback(result);
        if (!result.error) router.refresh();
      } catch {
        setFeedback({ error: 'Your request could not be confirmed. Please retry.' });
      }
    });
  }
  function inviteClient() {
    if (preview) {
      setDialog('preview');
      return;
    }
    if (invite.url) {
      setDialog('invite');
      return;
    }
    setInvite({});
    setDialog('invite');
    startTransition(async () => {
      try {
        setInvite(await createInvite(project.id));
      } catch {
        setInvite({ error: 'The invite could not be created. Try again.' });
      }
    });
  }
  function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (preview) {
      setDialog('preview');
      return;
    }
    retryKey.current ??= crypto.randomUUID();
    followLatest.current = true;
    run(async () => {
      const result = await sendMessage(
        project.id,
        body,
        retryKey.current!,
        imported ? 'imported' : 'chat',
      );
      if (!result.error) {
        setBody('');
        retryKey.current = null;
        setImported(false);
        return {};
      }
      return result;
    });
  }
  return (
    <main
      id="main"
      className={`flex min-w-0 flex-col ${preview ? 'xl:h-[calc(100svh-132px)]' : 'xl:h-[calc(100svh-72px)]'}`}
    >
      <div className="border-b border-white/10 px-5 pt-5 md:px-9 md:pt-7">
        <Link
          href={preview ? '/preview' : '/dashboard'}
          className="inline-flex min-h-11 items-center gap-2 text-xs text-ash transition-colors hover:text-paper md:hidden"
        >
          <ArrowLeft size={12} />
          All projects
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-4 md:mt-0 [&>div]:min-w-0 [&>div]:flex-1 [&_h1]:text-2xl [&_h1]:font-normal [&_h1]:tracking-[-.04em] [&_h1]:wrap-anywhere md:[&_h1]:text-3xl [&_p]:mt-2 [&_p]:text-xs [&_p]:text-ash [&>button]:ml-auto">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1>{project.name}</h1>
              <ProjectRole role={currentRole} />
            </div>
            <p>{project.client_name}</p>
          </div>
          {isFreelancer && !client ? (
            <button className={control.smallSecondary} onClick={inviteClient}>
              <Plus size={14} />
              Invite client
            </button>
          ) : null}
        </div>
        <nav
          className="mt-5 flex gap-7 overflow-x-auto overscroll-x-contain [&_button]:inline-flex [&_button]:min-h-12 [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-2 [&_button]:border-b [&_button]:border-transparent [&_button]:pb-4 [&_button]:text-xs [&_button]:text-ash [&_button]:transition-colors [&_button:hover]:text-paper [&_svg]:size-4"
          aria-label="Project sections"
        >
          {tabs.map((item) => {
            return (
              <button
                aria-current={tab === item ? 'page' : undefined}
                className={tab === item ? 'border-ice! text-ice!' : ''}
                key={item}
                onClick={() => {
                  setTab(item);
                  if (item === 'Files') setFileMilestone('');
                  setFeedback({});
                }}
              >
                {item}
              </button>
            );
          })}
        </nav>
      </div>
      <PageMotion
        key={tab}
        animationKey={tab}
        className="scheme-dark [scrollbar-color:var(--color-stone)_var(--color-night)] xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
      >
        {tab === 'Conversation' ? (
          <div className="mx-auto w-full max-w-4xl min-h-[calc(100svh-300px)] xl:h-full xl:min-h-0">
            <section
              className="flex h-full min-h-[560px] min-w-0 flex-col xl:min-h-0"
              aria-label="Project conversation"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs md:px-8 [&>strong]:font-medium [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span]:text-[11px] [&>span]:text-ash">
                <strong>Project conversation</strong>
                <span>
                  <LockKeyhole size={12} />
                  {members.length} participants · private
                </span>
              </div>
              <div
                ref={historyPane}
                className="max-h-[640px] min-h-80 flex-1 xl:min-h-0 xl:max-h-none overflow-y-auto overscroll-y-contain scheme-dark [scrollbar-color:var(--color-stone)_var(--color-night)] px-5 py-5 md:px-8"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  followLatest.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 100;
                }}
              >
                {messageHistory.hasOlder && (
                  <div className="mb-6 text-center">
                    <button
                      className={control.smallSecondary}
                      disabled={messageHistory.olderPending}
                      onClick={() =>
                        void messageHistory.loadOlder(() => {
                          const pane = historyPane.current;
                          if (!pane) return;
                          const bounds = pane.getBoundingClientRect();
                          const first = [
                            ...pane.querySelectorAll<HTMLElement>('[data-message-id] article'),
                          ].find((el) => el.getBoundingClientRect().bottom > bounds.top);
                          if (first)
                            prependAnchor.current = {
                              id: first.closest<HTMLElement>('[data-message-id]')!.dataset
                                .messageId!,
                              offset: first.getBoundingClientRect().top - bounds.top,
                            };
                          followLatest.current = false;
                        })
                      }
                    >
                      {messageHistory.olderPending
                        ? 'Loading earlier messages…'
                        : 'Load earlier messages'}
                    </button>
                  </div>
                )}
                {messageHistory.error && (
                  <p role="alert" className="mb-4 text-center text-xs text-danger">
                    {messageHistory.error}
                  </p>
                )}
                {visibleMessages.length === 0 ? (
                  <div className="grid min-h-72 place-content-center text-center [&>svg]:mx-auto [&>svg]:mb-6 [&>svg]:text-ice [&_h3]:text-xl [&_h3]:font-normal [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
                    <MessageSquare size={27} />
                    <h3>No messages yet</h3>
                    <p>
                      Messages with your client will appear here.
                      <br />
                      {client
                        ? 'Send a message to get started.'
                        : 'Invite your client when you’re ready.'}
                    </p>
                  </div>
                ) : (
                  visibleMessages.map((message, index) => (
                    <div key={message.id} data-message-id={message.id}>
                      {(index === 0 ||
                        date(message.created_at) !==
                          date(visibleMessages[index - 1].created_at)) && (
                        <p className="mb-6 text-center text-[11px] text-ash">
                          {date(message.created_at)} · UTC
                        </p>
                      )}
                      <article
                        className={`group/message mb-7 flex max-w-[94%] gap-3 sm:max-w-[90%] ${message.author_id === userId ? 'is-mine ml-auto flex-row-reverse' : ''}`}
                      >
                        {message.author_id !== userId && (
                          <span
                            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ice/12 text-xs font-medium text-ice ${message.author_id === userId ? '' : 'bg-paper/10! text-paper!'}`}
                          >
                            {message.author_name[0]}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 group-[.is-mine]/message:justify-end [&_strong]:text-xs [&_strong]:font-medium [&_time]:text-[10px] [&_time]:text-ash">
                            <strong>
                              {message.author_id === userId ? 'You' : message.author_name}
                            </strong>
                            <time dateTime={message.created_at}>
                              {new Date(message.created_at).toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'UTC',
                              })}
                            </time>
                          </div>
                          <div className="w-fit max-w-xl rounded-2xl rounded-tl-sm bg-white/5 px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper/90 group-[.is-mine]/message:ml-auto group-[.is-mine]/message:rounded-tl-2xl group-[.is-mine]/message:rounded-tr-sm group-[.is-mine]/message:bg-ice/10 group-[.is-mine]/message:text-ice">
                            {message.source === 'imported' && (
                              <span className="mb-2 block text-[11px] text-warning">
                                Pasted excerpt · unverified attribution
                              </span>
                            )}
                            {message.body}
                          </div>
                        </div>
                      </article>
                      {!preview &&
                        isFreelancer &&
                        active &&
                        (message.author_id === client?.user_id ||
                          message.source === 'imported') && (
                          <ScopeReview
                            key={`${message.id}:${active.id}:${memoryRevision}`}
                            projectId={project.id}
                            messageId={message.id}
                            agreement={active}
                            initial={assessments.find(
                              (a) =>
                                a.message_id === message.id &&
                                a.agreement_id === active.id &&
                                a.status === 'completed' &&
                                a.prompt_version === SCOPE_PROMPT_VERSION &&
                                (a.memory_revision || 0) === memoryRevision,
                            )}
                            onTeach={() => setTab('Memory')}
                            ready={scopeReviewReady}
                            onDraft={(draft) => {
                              setBody((current) =>
                                current.trim() ? `${current}\n\n${draft}` : draft,
                              );
                              setImported(false);
                              setFeedback({
                                success: 'Reply draft added. Review it, then send when ready.',
                              });
                            }}
                          />
                        )}
                      {preview && isFreelancer && index === 2 && (
                        <details className="mb-6 border-l border-white/15 pl-4 text-xs leading-relaxed sm:ml-11">
                          <summary className="min-h-11 cursor-pointer py-3 text-ice">
                            Possible scope change · Preview
                          </summary>
                          <p className="mt-2 max-w-lg text-ash">
                            The requested storefront adds product pages and checkout. Agreement v1
                            covers a five-page portfolio website. Review a change proposal before
                            starting extra work.
                          </p>
                          <p className="mt-3 text-ash">
                            Illustrative suggestion, private to the freelancer. No terms changed.
                          </p>
                        </details>
                      )}
                    </div>
                  ))
                )}
                {messageHistory.needsCatchup && (
                  <button
                    className={`${control.smallSecondary} mb-4`}
                    disabled={messageHistory.newerPending}
                    onClick={() => void messageHistory.catchUp()}
                  >
                    {messageHistory.newerPending ? 'Catching up…' : 'Load newer messages'}
                  </button>
                )}
                {messageHistory.newerPending && (
                  <p role="status" className="mb-3 text-center text-xs text-ash">
                    Updating messages…
                  </p>
                )}
                <div ref={end} />
              </div>
              <form className="shrink-0 px-5 pt-4 pb-6 md:px-8" onSubmit={submitMessage}>
                <div className="rounded-2xl border border-white/35 bg-slate p-3 focus-within:border-ice [&_textarea]:min-h-16 [&_textarea]:max-h-52 [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:shadow-none">
                  <label className="sr-only" htmlFor="message">
                    Message your project
                  </label>
                  <textarea
                    id="message"
                    placeholder="Write a message…"
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      retryKey.current = null;
                    }}
                    maxLength={6000}
                    rows={2}
                    disabled={pending}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 [&>label]:flex [&>label]:min-h-11 [&>label]:items-center [&>label]:gap-2 [&>label]:text-[11px] [&>label]:text-ash [&_input]:size-4 [&_input]:accent-ice">
                    <label>
                      <input
                        type="checkbox"
                        checked={imported}
                        onChange={(e) => setImported(e.target.checked)}
                        disabled={pending}
                      />
                      Quote from another app
                    </label>
                    <button className={control.smallPrimary} disabled={pending || !body.trim()}>
                      {pending ? (
                        <LoaderCircle className="motion-safe:animate-spin" size={15} />
                      ) : (
                        <>
                          Send
                          <Send size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <Feedback state={feedback} />
              </form>
            </section>
          </div>
        ) : (
          <section className="mx-auto max-w-5xl px-5 py-9 md:px-9 md:py-12" key={tab}>
            {tab === 'Agreement' ? (
              <>
                <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
                  <div>
                    <h2>Agreement</h2>
                    <p>Current terms and previous versions.</p>
                  </div>
                  {isFreelancer && (
                    <button
                      className={control.smallSecondary}
                      onClick={() => setProposal(!proposal)}
                    >
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
                    onClose={() => setProposal(false)}
                    onPublished={(result) => {
                      setFeedback(result);
                      setProposal(false);
                    }}
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
                    const status = agreementState(
                      a,
                      project.active_agreement_id,
                      approvals,
                      resolution,
                    );
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
                            The active terms changed after this proposal was written. A new proposal
                            is needed before approval.
                          </p>
                        )}
                        <p className="max-w-prose text-sm leading-loose whitespace-pre-wrap wrap-anywhere text-paper/85">
                          {a.scope}
                        </p>
                        <div className="my-7 flex flex-wrap gap-x-10 gap-y-5 border-y border-white/10 py-6 [&_small]:mb-2 [&_small]:block [&_small]:text-xs [&_small]:text-ash [&_strong]:text-base [&_strong]:font-medium [&_strong]:tabular-nums">
                          <div>
                            <small>
                              {isActive || status === 'previous'
                                ? 'Agreed total'
                                : 'Proposed total'}
                            </small>
                            <strong>
                              {displayAmount(a.amount_atomic, a.currency, a.decimals)}
                            </strong>
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
                              onClick={() => {
                                setSelected(a);
                                setFeedback({});
                                setDialog('approve');
                              }}
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
                            onClick={() => {
                              setSelected(a);
                              setReason('');
                              setFeedback({});
                              setResolutionKind(isFreelancer ? 'withdrawn' : 'rejected');
                              setDialog('resolve');
                            }}
                          >
                            {isFreelancer ? 'Withdraw proposal' : 'Reject proposal'}
                          </button>
                        )}
                      </article>
                    );
                  })
                )}
              </>
            ) : tab === 'Activity' ? (
              <ActivityFeed
                projectId={project.id}
                events={activity}
                hasMore={activityHasMore}
                members={members}
                agreements={agreements}
                milestones={milestones}
                preview={preview}
              />
            ) : tab === 'Milestones' ? (
              <>
                <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_p]:mt-3 [&_p]:text-sm [&_p]:text-ash">
                  <div>
                    <h2>Milestones</h2>
                  </div>
                  {isFreelancer && (
                    <button
                      className={control.smallSecondary}
                      onClick={() =>
                        preview ? setDialog('preview') : setMilestoneForm(!milestoneForm)
                      }
                    >
                      <Plus size={14} />
                      Add milestone
                    </button>
                  )}
                </div>
                {milestoneForm && <MilestoneForm projectId={project.id} />}
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
                        <button
                          className={control.smallSecondary}
                          onClick={() => {
                            setFileMilestone(m.id);
                            setTab('Files');
                          }}
                        >
                          View files
                        </button>
                        {isFreelancer && ['planned', 'changes_requested'].includes(m.state) && (
                          <button
                            className={control.smallSecondary}
                            disabled={pending}
                            onClick={() =>
                              preview
                                ? setDialog('preview')
                                : run(() => transitionMilestone(project.id, m.id, 'in_progress'))
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
                                ? setDialog('preview')
                                : run(() =>
                                    transitionMilestone(project.id, m.id, 'ready_for_review'),
                                  )
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
                                run(() =>
                                  transitionMilestone(project.id, m.id, 'changes_requested'),
                                )
                              }
                            >
                              Request changes
                            </button>
                            <button
                              className={control.smallPrimary}
                              disabled={pending}
                              onClick={() =>
                                run(() => transitionMilestone(project.id, m.id, 'accepted'))
                              }
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
            ) : tab === 'Files' ? (
              <FilesPanel
                key={`${project.id}:${userId}:${fileMilestone}`}
                projectId={project.id}
                userId={userId}
                isFreelancer={isFreelancer}
                files={files}
                hasMore={filesHasMore}
                ready={filesReady}
                preview={preview}
                active={active}
                milestones={milestones}
                invoices={invoices}
                initialMilestone={fileMilestone}
              />
            ) : tab === 'Payments' ? (
              <PaymentsPanel
                projectId={project.id}
                active={active}
                invoices={invoices}
                records={paymentRecords}
                requests={paymentRequests}
                claims={paymentClaims}
                balances={invoiceBalances}
                hasMore={invoicesHasMore}
                onFollowupSent={() => setTab('Conversation')}
                milestones={milestones}
                isFreelancer={isFreelancer}
                preview={preview}
                ready={paymentsReady}
              />
            ) : (
              <MemoryPanel
                key={`${project.id}:${userId}`}
                projectId={project.id}
                memories={memories}
                isFreelancer={isFreelancer}
                preview={preview}
                ready={memoryReady}
                suggestions={memorySuggestions}
                suggestionsReady={suggestionsReady}
              />
            )}
          </section>
        )}
      </PageMotion>
      {dialog === 'preview' && (
        <Dialog title="You’re exploring a preview." onClose={() => setDialog(null)}>
          <p>
            This fictional project shows how the workspace fits together. Sign in and create your
            own project to send messages, invite your client and approve real terms.
          </p>
          <footer>
            <button className={control.secondary} onClick={() => setDialog(null)}>
              Keep exploring
            </button>
            <Link className={control.primary} href="/login">
              Start a project
              <ArrowRight size={15} />
            </Link>
          </footer>
        </Dialog>
      )}
      {dialog === 'invite' && (
        <InviteDialog
          projectId={project.id}
          invite={invite}
          creating={pending}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'resolve' && selected && (
        <Dialog
          title={`${resolutionKind === 'rejected' ? 'Reject' : 'Withdraw'} version ${selected.version}?`}
          onClose={() => setDialog(null)}
        >
          <p>
            This closes the proposal for <strong>{selected.title}</strong>. Existing approvals
            remain in its history, and the active agreement stays unchanged. Continuing with
            different terms requires a new proposal and fresh approvals.
          </p>
          <label htmlFor="resolution-reason" className="mt-6 mb-3 block text-xs text-paper">
            Reason (optional, shared with your project partner)
          </label>
          <textarea
            id="resolution-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
          {preview && (
            <p className="mt-5 text-xs text-ice">Preview only. No proposal will be changed.</p>
          )}
          <Feedback state={feedback} />
          <footer>
            <button className={control.secondary} onClick={() => setDialog(null)}>
              Keep reviewing
            </button>
            <button
              disabled={pending || preview}
              className={control.primary}
              onClick={() =>
                run(async () => {
                  const result = await resolveAgreementProposal(
                    project.id,
                    selected.id,
                    resolutionKind,
                    reason,
                  );
                  if (!result.error) setDialog(null);
                  return result;
                })
              }
            >
              {pending
                ? 'Saving…'
                : resolutionKind === 'rejected'
                  ? 'Reject proposal'
                  : 'Withdraw proposal'}
            </button>
          </footer>
        </Dialog>
      )}
      {dialog === 'approve' && selected && (
        <Dialog title={`Approve version ${selected.version}?`} onClose={() => setDialog(null)}>
          <p>
            You’re approving <strong>{selected.title}</strong>, including the complete scope shown
            in this version.
          </p>
          <div className="my-7 flex flex-wrap gap-x-10 gap-y-5 border-y border-white/10 py-6 [&_small]:mb-2 [&_small]:block [&_small]:text-xs [&_small]:text-ash [&_strong]:text-base [&_strong]:font-medium [&_strong]:tabular-nums">
            <div>
              <small>Total price</small>
              <strong>
                {displayAmount(selected.amount_atomic, selected.currency, selected.decimals)}
              </strong>
            </div>
            <div>
              <small>Revisions</small>
              <strong>{selected.revision_limit} rounds</strong>
            </div>
          </div>
          <p>
            The agreement becomes active only when both people approve this same version. This
            approval does not authorize a payment.
          </p>
          <details className="mt-5 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer text-xs text-ice">
              Read the complete scope and conditions
            </summary>
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper/85">
              {selected.scope}
            </p>
          </details>
          <AgreementComparison
            base={agreements.find((a) => a.id === selected.base_version_id)}
            next={selected}
          />
          {preview && (
            <p className="mt-5 text-xs text-ice">
              Preview only. Approval is available in your own project.
            </p>
          )}
          <Feedback state={feedback} />
          <footer>
            <button className={control.secondary} onClick={() => setDialog(null)}>
              Keep reviewing
            </button>
            <button
              className={control.primary}
              disabled={pending || preview}
              onClick={() =>
                run(async () => {
                  const result = await approveAgreement(project.id, selected.id);
                  if (!result.error) setDialog(null);
                  return result;
                })
              }
            >
              Approve this version
              <Check size={15} />
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  );
}
