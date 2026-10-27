'use client';
import { control } from '@/components/ui/control-styles';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from '@/features/projects/server/project-actions';
import { type ActionResult } from '@/lib/action-result';
import { createClient } from '@/lib/supabase/client';
import { authLoginPath } from '@/features/auth/navigation';
export function AcceptInvite({ token, email }: { token: string; email?: string }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [switching, setSwitching] = useState(false);
  return (
    <>
      {email && <p className="mb-4 break-all text-sm text-ash">Signed in as {email}</p>}
      <button
        className={control.primary}
        disabled={pending || switching}
        onClick={() =>
          start(async () => {
            try {
              const result = await acceptInvite(token);
              setState(
                result.error === 'A separate client account is required.'
                  ? {
                      error:
                        'Use the client’s account to join. If a client has already joined, open the project from Projects.',
                    }
                  : result,
              );
              if (result.url) router.push(result.url);
            } catch (error) {
              if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
              setState({ error: 'Could not join this project. Please try again.' });
            }
          })
        }
      >
        {pending ? 'Joining project…' : 'Accept invitation'}
      </button>
      <button
        type="button"
        className="mt-4 block text-sm text-ash transition-colors hover:text-paper disabled:opacity-50"
        disabled={pending || switching}
        onClick={async () => {
          setSwitching(true);
          setState({});
          try {
            const { error } = await createClient().auth.signOut({ scope: 'local' });
            if (error) throw error;
            window.location.assign(authLoginPath(`/invite/${token}`));
          } catch {
            setState({ error: 'Could not switch accounts. Please try again.' });
            setSwitching(false);
          }
        }}
      >
        {switching ? 'Signing out…' : 'Use another account'}
      </button>
      {state.error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-white/5 p-4 text-[13px] leading-relaxed text-ash [&_p]:mt-2 [&_strong]:font-medium [&_strong]:text-paper bg-danger-soft! text-danger! [&_strong]:text-danger!"
        >
          {state.error}
        </p>
      )}
    </>
  );
}
