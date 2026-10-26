// Reads public testnet data only; does not sign, simulate or send a transaction.
process.loadEnvFile('.env.local');
const { probeTatum } = await import('../src/lib/server/tatum');
try {
  console.log(
    JSON.stringify({
      ok: true,
      ...(await probeTatum()),
    }),
  );
} catch (error) {
  const safe = error as { code?: string; message?: string };
  const message = safe.message || '';
  const hints = [
    'HTTP/1.1',
    'HTTP/2',
    'No connection established',
    'Name resolution failed',
    'RST_STREAM',
    'ECONNRESET',
    'socket',
    '404',
    '405',
    '401',
    '403',
    '502',
    '503',
    '504',
    'GOAWAY',
    'protocol',
    'fetch failed',
    'connect',
    'closed',
    'unavailable',
  ].filter((hint) => message.toLowerCase().includes(hint.toLowerCase()));
  const diagnostic = /ENOTFOUND|DNS resolution failed/i.test(message)
    ? 'dns'
    : /certificate|TLS|SSL/i.test(message)
      ? 'tls'
      : /401|403|UNAUTHENTICATED|PERMISSION_DENIED/i.test(message)
        ? 'authentication'
        : /ECONNREFUSED/i.test(message)
          ? 'connection_refused'
          : /HTTP status code: (\d+)|HTTP status (\d+)/i.exec(message)?.[0] ||
            (/timeout|deadline/i.test(message)
              ? 'timeout'
              : /RST_STREAM|protocol error/i.test(message)
                ? 'http2_protocol'
                : 'unknown_transport');
  console.log(
    JSON.stringify({
      ok: false,
      code: safe.code || null,
      diagnostic,
      hints,
      reason: 'Tatum read probe failed; no payment was verified.',
    }),
  );
  process.exitCode = 1;
}
