// Non-financial integration probe: create ephemeral login nonces, never wallets/payments.
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
process.loadEnvFile('.env.local');
for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
  try {
    const response = await fetch('https://api.enoki.mystenlabs.com/v1/zklogin/nonce', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_ENOKI_API_KEY}`,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: 'testnet',
        ephemeralPublicKey: new Ed25519Keypair().getPublicKey().toSuiPublicKey(),
        additionalEpochs: 0,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = response.ok ? (await response.json()).data : null;
    const allowed = response.headers.get('access-control-allow-origin');
    const ok =
      response.ok &&
      typeof data?.nonce === 'string' &&
      Number.isInteger(data?.epoch) &&
      (allowed === origin || allowed === '*');
    console.log(
      JSON.stringify({
        check: 'Enoki Testnet ephemeral nonce',
        origin,
        ok,
        status: response.status,
        corsAllowed: allowed === origin || allowed === '*',
      }),
    );
    if (!ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ check: 'Enoki Testnet ephemeral nonce', origin, ok: false }));
    process.exitCode = 1;
  }
}
