import {
  displayAmount,
  type Agreement,
  type Approval,
  type AgreementResolution,
} from '@/lib/domain';

export type AgreementState = 'active' | 'previous' | 'pending' | 'stale' | 'rejected' | 'withdrawn';
export function agreementState(
  agreement: Agreement,
  activeId: string | null,
  approvals: Approval[],
  resolution?: AgreementResolution,
): AgreementState {
  if (agreement.id === activeId) return 'active';
  if (resolution) return resolution.kind;
  const pair = approvals.filter((approval) => approval.agreement_id === agreement.id);
  if (
    pair.some((a) => a.role === 'client') &&
    pair.some((a) => a.role === 'freelancer') &&
    new Set(pair.map((a) => a.actor_id)).size === 2
  )
    return 'previous';
  return agreement.base_version_id === activeId ? 'pending' : 'stale';
}
export const agreementStateLabel: Record<AgreementState, string> = {
  active: 'Active agreement',
  previous: 'Previous agreement',
  pending: 'Awaiting approvals',
  stale: 'Needs a new proposal',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
export type AgreementChange = { field: string; before: string; after: string };
export function compareAgreements(base: Agreement, next: Agreement): AgreementChange[] {
  const changes: AgreementChange[] = [];
  if (base.title !== next.title)
    changes.push({ field: 'Agreement title', before: base.title, after: next.title });
  if (base.scope !== next.scope)
    changes.push({ field: 'Scope and conditions', before: base.scope, after: next.scope });
  if (
    base.currency !== next.currency ||
    base.decimals !== next.decimals ||
    BigInt(base.amount_atomic) !== BigInt(next.amount_atomic)
  )
    changes.push({
      field: 'Total price',
      before: displayAmount(base.amount_atomic, base.currency, base.decimals),
      after: displayAmount(next.amount_atomic, next.currency, next.decimals),
    });
  if (base.revision_limit !== next.revision_limit)
    changes.push({
      field: 'Included revision rounds',
      before: String(base.revision_limit),
      after: String(next.revision_limit),
    });
  return changes;
}
// Form values remain exact decimal strings, never rounded through Number.
export function editableAmount(agreement: Agreement): string {
  const atomic = BigInt(agreement.amount_atomic),
    unit = 10n ** BigInt(agreement.decimals);
  const fraction = (atomic % unit).toString().padStart(agreement.decimals, '0').replace(/0+$/, '');
  return `${atomic / unit}${agreement.decimals && fraction ? '.' + fraction : ''}`;
}
