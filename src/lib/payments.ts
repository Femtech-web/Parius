import { z } from 'zod';
import {
  normalizeSuiAddress,
  normalizeStructTag,
  isValidTransactionDigest,
} from '@mysten/sui/utils';
export const usdcTypes = {
  testnet: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
  mainnet: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
} as const;
export const chainIds = { testnet: '4c78adac', mainnet: '35834a8a' } as const;
export const addressInput = z
  .string()
  .trim()
  .regex(/^0x[a-f0-9]{1,64}$/i)
  .transform((value) => normalizeSuiAddress(value));
export const digestInput = z
  .string()
  .refine(isValidTransactionDigest, 'Enter a valid Sui transaction digest.');
export type Invoice = {
  id: string;
  project_id: string;
  agreement_id: string;
  milestone_id: string | null;
  title: string;
  amount_atomic: string;
  currency: string;
  decimals: number;
  status: 'draft' | 'issued' | 'void';
  due_date: string | null;
  recipient: string | null;
  network: 'testnet' | 'mainnet' | null;
  coin_type: string | null;
  created_at: string;
  issued_at: string | null;
};
export type PaymentRecord = {
  id: string;
  project_id: string;
  invoice_id: string;
  amount_atomic: string;
  source: 'manual' | 'sui';
  note: string;
  paid_at: string;
  created_at: string;
  reversed_at: string | null;
  network: string | null;
  digest: string | null;
};
export type PaymentRequest = {
  id: string;
  project_id: string;
  invoice_id: string;
  payer: string;
  amount_atomic: string;
  created_at: string;
  expires_at: string;
};
export type PaymentClaim = {
  id: string;
  project_id: string;
  request_id: string;
  digest: string;
  status: 'checking' | 'retryable' | 'rejected' | 'verified' | 'credited';
  reason: string | null;
  proof: ReceiptProof | null;
  created_at: string;
};
export type ReceiptProof = {
  provider: 'Tatum';
  networkEvidence?: 'tatum_endpoint_and_canonical_asset' | 'chain_identifier';
  network: 'mainnet' | 'testnet';
  chainId: string;
  digest: string;
  sender: string;
  recipient: string;
  coinType: string;
  amountAtomic: string;
  checkpoint: string;
  timestamp: string;
};
export function invoiceTotals(invoice: Invoice, records: PaymentRecord[]) {
  const paid = records
    .filter((r) => r.invoice_id === invoice.id && !r.reversed_at)
    .reduce((sum, r) => sum + BigInt(r.amount_atomic), 0n);
  const remaining = BigInt(invoice.amount_atomic) - paid;
  return {
    paid: paid.toString(),
    outstanding: (remaining > 0n ? remaining : 0n).toString(),
    surplus: (remaining < 0n ? -remaining : 0n).toString(),
  };
}
export function matchReceipt(
  input: {
    network: 'testnet' | 'mainnet';
    chainId?: string;
    networkBinding?: 'tatum_endpoint';
    digest: string;
    success?: boolean;
    sender?: string;
    checkpoint?: bigint;
    timestamp?: string;
    changes: { address?: string; coinType?: string; amount?: string }[];
  },
  expected: {
    network: 'testnet' | 'mainnet';
    digest: string;
    payer: string;
    recipient: string;
    coinType: string;
    amountAtomic: string;
    createdAt: string;
    expiresAt: string;
  },
): ReceiptProof {
  if (
    input.network !== expected.network ||
    (input.chainId
      ? input.chainId !== chainIds[expected.network]
      : input.networkBinding !== 'tatum_endpoint')
  )
    throw new Error('network_mismatch');
  if (input.digest !== expected.digest || input.success !== true || input.checkpoint === undefined)
    throw new Error('unsettled_transaction');
  if (!input.sender || normalizeSuiAddress(input.sender) !== normalizeSuiAddress(expected.payer))
    throw new Error('payer_mismatch');
  const time = Date.parse(input.timestamp || '');
  if (
    !Number.isFinite(time) ||
    time < Date.parse(expected.createdAt) ||
    time > Date.parse(expected.expiresAt)
  )
    throw new Error('outside_request_window');
  const asset = normalizeStructTag(expected.coinType);
  if (asset !== normalizeStructTag(usdcTypes[expected.network]))
    throw new Error('network_mismatch');
  // Fail closed on batched/mixed routes: exactly one USDC debit and one credit,
  // bound to the expected sender/recipient. Never infer from the token symbol.
  const relevant = input.changes.filter(
    (c) => c.coinType && normalizeStructTag(c.coinType) === asset,
  );
  if (relevant.length !== 2) throw new Error('unsupported_transfer');
  const credit = relevant.find(
    (c) => c.address && normalizeSuiAddress(c.address) === normalizeSuiAddress(expected.recipient),
  );
  const debit = relevant.find(
    (c) => c.address && normalizeSuiAddress(c.address) === normalizeSuiAddress(expected.payer),
  );
  if (
    !credit ||
    !debit ||
    credit === debit ||
    credit.amount !== expected.amountAtomic ||
    debit.amount !== `-${expected.amountAtomic}`
  )
    throw new Error('amount_or_recipient_mismatch');
  return {
    provider: 'Tatum',
    network: input.network,
    chainId: chainIds[expected.network],
    networkEvidence: input.chainId ? 'chain_identifier' : 'tatum_endpoint_and_canonical_asset',
    digest: input.digest,
    sender: normalizeSuiAddress(input.sender),
    recipient: normalizeSuiAddress(expected.recipient),
    coinType: asset,
    amountAtomic: expected.amountAtomic,
    checkpoint: input.checkpoint.toString(),
    timestamp: input.timestamp!,
  };
}

export type InvoiceBalance = {
  invoice_id: string;
  paid: string;
  manual: string;
  verified: string;
  outstanding: string;
  surplus: string;
};
