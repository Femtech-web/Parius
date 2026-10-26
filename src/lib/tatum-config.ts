// Never accept an RPC URL or a network from a request body.
export function tatumEndpoint(network: string | undefined, configuredUrl: string | undefined) {
  if (network !== 'testnet' && network !== 'mainnet') throw new Error('Unsupported Sui network.');
  const expected = `https://sui-${network}-grpc.gateway.tatum.io`;
  if (configuredUrl && configuredUrl !== expected)
    throw new Error('Tatum endpoint does not match the configured Sui network.');
  return { network, host: `sui-${network}-grpc.gateway.tatum.io:443` };
}
