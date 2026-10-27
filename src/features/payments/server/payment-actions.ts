'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { verifyTatumReceipt } from '@/lib/server/tatum';
import { atomicAmount } from '@/lib/domain';
import { addressInput, digestInput, type Invoice } from '@/features/payments/domain';
import type { ActionResult } from '@/lib/action-result';
const uuid = z.uuid();
function readable(code: string, message: string) {
  return code === 'P0001' ? message : 'The update could not be saved. Please retry.';
}
export async function draftInvoice(
  projectId: string,
  agreementId: string,
  title: string,
  amount: string,
  due: string,
  milestone: string | null,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(projectId).success ||
    !uuid.safeParse(agreementId).success ||
    !z.string().trim().min(3).max(150).safeParse(title).success ||
    (due && !z.iso.date().safeParse(due).success) ||
    (milestone && !uuid.safeParse(milestone).success)
  )
    return { error: 'Check the invoice details.' };
  const { supabase } = await requireSession();
  const { data: agreement } = await supabase
    .from('agreement_versions')
    .select('decimals')
    .eq('project_id', projectId)
    .eq('id', agreementId)
    .single();
  if (!agreement) return { error: 'Approved agreement not found.' };
  let atomic: string;
  try {
    atomic = atomicAmount(amount, agreement.decimals);
  } catch {
    return { error: 'Enter an exact amount in the agreement currency.' };
  }
  const { error } = await supabase.rpc('draft_invoice', {
    p_project: projectId,
    p_agreement: agreementId,
    p_title: title,
    p_amount: atomic,
    p_due: due || null,
    p_milestone: milestone,
  });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Private invoice draft saved. Review it before issuing.' };
}
export async function issueInvoice(
  projectId: string,
  id: string,
  recipient: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success)
    return { error: 'Invalid invoice.' };
  const parsed = recipient.trim() ? addressInput.safeParse(recipient) : null;
  if (parsed && !parsed.success) return { error: 'Enter a valid Sui recipient address.' };
  const network = parsed?.success ? process.env.NEXT_PUBLIC_SUI_NETWORK : null;
  if (network && network !== 'testnet' && network !== 'mainnet')
    return { error: 'Sui network is not configured.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('issue_invoice', {
    p_id: id,
    p_network: network,
    p_recipient: parsed?.success ? parsed.data : null,
  });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Invoice issued to your client.' };
}
export async function voidInvoice(projectId: string, id: string): Promise<ActionResult> {
  return simple(projectId, id, 'void_invoice', 'Invoice voided.');
}
export async function reverseManualPayment(projectId: string, id: string): Promise<ActionResult> {
  return simple(
    projectId,
    id,
    'reverse_manual_payment',
    'Manual record reversed. No refund was sent.',
  );
}
async function simple(
  projectId: string,
  id: string,
  rpc: string,
  success: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success)
    return { error: 'Invalid record.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc(rpc, { p_id: id });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success };
}
export async function recordManualPayment(
  projectId: string,
  invoiceId: string,
  amount: string,
  note: string,
  paidAt: string,
  key: string,
): Promise<ActionResult> {
  if (
    ![projectId, invoiceId, key].every((x) => uuid.safeParse(x).success) ||
    !z.string().max(500).safeParse(note).success ||
    !z.iso.date().safeParse(paidAt).success
  )
    return { error: 'Check the amount, received date and note.' };
  const { supabase } = await requireSession();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('decimals')
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .single();
  if (!invoice) return { error: 'Invoice not found.' };
  let atomic: string;
  try {
    atomic = atomicAmount(amount, invoice.decimals);
  } catch {
    return { error: 'Enter an exact received amount.' };
  }
  const { error } = await supabase.rpc('record_manual_payment', {
    p_invoice: invoiceId,
    p_amount: atomic,
    p_note: note,
    p_paid_at: `${paidAt}T00:00:00Z`,
    p_key: key,
  });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Manual receipt recorded. It is not blockchain verified.' };
}
export async function preparePaymentRequest(
  projectId: string,
  invoiceId: string,
  payer: string,
  amount: string,
): Promise<ActionResult> {
  const address = addressInput.safeParse(payer);
  if (!address.success || ![projectId, invoiceId].every((x) => uuid.safeParse(x).success))
    return { error: 'Check the sender address and invoice.' };
  let atomic: string;
  try {
    atomic = atomicAmount(amount, 6);
  } catch {
    return { error: 'Enter an exact USDC amount.' };
  }
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('prepare_payment_request', {
    p_invoice: invoiceId,
    p_payer: address.data,
    p_amount: atomic,
  });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Instructions confirmed for 24 hours. No transfer has been signed or sent.' };
}
export async function verifyPayment(
  projectId: string,
  requestId: string,
  digest: string,
): Promise<ActionResult> {
  const parsed = digestInput.safeParse(digest);
  if (!parsed.success || ![projectId, requestId].every((x) => uuid.safeParse(x).success))
    return { error: 'Enter a valid transaction digest.' };
  const { supabase } = await requireSession();
  const { data: request } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .eq('project_id', projectId)
    .single();
  if (!request) return { error: 'Payment request not found.' };
  const { data: row } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', request.invoice_id)
    .eq('project_id', projectId)
    .single();
  const invoice = row as Invoice | null;
  if (!invoice?.recipient || !invoice.network || !invoice.coin_type)
    return { error: 'Sui instructions are unavailable.' };
  const { data: claim, error } = await supabase.rpc('reserve_payment_check', {
    p_request: requestId,
    p_digest: parsed.data,
  });
  if (error) return { error: readable(error.code, error.message) };
  if (claim.cached) {
    revalidatePath(`/projects/${projectId}`);
    return { success: 'The saved receipt check is shown below.' };
  }
  try {
    const proof = await verifyTatumReceipt({
      network: invoice.network,
      digest: parsed.data,
      payer: request.payer,
      recipient: invoice.recipient,
      coinType: invoice.coin_type,
      amountAtomic: request.amount_atomic,
      createdAt: request.created_at,
      expiresAt: request.expires_at,
    });
    const { error: saveError } = await privilegedClient().rpc('finish_payment_check', {
      p_id: claim.id,
      p_token: claim.lease_token,
      p_proof: proof,
      p_reason: null,
    });
    if (saveError) throw new Error('provider_unavailable');
    revalidatePath(`/projects/${projectId}`);
    return {
      success:
        'Tatum matched the receipt. Your freelancer must reconcile it before it counts toward the invoice.',
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const mismatch = [
      'network_mismatch',
      'unsettled_transaction',
      'payer_mismatch',
      'outside_request_window',
      'unsupported_transfer',
      'amount_or_recipient_mismatch',
    ].includes(code);
    const reason =
      code === 'network_identity_unavailable'
        ? 'network_identity_unavailable'
        : mismatch
          ? 'mismatch'
          : 'provider_unavailable';
    await privilegedClient().rpc('finish_payment_check', {
      p_id: claim.id,
      p_token: claim.lease_token,
      p_proof: null,
      p_reason: reason,
    });
    revalidatePath(`/projects/${projectId}`);
    return {
      error:
        reason === 'network_identity_unavailable'
          ? 'Tatum could not supply the required network identity. This receipt remains pending; no payment was credited.'
          : mismatch
            ? 'The transaction does not match these payment instructions. No payment was credited.'
            : 'The receipt could not be verified yet. Retry this digest before sending another transfer.',
    };
  }
}
export async function reconcileReceipt(
  projectId: string,
  claimId: string,
  replaceManual: string | null,
): Promise<ActionResult> {
  if (
    ![projectId, claimId].every((x) => uuid.safeParse(x).success) ||
    (replaceManual && !uuid.safeParse(replaceManual).success)
  )
    return { error: 'Invalid receipt.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('reconcile_verified_receipt', {
    p_claim: claimId,
    p_replace_manual: replaceManual,
  });
  if (error) return { error: readable(error.code, error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: 'Verified receipt reconciled. No money was transferred.' };
}
