'use client';
import { PageMotion } from '@/components/page-motion';

import { control } from '@/components/control-styles';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PageMotion>
      <main
        id="main"
        className="mx-auto min-h-svh max-w-3xl px-6 py-10 text-paper md:px-10 md:py-16 [&>a:first-child]:mb-16 [&>h1]:my-6 [&>h1]:text-4xl [&>h1]:font-normal [&>h1]:tracking-[-.05em] md:[&>h1]:text-6xl [&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:text-2xl [&>h2]:font-normal [&>p]:max-w-prose [&>p]:text-base [&>p]:text-ash [&>button]:mt-8 [&>a:last-child]:mt-8"
      >
        <span className="block text-[11px] font-medium tracking-[.08em]">LET’S TRY THAT AGAIN</span>
        <h1>This page couldn’t load.</h1>
        <p>Please try again, or check your connection.</p>
        <button className={control.primary} onClick={reset}>
          Try again
        </button>
      </main>
    </PageMotion>
  );
}
