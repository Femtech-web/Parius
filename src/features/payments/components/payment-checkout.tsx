'use client';
import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DAppKitProvider, useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { dAppKit } from '@/features/payments/wallet-client';
import {
  readCheckout,
  prepareCheckout,
  checkoutSigningBytes,
  submitCheckout,
  checkCheckout,
} from '@/features/payments/server/checkout-actions';
import type { Checkout, GasMode } from '@/features/payments/checkout';
import { displayAmount } from '@/lib/domain';
import { Dialog } from '@/components/ui/dialog';
import { control } from '@/components/ui/control-styles';

function CheckoutControl({ requestId }: { requestId: string }) {
  const [plan, setPlan] = useState<Checkout>(),
    [mode, setMode] = useState<GasMode>('sponsored');
  const [loaded, setLoaded] = useState(false),
    [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [review, setReview] = useState(false);
  const account = useCurrentAccount({ dAppKit }),
    kit = useDAppKit(dAppKit),
    router = useRouter();
  useEffect(() => {
    let active = true;
    void readCheckout(requestId)
      .then((result) => {
        if (!active) return;
        setLoaded(true);
        setAvailable(!result.error);
        setNotice(result.error ?? '');
        setPlan(result.plan);
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
          setNotice('Payment status could not be loaded. Please reopen Payments.');
        }
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  const refresh = async () => {
    const result = await readCheckout(requestId);
    if (!result.error) setPlan(result.plan);
    router.refresh();
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await work();
    } catch {
      setNotice('This step could not be confirmed. Check the saved payment before trying again.');
    } finally {
      setBusy(false);
    }
  };
  const canPrepare = !plan || plan.status === 'failed';
  return (
    <div className="mt-5 rounded-xl bg-night/60 p-4">
      <p className="text-sm">Pay from your connected wallet</p>
      {canPrepare && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={`gas-${requestId}`} className="mb-2 block text-xs text-ash">
              Network fee
            </label>
            <Select
              id={`gas-${requestId}`}
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as GasMode)}
            >
              <option value="sponsored">Request gas sponsorship</option>
              <option value="wallet">Pay gas with my SUI</option>
            </Select>
          </div>
          <button
            className={control.smallSecondary}
            disabled={busy || !loaded || !available || !account}
            onClick={() =>
              void run(async () => {
                const result = await prepareCheckout(requestId, mode);
                setNotice(result.error ?? 'Payment prepared. Review the details before signing.');
                if (result.plan) {
                  setPlan(result.plan);
                  setReview(result.plan.status === 'ready');
                }
              })
            }
          >
            Prepare payment
          </button>
        </div>
      )}
      {!account && (
        <p className="mt-3 text-xs text-ash">
          Reconnect your sender wallet in Payment wallet above to continue. Saved ownership
          verification is kept.
        </p>
      )}
      {plan && plan.status !== 'failed' && (
        <>
          <p className="mt-3 text-xs text-ash">
            {
              (
                {
                  building: 'Preparing payment…',
                  ready: 'Ready for your review. Nothing has been sent.',
                  uncertain:
                    'Submission is uncertain. Check the saved digest before retrying this same payment.',
                  submitted:
                    'Submitted. Tatum verification and freelancer reconciliation are still required.',
                  verified: 'Tatum verified. Awaiting freelancer reconciliation.',
                  credited: 'Reconciled against this invoice.',
                } as const
              )[plan.status]
            }
          </p>
          {plan.digest && (
            <p className="mt-3 break-all font-mono text-[11px] text-ash">{plan.digest}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {['ready', 'uncertain'].includes(plan.status) && (
              <button
                className={control.smallPrimary}
                disabled={busy || !account || account.address !== plan.payer}
                onClick={() => setReview(true)}
              >
                {plan.status === 'uncertain' ? 'Review same payment' : 'Review payment'}
              </button>
            )}
            {plan.digest && (
              <button
                className={control.smallSecondary}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await checkCheckout(plan.id);
                    setNotice(result.error ?? result.success ?? '');
                    await refresh();
                  })
                }
              >
                Check saved digest with Tatum
              </button>
            )}
            {plan.status === 'building' && (
              <button
                className={control.smallSecondary}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await prepareCheckout(requestId, plan.mode);
                    setNotice(result.error ?? 'Payment recovered.');
                    if (result.plan) setPlan(result.plan);
                  })
                }
              >
                Resume preparation
              </button>
            )}
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className="mt-3 text-xs leading-relaxed text-ice">
        {busy ? 'Waiting for confirmation…' : notice}
      </p>
      {review && plan && (
        <Dialog title="Review your payment" onClose={() => setReview(false)}>
          <p>
            This payment uses your approved invoice instructions. Your wallet will ask you to sign
            before submission.
          </p>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-xs text-ash">Amount</dt>
              <dd className="mt-1 text-2xl tracking-tight">
                {displayAmount(plan.amount_atomic, 'USDC', 6)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ash">Network</dt>
              <dd className="mt-1 capitalize">Sui {plan.network}</dd>
            </div>
            <div>
              <dt className="text-xs text-ash">From</dt>
              <dd className="mt-1 break-all font-mono text-xs">{plan.payer}</dd>
            </div>
            <div>
              <dt className="text-xs text-ash">To</dt>
              <dd className="mt-1 break-all font-mono text-xs">{plan.recipient}</dd>
            </div>
            <div>
              <dt className="text-xs text-ash">Network fee</dt>
              <dd className="mt-1">
                {plan.mode === 'sponsored'
                  ? 'Paid by the sponsor · 0 SUI from you'
                  : `Up to ${displayAmount(plan.gas_budget ?? '0', 'SUI', 9)} from your wallet`}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-ash">
            If submission times out, Parius keeps this transaction and its digest. It does not
            create another transfer. An expired or failed transaction may need a fresh review after
            its outcome is confirmed.
          </p>
          <p role="status" aria-live="polite" className="mt-4 text-xs leading-relaxed text-ice">
            {busy ? 'Waiting for your wallet or submission result…' : notice}
          </p>
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (!account || account.address !== plan.payer) {
                  setNotice('Connect the verified sender wallet before signing.');
                  setReview(false);
                  return;
                }
                const result = await checkoutSigningBytes(plan.id);
                if (!result.bytes) {
                  setNotice(result.error ?? 'The saved payment could not be loaded.');
                  setReview(false);
                  return;
                }
                let signed;
                try {
                  signed = await kit.signTransaction({
                    transaction: Transaction.from(result.bytes),
                    account,
                    network: plan.network,
                  });
                } catch {
                  setNotice(
                    'Wallet signing did not complete. This step has not submitted a payment.',
                  );
                  return;
                }
                const submitted = await submitCheckout(plan.id, signed.bytes, signed.signature);
                setNotice(submitted.error ?? submitted.success ?? '');
                setReview(false);
                await refresh();
              });
            }}
          >
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input type="checkbox" required disabled={busy} className="mt-1" />
              <span>I approve this exact amount, recipient, network and fee.</span>
            </label>
            <footer>
              <button
                className={control.primary}
                disabled={busy || !account || account.address !== plan.payer}
              >
                Sign & submit payment
              </button>
            </footer>
          </form>
        </Dialog>
      )}
    </div>
  );
}
export default function PaymentCheckout(props: { requestId: string }) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <CheckoutControl {...props} />
    </DAppKitProvider>
  );
}
