import { z } from 'zod';
export const projectInput = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000),
  client_name: z.string().trim().min(2).max(100),
});
export const agreementInput = z.object({
  title: z.string().trim().min(3).max(150),
  scope: z.string().trim().min(20).max(12000),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, 'Enter an exact positive amount.'),
  currency: z.enum(['USDC', 'USD', 'NGN']),
  revision_limit: z.coerce.number().int().min(0).max(100),
});
export function atomicAmount(value: string, decimals: number): string {
  if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid amount.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || !/^\d+(\.\d+)?$/.test(value))
    throw new Error('Invalid amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0')
  ).toString();
}
export function displayAmount(atomic: string, currency: string, decimals: number) {
  const amount = BigInt(atomic);
  const unit = 10n ** BigInt(decimals);
  const whole = (amount / unit).toLocaleString('en-US');
  const fraction = (amount % unit).toString().padStart(decimals, '0');
  return `${currency === 'NGN' ? '₦' : '$'}${whole}${decimals ? '.' + fraction.slice(0, Math.max(2, fraction.replace(/0+$/, '').length)) : ''}${currency === 'USDC' ? ' USDC' : ''}`;
}
export function safeNext(value: string | null) {
  return value && /^\/(dashboard|projects|invite)(\/|$)/.test(value) && !value.includes('\\')
    ? value
    : '/dashboard';
}
export type Project = {
  id: string;
  name: string;
  description: string;
  client_name: string;
  created_at: string;
  active_agreement_id: string | null;
};
export type Message = {
  id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  source: string;
};
export type Agreement = {
  id: string;
  project_id: string;
  title: string;
  scope: string;
  amount_atomic: string;
  decimals: number;
  currency: string;
  revision_limit: number;
  version: number;
  base_version_id: string | null;
  created_at: string;
};
export type Approval = { agreement_id: string; actor_id: string; role: string; created_at: string };
export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  state: 'planned' | 'in_progress' | 'ready_for_review' | 'accepted' | 'changes_requested';
  created_at: string;
};
export type Member = { user_id: string; role: 'freelancer' | 'client'; display_name: string };

export type AgreementResolution = {
  project_id: string;
  agreement_id: string;
  actor_id: string;
  kind: 'rejected' | 'withdrawn';
  reason: string | null;
  created_at: string;
};
export type ActivityEvent = {
  id: string;
  project_id: string;
  actor_id: string;
  kind: string;
  record_id: string | null;
  created_at: string;
};
