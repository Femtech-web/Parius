import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { addressInput } from './payments';

export type WalletNetwork = 'testnet' | 'mainnet';
export type WalletBinding = {
  id: string;
  address: string;
  network: WalletNetwork;
  verified_at: string;
};
export type WalletChallenge = {
  id: string;
  owner_id: string;
  address: string;
  network: WalletNetwork;
  origin: string;
  nonce: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};
export function walletNetwork(value: string | undefined): WalletNetwork {
  if (value !== 'testnet' && value !== 'mainnet') throw new Error('Sui network is not configured.');
  return value;
}
export function walletOrigin(configured: string | undefined, received: string | null, dev = false) {
  if (!configured || !received) throw new Error('Open Parius at its configured app URL.');
  const expected = new URL(configured),
    actual = new URL(received);
  const loopback = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(expected.protocol) ||
    actual.origin !== received ||
    (actual.origin !== expected.origin &&
      !(
        dev &&
        loopback(expected) &&
        loopback(actual) &&
        expected.protocol === actual.protocol &&
        expected.port === actual.port
      ))
  )
    throw new Error('Open Parius at its configured app URL.');
  return actual.origin;
}
export function walletChallengeMessage(challenge: WalletChallenge) {
  return [
    'Parius wallet ownership verification',
    '',
    'Link this wallet to your Parius account.',
    'This signature does not authorize a payment or change an agreement.',
    '',
    `App: ${challenge.origin}`,
    `Account: ${challenge.owner_id}`,
    `Wallet: ${addressInput.parse(challenge.address)}`,
    `Network: sui:${challenge.network}`,
    `Challenge: ${challenge.id}`,
    `Nonce: ${challenge.nonce}`,
    `Issued: ${new Date(challenge.created_at).toISOString()}`,
    `Expires: ${new Date(challenge.expires_at).toISOString()}`,
  ].join('\n');
}
export async function verifyWalletChallenge(
  challenge: WalletChallenge,
  signature: string,
  context: { owner: string; origin: string; network: WalletNetwork; now?: number },
  client?: ClientWithCoreApi,
) {
  const now = context.now ?? Date.now();
  const issued = Date.parse(challenge.created_at),
    expires = Date.parse(challenge.expires_at);
  if (
    challenge.owner_id !== context.owner ||
    challenge.origin !== context.origin ||
    challenge.network !== context.network ||
    challenge.consumed_at ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now ||
    expires <= now ||
    expires - issued > 300_000 ||
    expires <= issued
  )
    throw new Error('Wallet challenge expired or does not match this session.');
  await verifyPersonalMessageSignature(
    new TextEncoder().encode(walletChallengeMessage(challenge)),
    signature,
    {
      address: challenge.address,
      client,
    },
  );
}
