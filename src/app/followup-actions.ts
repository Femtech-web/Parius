'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { suggestFollowupClosing } from '@/lib/server/followups';
import { atomicAmount } from '@/lib/domain';
import { historyCursor, historyFilter, type HistoryCursor } from '@/lib/history';
import {
  composeFollowup,
  followupContext,
  DRAFT_COLUMNS,
  type PaymentPromise,
  type FollowupDraft,
} from '@/lib/followups';
import type { ActionResult } from './actions';
function readable(error: { code: string; message: string } | null) {
  return error?.code === 'P0001'
    ? error.message
    : 'The update could not be confirmed. Please retry.';
}
export async function readFollowups(
  invoiceId: string,
  cursor?: HistoryCursor,
): Promise<{
  promises?: PaymentPromise[];
  active?: PaymentPromise | null;
  draft?: FollowupDraft | null;
  hasMore?: boolean;
  error?: string;
}> {
  if (
    !z.uuid().safeParse(invoiceId).success ||
    (cursor && !historyCursor.safeParse(cursor).success)
  )
    return { error: 'Invalid invoice history.' };
  const { supabase, user } = await requireSession();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id,project_id')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { error: 'Invoice unavailable.' };
  let query = supabase.from('payment_promises').select('*').eq('invoice_id', invoiceId);
  if (cursor) query = query.or(historyFilter(cursor));
  const [promises, active, draft] = await Promise.all([
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21),
    supabase
      .from('payment_promises')
      .select('*')
      .eq('invoice_id', invoiceId)
      .in('status', ['reported', 'confirmed'])
      .maybeSingle(),
    supabase
      .from('payment_followups')
      .select(DRAFT_COLUMNS)
      .eq('invoice_id', invoiceId)
      .eq('owner_id', user.id)
      .eq('status', 'draft')
      .maybeSingle(),
  ]);
  if (promises.error || active.error || draft.error)
    return { error: 'Promises and drafts could not be loaded.' };
  return {
    promises: (promises.data || []).slice(0, 20) as PaymentPromise[],
    active: active.data as PaymentPromise | null,
    draft: draft.data as FollowupDraft | null,
    hasMore: (promises.data || []).length > 20,
  };
}
export async function recordPromise(
  invoiceId: string,
  amount: string,
  date: string,
  note: string,
  key: string,
  expected: string | null,
): Promise<ActionResult> {
  if (
    !z.uuid().safeParse(invoiceId).success ||
    !z.iso.date().safeParse(date).success ||
    !z.string().max(500).safeParse(note).success ||
    !z.uuid().safeParse(key).success ||
    !z.uuid().nullable().safeParse(expected).success
  )
    return { error: 'Check the promise amount and date.' };
  const { supabase } = await requireSession();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('decimals,project_id')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { error: 'Invoice unavailable.' };
  let atomic: string;
  try {
    atomic = atomicAmount(amount, invoice.decimals);
  } catch {
    return { error: 'Enter an exact amount in the invoice currency.' };
  }
  const { error } = await supabase.rpc('record_payment_promise', {
    p_invoice: invoiceId,
    p_amount: atomic,
    p_date: date,
    p_note: note,
    p_key: key,
    p_expected: expected,
  });
  if (error) return { error: readable(error) };
  revalidatePath(`/projects/${invoice.project_id}`);
  return { success: 'Payment promise saved. No payment was recorded or authorized.' };
}
export async function updatePromise(
  id: string,
  action: 'confirm' | 'withdraw' | 'fulfill',
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success || !['confirm', 'withdraw', 'fulfill'].includes(action))
    return { error: 'Invalid promise action.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('update_payment_promise', { p_id: id, p_action: action });
  if (error) return { error: readable(error) };
  const { data } = await supabase
    .from('payment_promises')
    .select('project_id')
    .eq('id', id)
    .single();
  if (data) revalidatePath(`/projects/${data.project_id}`);
  return {
    success:
      action === 'fulfill'
        ? 'Promise closed against recorded receipts. No new payment was created.'
        : action === 'confirm'
          ? 'Promise confirmed. This does not authorize a payment.'
          : 'Promise withdrawn. Invoice terms and balance are unchanged.',
  };
}
export async function prepareFollowup(
  invoiceId: string,
): Promise<ActionResult & { draft?: FollowupDraft }> {
  if (!z.uuid().safeParse(invoiceId).success) return { error: 'Invalid invoice.' };
  const { supabase } = await requireSession();
  const { data: claim, error } = await supabase.rpc('reserve_payment_followup', {
    p_invoice: invoiceId,
  });
  if (error || !claim) return { error: readable(error) };
  if (!claim.cached) {
    const parsed = followupContext.safeParse(claim.context);
    if (!parsed.success) return { error: 'Invoice facts could not be confirmed.' };
    let source = 'template',
      model: string | null = null,
      body = composeFollowup(parsed.data);
    try {
      const closing = await suggestFollowupClosing(parsed.data);
      body = composeFollowup(parsed.data, closing);
      source = 'groq';
      model = 'openai/gpt-oss-20b';
    } catch {
      /* A truthful, labelled template remains usable; no simulated AI success. */
    }
    const { error: saveError } = await privilegedClient().rpc('finish_payment_followup', {
      p_id: claim.id,
      p_token: claim.token,
      p_body: body,
      p_source: source,
      p_model: model,
    });
    if (saveError)
      return {
        error:
          'Invoice or promise changed while drafting. Refresh, discard the old draft and try again.',
      };
  }
  const { data: draft, error: readError } = await supabase
    .from('payment_followups')
    .select(DRAFT_COLUMNS)
    .eq('id', claim.id)
    .single();
  return readError || !draft
    ? { error: 'Draft could not be loaded.' }
    : {
        draft: draft as FollowupDraft,
        success:
          draft.revision === 0
            ? 'Draft is still being prepared. Refresh shortly.'
            : draft.source === 'groq'
              ? 'AI-assisted draft prepared for your review.'
              : 'Template draft prepared. AI assistance was unavailable.',
      };
}
export async function saveFollowup(
  id: string,
  revision: number,
  body: string,
): Promise<ActionResult> {
  if (
    !z.uuid().safeParse(id).success ||
    !z.number().int().positive().safeParse(revision).success ||
    !z.string().trim().min(1).max(2000).safeParse(body).success
  )
    return { error: 'Review a message of 1–2,000 characters.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('save_payment_followup', {
    p_id: id,
    p_revision: revision,
    p_body: body,
  });
  return error ? { error: readable(error) } : { success: 'Private draft saved.' };
}
export async function discardFollowup(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid draft.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('discard_payment_followup', { p_id: id });
  return error ? { error: readable(error) } : { success: 'Draft discarded.' };
}
export async function sendFollowup(
  id: string,
  revision: number,
  body: string,
  confirmed: boolean,
): Promise<ActionResult> {
  if (
    !z.uuid().safeParse(id).success ||
    !z.number().int().positive().safeParse(revision).success ||
    confirmed !== true ||
    !z.string().trim().min(1).max(2000).safeParse(body).success
  )
    return { error: 'Review the message and confirm before sending.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc('send_payment_followup', {
    p_id: id,
    p_revision: revision,
    p_body: body,
    p_confirm: confirmed,
  });
  if (error) return { error: readable(error) };
  const { data: draft } = await supabase
    .from('payment_followups')
    .select('project_id')
    .eq('id', id)
    .single();
  if (draft) revalidatePath(`/projects/${draft.project_id}`);
  return {
    success: data
      ? 'Follow-up sent to the project conversation.'
      : 'The send could not be confirmed.',
  };
}
