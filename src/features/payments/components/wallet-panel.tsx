'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DAppKitProvider,
  useCurrentAccount,
  useCurrentNetwork,
  useDAppKit,
  useWallets,
  useWalletConnection,
  getWalletUniqueIdentifier,
} from '@mysten/dapp-kit-react';
import { dAppKit, googleWalletEnabled } from '@/features/payments/wallet-client';
import {
  beginWalletLink,
  completeWalletLink,
  readWalletBindings,
  unlinkWallet,
} from '@/features/payments/server/wallet-actions';
import type { WalletBinding } from '@/features/payments/wallets';
import { control } from '@/components/ui/control-styles';

export type WalletPanelProps = { onBindings: (bindings: WalletBinding[]) => void };
function WalletControls({ onBindings }: WalletPanelProps) {
  const kit = useDAppKit(dAppKit),
    account = useCurrentAccount({ dAppKit }),
    network = useCurrentNetwork({ dAppKit });
  const wallets = useWallets({ dAppKit }),
    connection = useWalletConnection({ dAppKit });
  const [bindings, setBindings] = useState<WalletBinding[]>([]);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [available, setAvailable] = useState(false);
  const accountRef = useRef(account);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);
  const reload = useCallback(async () => {
    const result = await readWalletBindings();
    if (result.error) {
      setNotice(result.error);
      setAvailable(false);
      return;
    }
    setAvailable(true);
    setBindings(result.bindings ?? []);
    onBindings(result.bindings ?? []);
  }, [onBindings]);
  useEffect(() => {
    let active = true;
    void readWalletBindings()
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setNotice(result.error);
          return;
        }
        setAvailable(true);
        setBindings(result.bindings ?? []);
        onBindings(result.bindings ?? []);
      })
      .catch(() => {
        if (active) setNotice('Wallets could not be loaded. Please reopen Payments to retry.');
      });
    return () => {
      active = false;
    };
  }, [onBindings]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await work();
    } catch {
      setNotice('The wallet request did not complete. Nothing was sent. Please retry.');
    } finally {
      setBusy(false);
    }
  };
  const linked = bindings.some((b) => b.address === account?.address && b.network === network);
  return (
    <details
      open
      aria-label="Your payment wallet"
      aria-busy={busy}
      className="mb-6 border-b border-white/10 pb-5"
    >
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-paper">
        Payment wallet{' '}
        <span className="ml-3 text-xs capitalize text-ash">
          Sui {network} ·{' '}
          {linked
            ? 'Connected · verified'
            : !account && bindings.some((binding) => binding.network === network)
              ? 'Verified · reconnect wallet'
              : account
                ? 'Verify ownership'
                : 'Connect wallet'}
        </span>
      </summary>
      <p className="mt-2 max-w-xl text-xs leading-relaxed text-ash">
        Link a wallet for payments. Ownership verification does not move money.
      </p>
      {!account && bindings.some((binding) => binding.network === network) && (
        <p className="mt-2 text-xs text-ice">
          Your ownership verification is saved. Reconnect the same wallet to sign a payment.
        </p>
      )}
      {!account ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {wallets.map((wallet) => (
            <button
              key={getWalletUniqueIdentifier(wallet)}
              className={control.smallSecondary}
              disabled={busy || !available || connection.isConnecting}
              onClick={() =>
                void run(async () => {
                  await kit.connectWallet({ wallet });
                })
              }
            >
              {wallet.name === 'Sign in with Google'
                ? 'Use Google wallet'
                : getWalletUniqueIdentifier(wallet) === 'com.mystenlabs.suiwallet.web'
                  ? 'Connect Slush web'
                  : `Connect ${wallet.name}`}
            </button>
          ))}
          {wallets.length === 0 && (
            <p className="text-xs leading-relaxed text-ash">
              No compatible wallet detected. Open Parius in a browser with a Sui wallet extension.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <p className="break-all font-mono text-xs leading-relaxed text-paper">
            {account.address}
          </p>
          <p className="mt-2 text-xs text-ash">
            {linked
              ? 'Ownership verified for this account.'
              : 'Connected · ownership not yet verified'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!linked && (
              <button
                className={control.smallPrimary}
                disabled={busy || !available || !account.chains.includes(`sui:${network}`)}
                onClick={() =>
                  void run(async () => {
                    const signingAccount = account;
                    const challenge = await beginWalletLink(signingAccount.address);
                    if (!challenge.id || !challenge.message) {
                      setNotice(challenge.error ?? 'Could not create a signature request.');
                      return;
                    }
                    if (accountRef.current?.address !== signingAccount.address) {
                      setNotice('The connected account changed. Please retry.');
                      return;
                    }
                    const signed = await kit.signPersonalMessage({
                      message: new TextEncoder().encode(challenge.message),
                      account: signingAccount,
                      network,
                    });
                    if (accountRef.current?.address !== signingAccount.address) {
                      setNotice('The connected account changed. Please retry.');
                      return;
                    }
                    const result = await completeWalletLink(challenge.id, signed.signature);
                    setNotice(result.error ?? result.success ?? '');
                    if (!result.error) await reload();
                  })
                }
              >
                Verify wallet ownership
              </button>
            )}
            <button
              className={control.smallSecondary}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await kit.disconnectWallet();
                })
              }
            >
              Disconnect
            </button>
          </div>
          {!account.chains.includes(`sui:${network}`) && (
            <p className="mt-3 text-xs text-ash">
              Switch your wallet to Sui {network}, then reconnect.
            </p>
          )}
        </div>
      )}
      {!googleWalletEnabled && (
        <p className="mt-4 text-xs leading-relaxed text-ash">
          Google wallet connection will be available once setup is complete.
        </p>
      )}
      {!available && (
        <button
          className={`${control.smallSecondary} mt-4`}
          disabled={busy}
          onClick={() => void run(reload)}
        >
          Retry wallet setup
        </button>
      )}
      {bindings.length > 0 && (
        <details className="mt-5 border-t border-white/10 pt-4">
          <summary className="cursor-pointer text-xs text-ash">
            Verified wallets ({bindings.length})
          </summary>
          <ul className="mt-4 space-y-4">
            {bindings.map((binding) => (
              <li key={binding.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs text-ash">{binding.address}</p>
                  <p className="mt-1 text-xs capitalize text-ash">{binding.network}</p>
                </div>
                <button
                  className={control.smallSecondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await unlinkWallet(binding.id);
                      setNotice(result.error ?? result.success ?? '');
                      if (!result.error) await reload();
                    })
                  }
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-xs leading-relaxed text-ice">
        {busy ? 'Waiting for your wallet…' : notice}
      </p>
    </details>
  );
}
export default function WalletPanel(props: WalletPanelProps) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <WalletControls {...props} />
    </DAppKitProvider>
  );
}
