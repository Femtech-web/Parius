'use client';
import { useState, useTransition } from 'react';
import { History } from 'lucide-react';
import type { ActivityEvent, Agreement, Member, Milestone } from '@/lib/domain';
import { loadProjectActivity } from '@/features/projects/server/project-actions';
import { control } from '@/components/ui/control-styles';
const descriptions: Record<string, string> = {
  project_created: 'created the project',
  payment_promise_reported: 'recorded an unconfirmed payment promise',
  payment_promise_confirmed: 'confirmed a payment promise',
  payment_promise_confirm: 'confirmed a payment promise',
  payment_promise_withdraw: 'withdrew a payment promise',
  payment_promise_fulfill: 'closed a promise against recorded receipts',
  payment_followup_sent: 'sent a reviewed payment follow-up',
  file_uploaded: 'uploaded a project file',
  file_released: 'released a final deliverable',
  file_removed: 'removed a project file',
  client_joined: 'joined the project',
  agreement_proposed: 'proposed',
  agreement_approved: 'approved',
  agreement_activated: 'completed approval of',
  agreement_rejected: 'rejected',
  agreement_withdrawn: 'withdrew',
  invoice_issued: 'issued an invoice',
  invoice_voided: 'voided an invoice',
  manual_payment_recorded: 'recorded a manual receipt',
  manual_payment_reversed: 'reversed a manual record',
  sui_payment_reconciled: 'reconciled a verified Sui receipt',
  milestone_created: 'added',
  milestone_in_progress: 'started',
  milestone_ready_for_review: 'submitted for review:',
  milestone_accepted: 'accepted',
  milestone_changes_requested: 'requested changes to',
};
export function ActivityFeed({
  projectId,
  events,
  hasMore,
  members,
  agreements,
  milestones,
  preview,
}: {
  projectId: string;
  events: ActivityEvent[];
  hasMore: boolean;
  members: Member[];
  agreements: Agreement[];
  milestones: Milestone[];
  preview: boolean;
}) {
  // A stable snapshot keeps keyset pages contiguous while workspace refreshes arrive.
  const [snapshot, setSnapshot] = useState({ events, hasMore });
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const latestChanged = events[0]?.id !== snapshot.events[0]?.id;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-normal tracking-[-.04em]">Activity</h2>
          <p className="mt-3 text-sm text-ash">Times shown in UTC.</p>
        </div>
        {latestChanged && (
          <button
            className={control.smallSecondary}
            onClick={() => {
              setSnapshot({ events, hasMore });
              setError('');
            }}
          >
            Show latest activity
          </button>
        )}
      </div>
      {!snapshot.events.length ? (
        <div className="rounded-2xl bg-slate p-10 text-center">
          <History className="mx-auto mb-4 text-ice" size={24} />
          <p className="text-sm text-ash">Project decisions will appear here.</p>
        </div>
      ) : (
        <ol className="divide-y divide-white/8 rounded-2xl bg-slate px-5 md:px-8">
          {snapshot.events.map((event) => {
            const actor =
              members.find((m) => m.user_id === event.actor_id)?.display_name || 'Project member';
            const agreement = agreements.find((a) => a.id === event.record_id);
            const milestone = milestones.find((m) => m.id === event.record_id);
            const record = agreement
              ? `version ${agreement.version} · ${agreement.title}`
              : milestone?.title;
            return (
              <li
                key={event.id}
                className="flex flex-col justify-between gap-3 py-6 sm:flex-row sm:gap-8"
              >
                <div className="min-w-0 text-sm leading-relaxed wrap-anywhere">
                  <span className="text-paper">{actor}</span>{' '}
                  <span className="text-ash">
                    {descriptions[event.kind] || 'updated the project'}
                    {record ? ` ${record}` : ''}.
                  </span>
                  {event.kind === 'agreement_activated' && (
                    <p className="mt-2 text-xs text-ice">
                      Both participants approved these exact terms.
                    </p>
                  )}
                </div>
                <time
                  dateTime={event.created_at}
                  className="shrink-0 text-[11px] tabular-nums text-ash"
                >
                  {new Date(event.created_at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {error && (
        <p className="mt-5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {snapshot.hasMore && (
        <button
          className={`${control.secondary} mt-6`}
          disabled={pending || preview}
          onClick={() =>
            startTransition(async () => {
              const cursor = snapshot.events.at(-1);
              if (!cursor) return;
              setError('');
              try {
                const result = await loadProjectActivity(projectId, {
                  time: cursor.created_at,
                  id: cursor.id,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setSnapshot((current) => ({
                  events: [
                    ...current.events,
                    ...(result.events || []).filter(
                      (e) => !current.events.some((old) => old.id === e.id),
                    ),
                  ],
                  hasMore: result.hasMore || false,
                }));
              } catch {
                setError('Activity could not be loaded. Please retry.');
              }
            })
          }
        >
          {pending ? 'Loading…' : 'Load earlier activity'}
        </button>
      )}
    </>
  );
}
