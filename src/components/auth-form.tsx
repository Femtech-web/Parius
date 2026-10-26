'use client';
import { authCallbackUrl } from '@/lib/auth-navigation';
import { control } from '@/components/control-styles';

import { useState } from 'react';
import { ArrowRight, LoaderCircle, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
export function AuthForm({
  configured,
  next = '/dashboard',
}: {
  configured: boolean;
  next?: string;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function login(provider: 'google' | 'email') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const supabase = createClient();
      const redirectTo = authCallbackUrl(window.location.origin, next);
      const result =
        provider === 'google'
          ? await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
          : await supabase.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
            });
      if (result.error) throw result.error;
      if (provider === 'email')
        setNotice('Check your email. Open the sign-in link in this browser.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Sign-in could not start. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-9 [&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_label]:text-paper">
      <button
        className={`${control.secondary} w-full`}
        disabled={!configured || busy}
        onClick={() => login('google')}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.5ZM12 22c2.7 0 5-.9 6.7-2.4L15.4 17c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3v2.6A10 10 0 0 0 12 22Zm-5.6-8.2a6 6 0 0 1 0-3.6V7.6H3a10 10 0 0 0 0 8.8l3.4-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.6l3.4 2.6A6 6 0 0 1 12 6.1Z"
          />
        </svg>
        Continue with Google
      </button>
      <div className="my-7 flex items-center gap-4 text-xs text-ash [&_span]:h-px [&_span]:flex-1 [&_span]:bg-white/10">
        <span />
        or use your email
        <span />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login('email');
        }}
      >
        <label htmlFor="email">Email address</label>
        <div className="relative [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:text-ash [&_input]:pl-12">
          <Mail size={18} />
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstudio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!configured || busy}
          />
        </div>
        <button className={`${control.primary} w-full mt-4`} disabled={!configured || busy}>
          {busy ? (
            <LoaderCircle className="motion-safe:animate-spin" size={17} />
          ) : (
            <>
              Send sign-in link
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-white/5 p-4 text-[13px] leading-relaxed text-ash [&_p]:mt-2 [&_strong]:font-medium [&_strong]:text-paper bg-ice/10! text-ice!"
        >
          {notice}
        </p>
      )}
      {notice && <p className="mt-2 text-xs text-ash">Not in the inbox? Check spam.</p>}
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-white/5 p-4 text-[13px] leading-relaxed text-ash [&_p]:mt-2 [&_strong]:font-medium [&_strong]:text-paper bg-danger-soft! text-danger! [&_strong]:text-danger!"
        >
          {error}
        </p>
      )}
      {!configured && (
        <p className="mt-5 text-center text-xs leading-relaxed text-ash">
          Sign-in isn’t configured yet. You can explore the preview below.
        </p>
      )}
    </div>
  );
}
