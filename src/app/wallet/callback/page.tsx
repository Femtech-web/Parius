export const metadata = {
  title: 'Connecting wallet',
  robots: { index: false, follow: false },
};

export default function WalletCallback() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-xl tracking-tight">Completing your wallet connection.</p>
        <p className="mt-4 text-sm text-ash">
          This window closes when the connection is complete. If it stays open, return to Parius and
          try connecting again.
        </p>
      </div>
    </main>
  );
}
