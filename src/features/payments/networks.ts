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

/** An omitted default prefers Testnet; an explicitly invalid default is never ignored. */
export function defaultPaymentNetwork(
  configuredDefault = process.env.NEXT_PUBLIC_SUI_NETWORK,
  configuredNetworks = process.env.NEXT_PUBLIC_SUI_NETWORKS,
): WalletNetwork {
  const enabled = paymentNetworks(configuredDefault, configuredNetworks);
  if (configuredDefault !== undefined && configuredDefault !== '') {
    if (
      (configuredDefault !== 'testnet' && configuredDefault !== 'mainnet') ||
      !enabled.includes(configuredDefault)
    )
      throw new Error('Default payment network must be one of the enabled networks.');
    return configuredDefault;
  }
  return enabled.includes('testnet') ? 'testnet' : enabled[0];
}
