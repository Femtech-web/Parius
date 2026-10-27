import { authLoginPath } from '@/features/auth/navigation';
import { PageMotion } from '@/components/ui/page-motion';
import { control } from '@/components/ui/control-styles';
import Link from 'next/link';
import { Brand } from '@/components/ui/brand';
import { AcceptInvite } from '@/features/projects/components/accept-invite';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  return (
    <PageMotion>
      <main
        id="main"
        className="mx-auto min-h-svh max-w-3xl px-6 py-10 text-paper md:px-10 md:py-16 [&>a:first-child]:mb-16 [&>h1]:my-6 [&>h1]:text-4xl [&>h1]:font-normal [&>h1]:tracking-[-.05em] md:[&>h1]:text-6xl [&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:text-2xl [&>h2]:font-normal [&>p]:max-w-prose [&>p]:text-base [&>p]:text-ash [&>button]:mt-8 [&>a:last-child]:mt-8"
      >
        <Brand />
        <h1>You’re invited.</h1>
        <p>Join your freelancer’s project.</p>
        <div className="mt-8">
          {user ? (
            <AcceptInvite token={token} email={user.email} />
          ) : (
            <Link className={control.primary} href={authLoginPath(`/invite/${token}`)}>
              Sign in to join the project
            </Link>
          )}
        </div>
      </main>
    </PageMotion>
  );
}
