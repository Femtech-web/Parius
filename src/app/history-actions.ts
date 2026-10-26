'use server';
import { z } from 'zod';
import { requireSession } from '@/lib/server/session';
import { historyCursor, historyFilter, type HistoryCursor } from '@/lib/history';
import type { Message } from '@/lib/domain';
import type {
  Invoice,
  InvoiceBalance,
  PaymentRecord,
  PaymentRequest,
  PaymentClaim,
} from '@/lib/payments';
const claimColumns = 'id,project_id,request_id,digest,status,reason,proof,created_at';
export type InvoicePage = { invoices: Invoice[]; balances: InvoiceBalance[]; hasMore: boolean };
export type InvoiceHistory = {
  records: PaymentRecord[];
  requests: PaymentRequest[];
  claims: PaymentClaim[];
  recordsMore: boolean;
  requestsMore: boolean;
  claimsMore: Record<string, boolean>;
};
const valid = (id: string, cursor?: HistoryCursor) =>
  z.uuid().safeParse(id).success && (!cursor || historyCursor.safeParse(cursor).success);
export async function readMessages(
  projectId: string,
  cursor: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<{ messages?: Message[]; hasMore?: boolean; error?: string }> {
  if (!valid(projectId, cursor) || !['older', 'newer'].includes(direction))
    return { error: 'Invalid message page.' };
  const { supabase } = await requireSession();
  const asc = direction === 'newer';
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', projectId)
    .or(historyFilter(cursor, direction))
    .order('created_at', { ascending: asc })
    .order('id', { ascending: asc })
    .limit(101);
  return error
    ? { error: 'Messages could not be loaded. Please retry.' }
    : { messages: (data || []).slice(0, 100) as Message[], hasMore: (data || []).length > 100 };
}
export async function readInvoicePage(
  projectId: string,
  cursor?: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<InvoicePage & { error?: string }> {
  if (!valid(projectId, cursor) || !['older', 'newer'].includes(direction))
    return { invoices: [], balances: [], hasMore: false, error: 'Invalid invoice page.' };
  const { supabase } = await requireSession();
  let query = supabase.from('invoices').select('*').eq('project_id', projectId);
  if (cursor) query = query.or(historyFilter(cursor, direction));
  const { data, error } = await query
    .order('created_at', { ascending: direction === 'newer' })
    .order('id', { ascending: direction === 'newer' })
    .limit(26);
  if (error)
    return { invoices: [], balances: [], hasMore: false, error: 'Invoices could not be loaded.' };
  const invoices = (data || []).slice(0, 25) as Invoice[];
  const { data: balances, error: balanceError } = invoices.length
    ? await supabase
        .from('invoice_balances')
        .select('*')
        .eq('project_id', projectId)
        .in(
          'invoice_id',
          invoices.map((i) => i.id),
        )
    : { data: [], error: null };
  return {
    invoices,
    balances: (balances || []) as InvoiceBalance[],
    hasMore: (data || []).length > 25,
    ...(balanceError ? { error: 'Invoice balances could not be confirmed.' } : {}),
  };
}
export async function refreshInvoices(
  projectId: string,
  ids: string[],
): Promise<{ invoices?: Invoice[]; balances?: InvoiceBalance[]; error?: string }> {
  if (
    !z.uuid().safeParse(projectId).success ||
    !z.array(z.uuid()).min(1).max(50).safeParse(ids).success
  )
    return { error: 'Invalid invoice selection.' };
  const { supabase } = await requireSession();
  const [invoices, balances] = await Promise.all([
    supabase.from('invoices').select('*').eq('project_id', projectId).in('id', ids),
    supabase.from('invoice_balances').select('*').eq('project_id', projectId).in('invoice_id', ids),
  ]);
  return invoices.error || balances.error
    ? { error: 'Invoice balances could not be refreshed.' }
    : { invoices: invoices.data as Invoice[], balances: balances.data as InvoiceBalance[] };
}
export async function readInvoiceRecords(
  invoiceId: string,
  cursor?: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<{ records?: PaymentRecord[]; hasMore?: boolean; error?: string }> {
  if (!valid(invoiceId, cursor) || !['older', 'newer'].includes(direction))
    return { error: 'Invalid receipt page.' };
  const { supabase } = await requireSession();
  // Check visibility of the invoice as well as the member-protected receipt table.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { error: 'Invoice unavailable.' };
  let query = supabase.from('payment_records').select('*').eq('invoice_id', invoiceId);
  if (cursor) query = query.or(historyFilter(cursor, direction));
  const { data, error } = await query
    .order('created_at', { ascending: direction === 'newer' })
    .order('id', { ascending: direction === 'newer' })
    .limit(26);
  return error
    ? { error: 'Receipts could not be loaded.' }
    : { records: (data || []).slice(0, 25) as PaymentRecord[], hasMore: (data || []).length > 25 };
}
export async function readRequestClaims(
  requestId: string,
  cursor?: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<{ claims?: PaymentClaim[]; hasMore?: boolean; error?: string }> {
  if (!valid(requestId, cursor) || !['older', 'newer'].includes(direction))
    return { error: 'Invalid verification page.' };
  const { supabase } = await requireSession();
  const { data: request } = await supabase
    .from('payment_requests')
    .select('invoice_id')
    .eq('id', requestId)
    .single();
  if (!request) return { error: 'Payment instructions unavailable.' };
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', request.invoice_id)
    .single();
  if (!invoice) return { error: 'Invoice unavailable.' };
  let query = supabase.from('payment_claims').select(claimColumns).eq('request_id', requestId);
  if (cursor) query = query.or(historyFilter(cursor, direction));
  const { data, error } = await query
    .order('created_at', { ascending: direction === 'newer' })
    .order('id', { ascending: direction === 'newer' })
    .limit(6);
  return error
    ? { error: 'Verification history could not be loaded.' }
    : { claims: (data || []).slice(0, 5) as PaymentClaim[], hasMore: (data || []).length > 5 };
}
export async function readInvoiceRequests(
  invoiceId: string,
  cursor?: HistoryCursor,
  direction: 'older' | 'newer' = 'older',
): Promise<{
  requests?: PaymentRequest[];
  claims?: PaymentClaim[];
  claimsMore?: Record<string, boolean>;
  hasMore?: boolean;
  error?: string;
}> {
  if (!valid(invoiceId, cursor) || !['older', 'newer'].includes(direction))
    return { error: 'Invalid payment instruction page.' };
  const { supabase } = await requireSession();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { error: 'Invoice unavailable.' };
  let query = supabase.from('payment_requests').select('*').eq('invoice_id', invoiceId);
  if (cursor) query = query.or(historyFilter(cursor, direction));
  const { data, error } = await query
    .order('created_at', { ascending: direction === 'newer' })
    .order('id', { ascending: direction === 'newer' })
    .limit(11);
  if (error) return { error: 'Payment instructions could not be loaded.' };
  const requests = (data || []).slice(0, 10) as PaymentRequest[];
  // Limit each request independently: one old request with many attempts cannot hide another's proof.
  const pages = await Promise.all(
    requests.map(async (request) => {
      const result = await supabase
        .from('payment_claims')
        .select(claimColumns)
        .eq('request_id', request.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(6);
      return { id: request.id, ...result };
    }),
  );
  if (pages.some((p) => p.error)) return { error: 'Verification history could not be confirmed.' };
  return {
    requests,
    claims: pages.flatMap((p) => (p.data || []).slice(0, 5)) as PaymentClaim[],
    claimsMore: Object.fromEntries(pages.map((p) => [p.id, (p.data || []).length > 5])),
    hasMore: (data || []).length > 10,
  };
}
export async function readInvoiceHistory(
  invoiceId: string,
): Promise<{ history?: InvoiceHistory; error?: string }> {
  if (!z.uuid().safeParse(invoiceId).success) return { error: 'Invalid invoice.' };
  const [records, requests] = await Promise.all([
    readInvoiceRecords(invoiceId),
    readInvoiceRequests(invoiceId),
  ]);
  if (records.error || requests.error) return { error: records.error || requests.error };
  return {
    history: {
      records: records.records || [],
      requests: requests.requests || [],
      claims: requests.claims || [],
      recordsMore: Boolean(records.hasMore),
      requestsMore: Boolean(requests.hasMore),
      claimsMore: requests.claimsMore || {},
    },
  };
}
// Refresh already loaded mutable rows without collapsing their older pages.
export async function refreshHistoryRows(
  projectId: string,
  table: 'payment_records' | 'payment_requests' | 'payment_claims',
  ids: string[],
): Promise<{ rows?: PaymentRecord[] | PaymentRequest[] | PaymentClaim[]; error?: string }> {
  if (
    !z.uuid().safeParse(projectId).success ||
    !['payment_records', 'payment_requests', 'payment_claims'].includes(table) ||
    !z.array(z.uuid()).min(1).max(100).safeParse(ids).success
  )
    return { error: 'Invalid history selection.' };
  const { supabase } = await requireSession();
  const query =
    table === 'payment_claims'
      ? supabase.from('payment_claims').select(claimColumns)
      : supabase.from(table).select('*');
  const { data, error } = await query.eq('project_id', projectId).in('id', ids);
  return error
    ? { error: 'Payment history could not be refreshed.' }
    : { rows: data as PaymentRecord[] | PaymentRequest[] | PaymentClaim[] };
}
