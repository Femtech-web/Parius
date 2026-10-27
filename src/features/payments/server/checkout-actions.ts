'use server';
import { paymentNetworkEnabled } from '../networks';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import {
  buildCheckout,
  broadcastCheckout,
  buildClient,
  checkoutFailureEvidence,
} from '@/features/payments/server/checkout';
import {
  verifyCheckoutSignature,
  type Checkout,
  type PrivateCheckout,
  type GasMode,
} from '@/features/payments/checkout';
import type { ActionResult } from '@/lib/action-result';
import { verifyPayment } from '@/features/payments/server/payment-actions';

function publicPlan(plan: PrivateCheckout): Checkout {
  const { bytes: _bytes, lease_token: _lease, request_expires_at: _expiry, ...metadata } = plan;
  void _bytes;
  void _lease;
  void _expiry;
  return metadata;
}
export async function readCheckout(request: string): Promise<{ plan?: Checkout; error?: string }> {
  if (!z.uuid().safeParse(request).success) return { error: 'Invalid payment instructions.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from('payment_checkouts')
    .select('*')
    .eq('request_id', request)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return error
    ? { error: 'In-app payments are being connected. Receipt verification remains available.' }
    : { plan: data ?? undefined };
}
export async function prepareCheckout(
  request: string,
  mode: GasMode,
): Promise<{ plan?: Checkout; error?: string }> {
  if (!z.uuid().safeParse(request).success || !['wallet', 'sponsored'].includes(mode))
    return { error: 'Check the payment instructions.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc('reserve_payment_checkout', {
    p_request: request,
    p_mode: mode,
  });
  if (error || !data)
    return {
      error: error?.code === 'P0001' ? error.message : 'Payment preparation is not available yet.',
    };
  const plan = data as PrivateCheckout;
  if (plan.status !== 'building') return { plan: publicPlan(plan) };
  const service = privilegedClient();
  try {
    const prepared = await buildCheckout(plan);
    const { error: saveError } = await service.rpc('finish_payment_preparation', {
      p_id: plan.id,
      p_token: plan.lease_token,
      p_bytes: prepared.bytes,
      p_digest: prepared.digest,
      p_budget: prepared.gasBudget,
      p_epoch: prepared.expiresEpoch,
    });
    if (saveError) throw new Error('preparation_unavailable');
    revalidatePath(`/projects/${plan.project_id}`);
    return {
      plan: publicPlan({
        ...plan,
        status: 'ready',
        bytes: prepared.bytes,
        digest: prepared.digest,
        gas_budget: prepared.gasBudget,
        expires_epoch: prepared.expiresEpoch,
      }),
    };
  } catch {
    await service.rpc('finish_payment_preparation', {
      p_id: plan.id,
      p_token: plan.lease_token,
      p_bytes: null,
      p_digest: null,
      p_budget: null,
      p_epoch: null,
      p_failed: true,
    });
    return {
      error:
        plan.mode === 'sponsored'
          ? 'Gas sponsorship could not be prepared. No payment was sent. Check your USDC balance or explicitly choose wallet-paid gas and retry.'
          : 'Payment simulation could not pass. No payment was sent. Check the wallet’s USDC and SUI balances, then retry.',
    };
  }
}
export async function checkoutSigningBytes(
  id: string,
): Promise<{ bytes?: string; error?: string }> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid payment.' };
  const { user } = await requireSession();
  const { data, error } = await privilegedClient().rpc('read_payment_checkout', {
    p_id: id,
    p_owner: user.id,
  });
  const plan = data as PrivateCheckout | null;
  if (
    error ||
    !plan ||
    !['ready', 'uncertain'].includes(plan.status) ||
    !plan.bytes ||
    !paymentNetworkEnabled(plan.network)
  )
    return { error: 'Resume the receipt check for this payment.' };
  return { bytes: plan.bytes };
}
export async function submitCheckout(
  id: string,
  bytes: string,
  signature: string,
): Promise<ActionResult> {
  if (
    !z.uuid().safeParse(id).success ||
    !z.string().min(20).max(32768).safeParse(bytes).success ||
    !z.string().min(20).max(32768).safeParse(signature).success
  )
    return { error: 'Invalid signed payment.' };
  const { user } = await requireSession();
  const service = privilegedClient();
  const { data, error } = await service.rpc('read_payment_checkout', {
    p_id: id,
    p_owner: user.id,
  });
  const plan = data as PrivateCheckout | null;
  if (
    error ||
    !plan ||
    !['ready', 'uncertain'].includes(plan.status) ||
    !paymentNetworkEnabled(plan.network)
  )
    return { error: 'Check the saved receipt before attempting another payment.' };
  try {
    await verifyCheckoutSignature(plan, bytes, signature, buildClient(plan.network));
  } catch {
    return {
      error:
        'The wallet signature or transaction differs from the reviewed payment. Nothing was submitted by this request.',
    };
  }
  const { error: authorizationError } = await service.rpc('authorize_payment_submission', {
    p_id: id,
    p_owner: user.id,
  });
  if (authorizationError)
    return {
      error:
        authorizationError.code === 'P0001'
          ? authorizationError.message
          : 'Payment authorization could not be confirmed. Check the saved digest before retrying.',
    };
  try {
    await broadcastCheckout(plan, signature);
    const { error: saveError } = await service.rpc('mark_payment_submitted', { p_id: id });
    if (saveError) throw new Error('unknown_outcome');
    revalidatePath(`/projects/${plan.project_id}`);
    return {
      success:
        'Signed payment submitted. Check this saved digest with Tatum; the invoice is not credited yet.',
    };
  } catch {
    revalidatePath(`/projects/${plan.project_id}`);
    return {
      error:
        'The submission result is uncertain. Check the saved digest with Tatum first. Retrying this payment uses the same transaction, never a new transfer.',
    };
  }
}
export async function checkCheckout(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid payment.' };
  const { supabase } = await requireSession();
  const { data } = await supabase.from('payment_checkouts').select('*').eq('id', id).single();
  if (!data?.digest) return { error: 'Prepare the payment first.' };
  try {
    const evidence = await checkoutFailureEvidence(data as PrivateCheckout);
    if (evidence) {
      const { error } = await privilegedClient().rpc('resolve_checkout_failure', {
        p_id: id,
        p_proof: evidence,
      });
      if (!error) {
        revalidatePath(`/projects/${data.project_id}`);
        return {
          success:
            evidence.kind === 'failed_transaction'
              ? 'Tatum confirmed this transaction failed. No USDC was transferred; network gas may have been charged. You may prepare a new payment.'
              : 'The unused payment expired before submission. You may prepare a fresh payment.',
        };
      }
    }
  } catch {
    /* Keep the reservation; the regular verifier can still retry this digest. */
  }
  return verifyPayment(data.project_id, data.request_id, data.digest);
}
