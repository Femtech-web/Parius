import 'server-only';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import { paymentTatumConfig } from '@/features/payments/server/network-config';
import { tatumEndpoint } from '@/lib/tatum-config';
/** Read-only transport spike. This is not invoice/payment verification. */
export async function probeTatum() {
  const { network, host } = tatumEndpoint(
    process.env.NEXT_PUBLIC_SUI_NETWORK,
    process.env.TATUM_SUI_GRPC_URL,
  );
  const key = process.env.TATUM_API_KEY;
  if (!key) throw new Error('Tatum is not configured.');
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: { 'x-api-key': key },
    timeout: 10000,
  });
  const client = new SuiGrpcClient({ network, transport });
  try {
    // Tatum accepted native GetCheckpoint/GetTransaction/GetBalance in the
    // live spike; GetServiceInfo failed. No public-node fallback is used.
    const { response: checkpoint } = await client.ledgerService.getCheckpoint({
      checkpointId: { oneofKind: undefined },
      readMask: {
        paths: [
          'sequence_number',
          'digest',
          'transactions.digest',
          'transactions.transaction.sender',
        ],
      },
    });
    const candidate = checkpoint.checkpoint?.transactions.find(
      (tx) => tx.digest && tx.transaction?.sender && !/^0x0+$/.test(tx.transaction.sender),
    );
    if (!candidate?.digest || !candidate.transaction?.sender)
      throw new Error(
        'No user transaction was available in the latest checkpoint. Retry the probe.',
      );
    const { response: receipt } = await client.ledgerService.getTransaction({
      digest: candidate.digest,
      readMask: { paths: ['digest', 'checkpoint', 'effects.status', 'transaction.sender'] },
    });
    if (
      receipt.transaction?.digest !== candidate.digest ||
      receipt.transaction.checkpoint === undefined ||
      typeof receipt.transaction.effects?.status?.success !== 'boolean'
    )
      throw new Error('Tatum transaction evidence was incomplete.');
    const { response: balance } = await client.stateService.getBalance({
      owner: candidate.transaction.sender,
      coinType: '0x2::sui::SUI',
    });
    if (!balance.balance) throw new Error('Tatum balance evidence was missing.');
    return {
      provider: 'Tatum',
      protocol: 'native',
      network,
      // The URL is allowlisted, but independent chain identity is still an
      // explicit payment-phase gate. This probe does not credit an invoice.
      chainId: null,
      networkVerified: false,
      checkpoint: receipt.transaction.checkpoint.toString(),
      digest: candidate.digest,
      transactionSucceeded: receipt.transaction.effects.status.success,
      balanceRead: true,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    transport.close();
  }
}

/** Native Tatum receipt read, bound to an allowlisted network endpoint and canonical USDC type. */
export async function verifyTatumReceipt(expected: {
  network: 'testnet' | 'mainnet';
  digest: string;
  payer: string;
  recipient: string;
  coinType: string;
  amountAtomic: string;
  createdAt: string;
  expiresAt: string;
}) {
  const { network, host, key } = paymentTatumConfig(expected.network);
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: { 'x-api-key': key },
    timeout: 10000,
  });
  const client = new SuiGrpcClient({ network, transport });
  try {
    const { response } = await client.ledgerService.getTransaction({
      digest: expected.digest,
      readMask: {
        paths: [
          'digest',
          'transaction.sender',
          'effects.status',
          'checkpoint',
          'timestamp',
          'balance_changes',
        ],
      },
    });
    const tx = response.transaction;
    if (!tx) throw new Error('provider_unavailable');
    const timestamp = tx.timestamp
      ? new Date(
          Number(tx.timestamp.seconds) * 1000 + Math.floor(tx.timestamp.nanos / 1e6),
        ).toISOString()
      : undefined;
    return matchReceipt(
      {
        network,
        networkBinding: 'tatum_endpoint',
        digest: tx.digest || '',
        success: tx.effects?.status?.success,
        sender: tx.transaction?.sender,
        checkpoint: tx.checkpoint,
        timestamp,
        changes: tx.balanceChanges,
      },
      expected,
    );
  } finally {
    transport.close();
  }
}
import { matchReceipt } from '@/features/payments/domain';
