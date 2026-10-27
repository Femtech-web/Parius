import type { WalletNetwork } from './wallets';

export function paymentNetworks(
  defaultNetwork = process.env.NEXT_PUBLIC_SUI_NETWORK,
  configured = process.env.NEXT_PUBLIC_SUI_NETWORKS,
): WalletNetwork[] {
  const values = (configured || defaultNetwork || 'testnet').split(',').map((v) => v.trim());
  if (!values.length || values.some((v) => v !== 'testnet' && v !== 'mainnet'))
    throw new Error('Unsupported payment network configuration.');
  return [...new Set(values)] as WalletNetwork[];
}
export function paymentNetworkEnabled(network: string): network is WalletNetwork {
  return paymentNetworks().some((value) => value === network);
}
