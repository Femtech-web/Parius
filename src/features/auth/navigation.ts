import { safeNext } from '@/lib/domain';
/** Preserve the original allowed destination through sign-in, including retry paths. */
export function authLoginPath(next: string | null, error?: string) {
  const params = new URLSearchParams({ next: safeNext(next) });
  if (error) params.set('error', error);
  return `/login?${params}`;
}
export function authCallbackUrl(origin: string, next: string) {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', safeNext(next));
  return url.href;
}
/** Keep loopback aliases on their initiating host in development; pin production redirects. */
export function authResponseOrigin(
  configured: string | undefined,
  request: { url: string; headers: Pick<Headers, 'get'> },
  development: boolean,
) {
  const expected = new URL(configured || request.url);
  if (!['http:', 'https:'].includes(expected.protocol)) throw new Error('Invalid app origin.');
  if (!development) return expected.origin;
  const loopback = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname);
  for (const host of [
    request.headers.get('x-forwarded-host'),
    request.headers.get('host'),
    new URL(request.url).host,
  ]) {
    if (!host) continue;
    try {
      const candidate = new URL(`${expected.protocol}//${host}`);
      if (candidate.host !== host) continue;
      if (
        candidate.origin === expected.origin ||
        (loopback(expected) && loopback(candidate) && candidate.port === expected.port)
      )
        return candidate.origin;
    } catch {
      /* Untrusted or malformed host headers cannot become redirect destinations. */
    }
  }
  return expected.origin;
}
