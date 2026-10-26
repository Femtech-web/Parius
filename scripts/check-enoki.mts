// Read-only provider configuration check. Never logs keys, client IDs or app data.
import { EnokiClient, EnokiClientError } from '@mysten/enoki';
process.loadEnvFile('.env.local');
for (const [label, name] of [
  ['public', 'NEXT_PUBLIC_ENOKI_API_KEY'],
  ['private', 'ENOKI_PRIVATE_API_KEY'],
] as const) {
  const key = process.env[name];
  if (!key) {
    console.log(JSON.stringify({ check: `Enoki ${label} key`, present: false }));
    process.exitCode = 1;
    continue;
  }
  try {
    const app = await new EnokiClient({ apiKey: key }).getApp();
    const allows = (origin: string) =>
      app.allowedOrigins.some((value) => {
        if (value === '*') return true;
        try {
          return new URL(value).origin === origin;
        } catch {
          return value === new URL(origin).host;
        }
      });
    const googleMatches = app.authenticationProviders.some(
      (provider) =>
        provider.providerType === 'google' &&
        provider.clientId === process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    );
    console.log(
      JSON.stringify({
        check: `Enoki ${label} app access`,
        ok: true,
        googleClientMatches: googleMatches,
        localhostAllowed: allows('http://localhost:3000'),
        loopbackAllowed: allows('http://127.0.0.1:3000'),
      }),
    );
    if (!googleMatches) process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        check: `Enoki ${label} app access`,
        ok: false,
        status: error instanceof EnokiClientError ? error.status : null,
      }),
    );
    process.exitCode = 1;
  }
}
