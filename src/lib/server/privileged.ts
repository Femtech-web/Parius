import 'server-only';
import { createClient } from '@supabase/supabase-js';
// Reserved for recording trusted provider results. User operations use their RLS
// session; never export this client from a client component or a server action.
export function privilegedClient(timeoutMs?: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('The analysis service is not configured.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(timeoutMs
      ? {
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
                  : AbortSignal.timeout(timeoutMs),
              }),
          },
        }
      : {}),
  });
}
