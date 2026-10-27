import 'server-only';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import { z } from 'zod';
import { tatumEndpoint } from '@/lib/tatum-config';
import { usdcTypes } from '@/features/payments/domain';
import { inspectPreparedPayment, type PrivateCheckout } from '@/features/payments/checkout';

export function buildClient(network: 'mainnet' | 'testnet') {
  return new SuiGrpcClient({
    network,
    baseUrl: `https://fullnode.${network}.sui.io:443`,
    timeout: 12_000,
  });
}
async function enoki(path: string, body: unknown) {
  const key = process.env.ENOKI_PRIVATE_API_KEY;
  if (!key) throw new Error('sponsorship_unavailable');
  const response = await fetch(`https://api.enoki.mystenlabs.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('sponsorship_unavailable');
  return (await response.json()).data as unknown;
}
export async function buildCheckout(plan: PrivateCheckout) {
  if (
    plan.network !== process.env.NEXT_PUBLIC_SUI_NETWORK ||
    plan.coin_type !== usdcTypes[plan.network] ||
    plan.payer === plan.recipient
  )
    throw new Error('unsupported_payment');
  const client = buildClient(plan.network),
    signal = AbortSignal.timeout(12_000);
  const { response } = await client.ledgerService.getEpoch(
    { readMask: { paths: ['epoch'] } },
    { abort: signal },
  );
  const epoch = response.epoch?.epoch;
  if (epoch === undefined) throw new Error('provider_unavailable');
  const tx = new Transaction();
  tx.setSender(plan.payer);
  tx.transferObjects(
    [coinWithBalance({ type: plan.coin_type, balance: BigInt(plan.amount_atomic) })],
    plan.recipient,
  );
  const kind = await tx.build({ client, onlyTransactionKind: true });
  let bytes: string;
  if (plan.mode === 'sponsored') {
    // Only server-built payment kind bytes are submitted, never arbitrary browser PTBs.
    const sponsored = z.object({ bytes: z.string().max(32768), digest: z.string() }).parse(
      await enoki('transaction-blocks/sponsor', {
        sender: plan.payer,
        network: plan.network,
        transactionBlockKindBytes: toBase64(kind),
        allowedAddresses: [plan.recipient],
        allowedMoveCallTargets: ['0x2::coin::from_balance', '0x2::coin::redeem_funds'],
      }),
    );
    bytes = sponsored.bytes;
    const inspected = await inspectPreparedPayment(bytes, kind, plan.payer, plan.mode, epoch);
    if (inspected.digest !== sponsored.digest) throw new Error('payment_changed');
  } else {
    tx.setExpiration({ Epoch: epoch.toString() });
    tx.setGasBudget(10_000_000);
    bytes = toBase64(await tx.build({ client }));
  }
  const details = await inspectPreparedPayment(bytes, kind, plan.payer, plan.mode, epoch);
  const simulation = await client.simulateTransaction({
    transaction: fromBase64(bytes),
    checksEnabled: true,
    signal: AbortSignal.timeout(12_000),
  });
  if (simulation.$kind !== 'Transaction' || simulation.gasPaymentMocked)
    throw new Error('simulation_failed');
  return { bytes, ...details };
}
export async function withPaymentTatum<T>(work: (client: SuiGrpcClient) => Promise<T>) {
  const { network, host } = tatumEndpoint(
    process.env.NEXT_PUBLIC_SUI_NETWORK,
    process.env.TATUM_SUI_GRPC_URL,
  );
  if (!process.env.TATUM_API_KEY) throw new Error('provider_unavailable');
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: { 'x-api-key': process.env.TATUM_API_KEY },
    timeout: 10_000,
  });
  try {
    return await work(new SuiGrpcClient({ network, transport }));
  } finally {
    transport.close();
  }
}
export async function broadcastCheckout(plan: PrivateCheckout, signature: string) {
  if (!plan.bytes || !plan.digest || plan.network !== process.env.NEXT_PUBLIC_SUI_NETWORK)
    throw new Error('unsupported_payment');
  if (plan.mode === 'sponsored') {
    const result = z
      .object({ digest: z.string() })
      .parse(
        await enoki(`transaction-blocks/sponsor/${encodeURIComponent(plan.digest)}`, { signature }),
      );
    if (result.digest !== plan.digest) throw new Error('payment_changed');
  } else
    await withPaymentTatum(async (client) => {
      const result = await client.executeTransaction({
        transaction: fromBase64(plan.bytes!),
        signatures: [signature],
      });
      const tx = result.Transaction ?? result.FailedTransaction;
      if (tx.digest !== plan.digest) throw new Error('payment_changed');
    });
}
/** A missing/slow provider result never releases a submitted transaction. */
export async function checkoutFailureEvidence(
  plan: Pick<PrivateCheckout, 'digest' | 'payer' | 'network' | 'status'>,
) {
  if (plan.network !== process.env.NEXT_PUBLIC_SUI_NETWORK || !plan.digest)
    throw new Error('network_mismatch');
  const digest = plan.digest;
  return withPaymentTatum(async (client) => {
    try {
      const { response } = await client.ledgerService.getTransaction({
        digest,
        readMask: { paths: ['digest', 'transaction.sender', 'effects.status', 'checkpoint'] },
      });
      const tx = response.transaction;
      if (
        tx?.digest === plan.digest &&
        tx.transaction?.sender === plan.payer &&
        tx.checkpoint !== undefined &&
        tx.effects?.status?.success === false
      )
        return {
          provider: 'Tatum',
          network: plan.network,
          digest: plan.digest,
          kind: 'failed_transaction',
          sender: plan.payer,
          checkpoint: tx.checkpoint.toString(),
        };
    } catch (error) {
      // 'ready' means the server has never started broadcasting this transaction.
      // Do not expire 'uncertain'/'submitted', even after their epoch has ended.
      if (
        plan.status !== 'ready' ||
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'NOT_FOUND'
      )
        throw error;
      const { response } = await client.ledgerService.getEpoch({ readMask: { paths: ['epoch'] } });
      if (response.epoch?.epoch !== undefined)
        return {
          provider: 'Tatum',
          network: plan.network,
          digest: plan.digest,
          kind: 'expired_unsigned',
          currentEpoch: response.epoch.epoch.toString(),
        };
    }
    return null;
  });
}
