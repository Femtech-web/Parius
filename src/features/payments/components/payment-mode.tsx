'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { control } from '@/components/ui/control-styles';
import { setPaymentNetwork } from '../server/payment-actions';
import { paymentNetworks } from '../networks';
import type { WalletNetwork } from '../wallets';
export function PaymentMode({
  projectId,
  network,
  locked,
  isFreelancer,
  preview,
}: {
  projectId: string;
  network: WalletNetwork;
  locked: boolean;
  isFreelancer: boolean;
  preview: boolean;
}) {
  const [choice, setChoice] = useState(network);
  const [notice, setNotice] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section
      aria-label="Project payment mode"
      className="mb-6 rounded-xl border border-white/10 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm">Payment mode</h3>
          <p className="mt-2 text-xs leading-6 text-ash">
            {network === 'mainnet'
              ? 'Mainnet · Real USDC and real network fees.'
              : 'Testnet · Try the flow with test tokens. No real money.'}
          </p>
        </div>
        {isFreelancer && !locked ? (
          <div className="w-full space-y-3 sm:w-72">
            <label className="sr-only" htmlFor="payment-mode">
              Choose payment mode
            </label>
            <Select
              id="payment-mode"
              value={choice}
              disabled={pending || preview}
              onChange={(e) => {
                setChoice(e.target.value as WalletNetwork);
                setNotice('');
              }}
            >
              {paymentNetworks().map((item) => (
                <option key={item} value={item}>
                  {item === 'mainnet' ? 'Mainnet — real USDC' : 'Testnet — test tokens'}
                </option>
              ))}
            </Select>
            {choice !== network && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    try {
                      const result = await setPaymentNetwork(projectId, choice);
                      setNotice(result.error || result.success || '');
                      if (!result.error) router.refresh();
                    } catch {
                      setNotice('Payment mode could not be changed. Please retry.');
                    }
                  });
                }}
              >
                {choice === 'mainnet' && (
                  <label className="mb-3 flex gap-2 text-xs leading-6">
                    <input type="checkbox" required className="mt-1" /> I understand Mainnet uses
                    real funds.
                  </label>
                )}
                <button className={control.smallSecondary} disabled={pending}>
                  {pending ? 'Saving…' : 'Save payment mode'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <span className="text-xs text-ice">
            {locked ? 'Fixed for this project' : 'Chosen by the freelancer'}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs leading-6 text-ash">
        Choose before issuing the first invoice. After that, use a separate project for the other
        network. Switching modes never sends money.
      </p>
      {notice && (
        <p role="status" className="mt-3 text-xs leading-6 text-ice">
          {notice}
        </p>
      )}
    </section>
  );
}
