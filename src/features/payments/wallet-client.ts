'use client';
import { createDAppKit } from '@mysten/dapp-kit-react';
import { enokiWalletsInitializer } from '@mysten/enoki';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { defaultPaymentNetwork, paymentNetworks } from './networks';

const network = defaultPaymentNetwork();
export const googleWalletEnabled = Boolean(
  process.env.NEXT_PUBLIC_ENOKI_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
);
export const dAppKit = createDAppKit({
  networks: paymentNetworks(),
  defaultNetwork: network,
  autoConnect: true,
  // The web-wallet SDK base64-encodes this name; document.title contains Unicode.
  slushWalletConfig: { appName: 'Parius' },
  createClient: (network) =>
    new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` }),
  walletInitializers: googleWalletEnabled
    ? [
        enokiWalletsInitializer({
          apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
          providers: {
            google: {
              clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
              redirectUrl: `${window.location.origin}/wallet/callback`,
            },
          },
        }),
      ]
    : [],
});
