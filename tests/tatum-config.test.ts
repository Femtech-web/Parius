import test from 'node:test';
import assert from 'node:assert/strict';
import { tatumEndpoint } from '../src/lib/tatum-config';
test('Tatum network config rejects cross-network endpoints and arbitrary destinations', () => {
  assert.equal(
    tatumEndpoint('testnet', 'https://sui-testnet-grpc.gateway.tatum.io').network,
    'testnet',
  );
  assert.equal(tatumEndpoint('mainnet', undefined).host, 'sui-mainnet-grpc.gateway.tatum.io:443');
  assert.throws(
    () => tatumEndpoint('testnet', 'https://sui-mainnet-grpc.gateway.tatum.io'),
    /does not match/,
  );
  assert.throws(() => tatumEndpoint('testnet', 'https://attacker.example'), /does not match/);
  assert.throws(() => tatumEndpoint('devnet', undefined), /Unsupported/);
  assert.throws(
    () => tatumEndpoint('testnet', 'https://sui-testnet-grpc.gateway.tatum.io?key=abc'),
    /does not match/,
  );
});
