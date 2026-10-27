import { PageMotion } from '@/components/ui/page-motion';
import { control } from '@/components/ui/control-styles';
import Link from 'next/link';
export default function NotFound() {
  return (
    <PageMotion>
      <main
        id="main"
        className="mx-auto min-h-svh max-w-3xl px-6 py-10 text-paper md:px-10 md:py-16 [&>a:first-child]:mb-16 [&>h1]:my-6 [&>h1]:text-4xl [&>h1]:font-normal [&>h1]:tracking-[-.05em] md:[&>h1]:text-6xl [&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:text-2xl [&>h2]:font-normal [&>p]:max-w-prose [&>p]:text-base [&>p]:text-ash [&>button]:mt-8 [&>a:last-child]:mt-8"
      >
        <span className="block text-[11px] font-medium tracking-[.08em]">NOT FOUND</span>
        <h1>This page isn’t available.</h1>
        <p>The link may be incorrect, or this project isn’t shared with your account.</p>
        <Link className={control.primary} href="/dashboard">
          Back to workspace
        </Link>
      </main>
    </PageMotion>
  );
}
