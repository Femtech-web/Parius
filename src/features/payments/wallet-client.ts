'use client';
import { createDAppKit } from '@mysten/dapp-kit-react';
import { enokiWalletsInitializer } from '@mysten/enoki';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { paymentNetworks } from './networks';
import { walletNetwork } from '@/features/payments/wallets';

const network = walletNetwork(process.env.NEXT_PUBLIC_SUI_NETWORK);
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
