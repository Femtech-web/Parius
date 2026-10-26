import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { verifyTransactionSignature } from '@mysten/sui/verify';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { WalletNetwork } from './wallets';

export const MAX_GAS_BUDGET = 50_000_000n;
export type GasMode = 'wallet' | 'sponsored';
export type Checkout = {
  id: string;
  request_id: string;
  project_id: string;
  invoice_id: string;
  owner_id: string;
  mode: GasMode;
  status: 'building' | 'ready' | 'uncertain' | 'submitted' | 'verified' | 'credited' | 'failed';
  network: WalletNetwork;
  payer: string;
  recipient: string;
  amount_atomic: string;
  coin_type: string;
  digest: string | null;
  gas_budget: string | null;
  expires_epoch: string | null;
  created_at: string;
  reason: string | null;
};
export type PrivateCheckout = Checkout & {
  bytes: string | null;
  lease_token: string;
  request_expires_at: string;
};

/** Check the sponsor has changed only gas/expiration, never the payment kind. */
export async function inspectPreparedPayment(
  bytes: string,
  expectedKind: Uint8Array,
  payer: string,
  mode: GasMode,
  currentEpoch: bigint,
) {
  const tx = Transaction.from(bytes),
    data = tx.getData();
  const kind = await tx.build({ onlyTransactionKind: true });
  if (toBase64(kind) !== toBase64(expectedKind) || data.sender !== payer)
    throw new Error('payment_changed');
  const gas = data.gasData;
  if (
    !gas.budget ||
    BigInt(gas.budget) <= 0n ||
    BigInt(gas.budget) > MAX_GAS_BUDGET ||
    !gas.owner ||
    (mode === 'wallet' ? gas.owner !== payer : gas.owner === payer)
  )
    throw new Error('invalid_gas');
  const expiry = data.expiration;
  const epoch = expiry?.Epoch ?? expiry?.ValidDuring?.maxEpoch ?? expiry?.Validity?.maxEpoch;
  if (
    epoch === undefined ||
    epoch === null ||
    BigInt(epoch) < currentEpoch ||
    BigInt(epoch) > currentEpoch + 1n
  )
    throw new Error('unbounded_expiration');
  return {
    digest: await tx.getDigest(),
    gasBudget: String(gas.budget),
    expiresEpoch: String(epoch),
  };
}
export async function verifyCheckoutSignature(
  plan: Pick<PrivateCheckout, 'bytes' | 'payer' | 'digest'>,
  bytes: string,
  signature: string,
  client?: ClientWithCoreApi,
) {
  // Compare canonical base64 bytes before verifying. Wallets may not rebuild or alter a reviewed payment.
  if (
    !plan.bytes ||
    !plan.digest ||
    toBase64(fromBase64(bytes)) !== plan.bytes ||
    bytes !== plan.bytes
  )
    throw new Error('payment_changed');
  if ((await Transaction.from(bytes).getDigest()) !== plan.digest)
    throw new Error('payment_changed');
  await verifyTransactionSignature(fromBase64(bytes), signature, { address: plan.payer, client });
}
