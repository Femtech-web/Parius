// Networks must be allowlisted enums; never use an RPC URL supplied by a caller.
export function tatumEndpoint(network: string | undefined, configuredUrl: string | undefined) {
  if (network !== 'testnet' && network !== 'mainnet') throw new Error('Unsupported Sui network.');
  const expected = `https://sui-${network}-grpc.gateway.tatum.io`;
  if (configuredUrl && configuredUrl !== expected)
    throw new Error('Tatum endpoint does not match the configured Sui network.');
  return { network, host: `sui-${network}-grpc.gateway.tatum.io:443` };
}

/** Legacy credentials are usable only for their explicitly configured default network. */
export function tatumPaymentConfig(
  network: 'testnet' | 'mainnet',
  env: Record<string, string | undefined>,
) {
  const isDefault = network === env.NEXT_PUBLIC_SUI_NETWORK;
  const prefix = network === 'mainnet' ? 'TATUM_MAINNET' : 'TATUM_TESTNET';
  const key = env[`${prefix}_API_KEY`] || (isDefault ? env.TATUM_API_KEY : undefined);
  const url = env[`${prefix}_GRPC_URL`] || (isDefault ? env.TATUM_SUI_GRPC_URL : undefined);
  if (!key) throw new Error('Tatum is not configured for this payment network.');
  return { ...tatumEndpoint(network, url), network, key };
}
