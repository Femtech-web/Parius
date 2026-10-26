import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { AuthForm } from '@/components/auth-form';
import { PageMotion } from '@/components/page-motion';
import { isSupabaseConfigured } from '@/lib/env';
import { safeNext } from '@/lib/domain';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const next = safeNext(params.next || null);
  const invited = next.startsWith('/invite/');
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user) redirect(next);
  }
  return (
    <main
      id="main"
      className="flex min-h-svh items-center justify-center bg-night px-6 py-12 text-paper"
    >
      <PageMotion className="w-full max-w-[360px]">
        <header className="text-center">
          <Brand />
          <h1 className="mt-10 text-[30px] font-normal leading-tight tracking-[-.045em]">
            {invited ? 'Join your project.' : 'Welcome back.'}
          </h1>
          <p className="mt-3 text-sm text-ash">
            {invited ? 'Sign in or create your account to continue.' : 'Sign in to your workspace.'}
          </p>
        </header>
        {params.error && (
          <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">
            Sign-in didn’t finish. Please try again below.
          </p>
        )}
        <AuthForm configured={configured} next={next} />
        {!invited && (
          <Link
            href="/preview"
            className="mt-6 flex min-h-11 items-center justify-center gap-2 text-xs text-ash transition-colors hover:text-ice"
          >
            Explore the preview <ArrowUpRight size={13} />
          </Link>
        )}
      </PageMotion>
    </main>
  );
}
