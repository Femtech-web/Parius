import 'server-only';
import { paymentNetworkEnabled } from '../networks';
import { tatumPaymentConfig } from '@/lib/tatum-config';
export function paymentTatumConfig(network: 'testnet' | 'mainnet') {
  if (!paymentNetworkEnabled(network)) throw new Error('Payment network is not enabled.');
  return tatumPaymentConfig(network, process.env);
}
