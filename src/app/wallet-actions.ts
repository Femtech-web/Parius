'use server';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import { addressInput } from '@/lib/payments';
import {
  walletNetwork,
  walletOrigin,
  walletChallengeMessage,
  verifyWalletChallenge,
  type WalletChallenge,
  type WalletBinding,
} from '@/lib/wallets';
import type { ActionResult } from './actions';

async function context() {
  const network = walletNetwork(process.env.NEXT_PUBLIC_SUI_NETWORK);
  const origin = walletOrigin(
    process.env.NEXT_PUBLIC_APP_URL,
    (await headers()).get('origin'),
    process.env.NODE_ENV === 'development',
  );
  return { network, origin };
}
export async function readWalletBindings(): Promise<{
  bindings?: WalletBinding[];
  error?: string;
}> {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from('wallet_bindings')
    .select('id,address,network,verified_at')
    .is('revoked_at', null)
    .order('verified_at', { ascending: false });
  return error
    ? { error: 'Wallet linking is not available yet. Your workspace remains available.' }
    : { bindings: data ?? [] };
}
export async function beginWalletLink(
  address: string,
): Promise<{ id?: string; message?: string; error?: string }> {
  const parsed = addressInput.safeParse(address);
  if (!parsed.success) return { error: 'Connect a valid Sui wallet first.' };
  const { user } = await requireSession();
  try {
    const { network, origin } = await context();
    const { data, error } = await privilegedClient().rpc('begin_wallet_challenge', {
      p_owner: user.id,
      p_address: parsed.data,
      p_network: network,
      p_origin: origin,
    });
    if (error || !data)
      return {
        error:
          error?.code === 'P0001'
            ? error.message
            : 'Wallet linking is not available yet. Please retry later.',
      };
    const challenge = data as WalletChallenge;
    return { id: challenge.id, message: walletChallengeMessage(challenge) };
  } catch {
    return { error: 'Wallet verification could not start. Check the app URL and retry.' };
  }
}
export async function completeWalletLink(id: string, signature: string): Promise<ActionResult> {
  if (
    !z.uuid().safeParse(id).success ||
    !z.string().min(20).max(32768).safeParse(signature).success
  )
    return { error: 'Invalid wallet signature.' };
  const { user } = await requireSession();
  try {
    const { network, origin } = await context();
    const service = privilegedClient();
    const { data, error } = await service.rpc('read_wallet_challenge', {
      p_id: id,
      p_owner: user.id,
    });
    if (error || !data) return { error: 'Wallet challenge not found. Request a new signature.' };
    // Standard signatures verify locally. zkLogin signatures use the official
    // Sui verifier for current JWK/epoch checks; Tatum remains the receipt reader.
    const client = new SuiGrpcClient({
      network,
      baseUrl: `https://fullnode.${network}.sui.io:443`,
    });
    await verifyWalletChallenge(
      data as WalletChallenge,
      signature,
      { owner: user.id, origin, network },
      client,
    );
    const { error: completionError } = await service.rpc('complete_wallet_challenge', {
      p_id: id,
      p_owner: user.id,
      p_signature_hash: createHash('sha256').update(signature).digest('hex'),
    });
    if (completionError)
      return { error: 'Wallet challenge expired or was already used. Request a new signature.' };
    return { success: 'Wallet ownership verified. Payments still require your separate approval.' };
  } catch {
    return {
      error: 'Ownership could not be verified. No wallet was linked. Please reconnect and retry.',
    };
  }
}
export async function unlinkWallet(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid wallet.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('unlink_wallet', { p_id: id });
  return error
    ? { error: 'The wallet could not be unlinked. Please retry.' }
    : { success: 'Wallet unlinked. Existing invoices and receipts are unchanged.' };
}
