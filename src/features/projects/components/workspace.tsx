'use client';
import { AgentAccess } from '@/features/agents/components/agent-access';
import { AgreementTab } from '@/features/agreements/components/agreement-tab';
import { MilestonesTab } from '@/features/milestones/components/milestones-tab';
import { AgreementDialogs } from '@/features/agreements/components/agreement-dialogs';
import { formatProjectDate as date } from '@/lib/project-date';
import { FilesPanel } from '@/features/files/components/files-panel';
import { InviteDialog } from '@/features/projects/components/invite-dialog';
import { ProjectRole } from '@/features/projects/components/project-role';
import type { ProjectFile } from '@/features/files/domain';
import { MemoryPanel } from '@/features/memory/components/memory-panel';
import { PaymentsPanel } from '@/features/payments/components/payments-panel';
import type { MemoryReference, MemorySuggestion } from '@/features/memory/domain';
import type {
  Invoice,
  PaymentRecord,
  PaymentRequest,
  PaymentClaim,
  InvoiceBalance,
} from '@/features/payments/domain';
import { ScopeReview } from '@/features/conversation/components/scope-review';
import { SCOPE_PROMPT_VERSION, type ScopeAssessment } from '@/features/conversation/scope-review';
import { ActivityFeed } from '@/features/projects/components/activity-feed';
import { control } from '@/components/ui/control-styles';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useMessageHistory } from '@/features/conversation/hooks/use-message-history';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  MessageSquare,
  Plus,
  Send,
  LoaderCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  approveAgreement,
  resolveAgreementProposal,
} from '@/features/agreements/server/agreement-actions';
import { createInvite } from '@/features/projects/server/project-actions';
import { sendMessage } from '@/features/conversation/server/message-actions';
import { type ActionResult } from '@/lib/action-result';
import {
  type ActivityEvent,
  type AgreementResolution,
  type Agreement,
  type Approval,
  type Member,
  type Message,
  type Milestone,
  type Project,
} from '@/lib/domain';
import { Dialog } from '@/components/ui/dialog';
import { PageMotion } from '@/components/ui/page-motion';
import { Feedback } from '@/components/ui/feedback';
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
        <div className="mt-3 flex flex-wrap items-center gap-4 md:mt-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-normal tracking-[-.04em] wrap-anywhere md:text-3xl">
                {project.name}
              </h1>
              <ProjectRole role={currentRole} />
            </div>
            <p className="mt-2 text-xs text-ash">{project.client_name}</p>
          </div>
          <AgentAccess projectId={project.id} preview={preview} />
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
              <AgreementTab
                project={project}
                agreements={agreements}
                approvals={approvals}
                resolutions={resolutions}
                active={active}
                isFreelancer={isFreelancer}
                userId={userId}
                pending={pending}
                preview={preview}
                proposal={proposal}
                feedback={feedback}
                onToggleProposal={() => setProposal(!proposal)}
                onCloseProposal={() => setProposal(false)}
                onPublished={(result) => {
                  setFeedback(result);
                  setProposal(false);
                }}
                onApprove={(agreement) => {
                  setSelected(agreement);
                  setFeedback({});
                  setDialog('approve');
                }}
                onResolve={(agreement) => {
                  setSelected(agreement);
                  setReason('');
                  setFeedback({});
                  setResolutionKind(isFreelancer ? 'withdrawn' : 'rejected');
                  setDialog('resolve');
                }}
              />
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
              <MilestonesTab
                projectId={project.id}
                milestones={milestones}
                isFreelancer={isFreelancer}
                milestoneForm={milestoneForm}
                setMilestoneForm={setMilestoneForm}
                feedback={feedback}
                pending={pending}
                preview={preview}
                onPreview={() => setDialog('preview')}
                onViewFiles={(id) => {
                  setFileMilestone(id);
                  setTab('Files');
                }}
                run={run}
              />
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
      {selected && (dialog === 'resolve' || dialog === 'approve') && (
        <AgreementDialogs
          kind={dialog}
          selected={selected}
          agreements={agreements}
          resolutionKind={resolutionKind}
          reason={reason}
          setReason={setReason}
          feedback={feedback}
          pending={pending}
          preview={preview}
          onClose={() => setDialog(null)}
          onResolve={() =>
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
          onApprove={() =>
            run(async () => {
              const result = await approveAgreement(project.id, selected.id);
              if (!result.error) setDialog(null);
              return result;
            })
          }
        />
      )}
    </main>
  );
}
