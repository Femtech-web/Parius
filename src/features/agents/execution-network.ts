import { usdcTypes } from '@/features/payments/domain';
export function agentExecutionNetwork(
  requested: string,
  challengeNetwork: unknown,
  currency: unknown,
  allowMainnet: boolean,
) {
  if (
    (requested !== 'testnet' && requested !== 'mainnet') ||
    requested !== challengeNetwork ||
    (requested === 'mainnet' && !allowMainnet) ||
    currency !== usdcTypes[requested]
  )
    throw new Error(
      'Network or token differs from authorization. Mainnet also requires --allow-mainnet.',
    );
  return requested;
}
