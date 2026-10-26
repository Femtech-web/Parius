import { z } from 'zod';
import { displayAmount } from './domain';
export const followupContext = z.object({
  invoice: z.object({
    id: z.uuid(),
    title: z.string().max(150),
    currency: z.string().max(8),
    decimals: z.number().int().min(0).max(6),
    due_date: z.iso.date().nullable(),
    status: z.literal('issued'),
  }),
  paid: z.string().regex(/^\d+$/),
  outstanding: z.string().regex(/^\d+$/),
  promise: z
    .object({
      id: z.uuid(),
      amount_atomic: z.string().regex(/^\d+$/),
      promised_date: z.iso.date(),
      status: z.enum(['reported', 'confirmed']),
      note: z.string().max(500),
    })
    .nullable(),
});
export type FollowupContext = z.infer<typeof followupContext>;
export const closingSchema = z.object({ closing: z.string().trim().min(15).max(240) }).strict();
export function checkedClosing(input: unknown) {
  const { closing } = closingSchema.parse(input);
  if (/[\p{N}$€£]|https?:|www\.|\n/iu.test(closing))
    throw new Error('The suggested closing included unsupported details.');
  return closing;
}
export function composeFollowup(
  context: FollowupContext,
  closing = 'Could you share an update on when you expect to send the payment?',
) {
  const c = followupContext.parse(context);
  if (BigInt(c.outstanding) <= 0n) throw new Error('No outstanding balance.');
  const amount = displayAmount(c.outstanding, c.invoice.currency, c.invoice.decimals);
  const lines = [
    `Hi, I’m following up on “${c.invoice.title}”. The recorded outstanding balance is ${amount}.`,
  ];
  if (c.invoice.due_date) lines.push(`The invoice due date is ${c.invoice.due_date}.`);
  if (c.promise) {
    const promiseAmount = displayAmount(
      c.promise.amount_atomic,
      c.invoice.currency,
      c.invoice.decimals,
    );
    lines.push(
      c.promise.status === 'confirmed'
        ? `You confirmed a payment of ${promiseAmount} for ${c.promise.promised_date}.`
        : `A payment of ${promiseAmount} for ${c.promise.promised_date} is recorded as unconfirmed.`,
    );
  }
  return [...lines, closing].join('\n\n');
}
export type PaymentPromise = {
  id: string;
  project_id: string;
  invoice_id: string;
  created_by: string;
  recorded_role: 'freelancer' | 'client';
  amount_atomic: string;
  promised_date: string;
  note: string;
  status: 'reported' | 'confirmed' | 'fulfilled' | 'withdrawn' | 'superseded';
  paid_baseline: string;
  created_at: string;
  confirmed_at: string | null;
  closed_at: string | null;
};
export type FollowupDraft = {
  id: string;
  invoice_id: string;
  body: string;
  revision: number;
  context: FollowupContext;
  status: 'draft' | 'sent' | 'discarded';
  source: 'template' | 'groq' | null;
  model: string | null;
  message_id: string | null;
  updated_at: string;
};
export const DRAFT_COLUMNS =
  'id,invoice_id,body,revision,context,status,source,model,message_id,updated_at';
