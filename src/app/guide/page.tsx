import { publicPageMetadata } from '@/lib/site-metadata';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { MarketingNav } from '@/features/marketing/components/home-experience';
import { projectFlow } from '@/features/documentation/content';
import { control } from '@/components/ui/control-styles';
export const metadata = publicPageMetadata(
  '/guide',
  'Product guide',
  'A plain-language walkthrough of a Parius project, from the client invitation to a paid invoice and released final.',
);
export default function Guide() {
  return (
    <>
      <MarketingNav />
      <main
        id="main"
        className="mx-auto max-w-[1040px] px-6 pt-10 pb-20 md:px-12 md:pt-16 md:pb-28"
      >
        <Link
          href="/dashboard"
          className="mb-10 inline-flex min-h-11 items-center gap-3 text-xs text-ash hover:text-ice"
        >
          <ArrowLeft size={14} />
          Back to your workspace
        </Link>
        <p className="mb-5 text-xs text-ice">Product guide</p>
        <h1 className="max-w-2xl text-[clamp(2.75rem,5.5vw,4.5rem)] leading-[1.04] tracking-[-.06em]">
          A project, step by step.
        </h1>
        <p className="mt-7 max-w-[630px] text-[17px] leading-8 text-ash">
          You do the work. Your client reviews it. Parius keeps the conversation, decisions and
          payments connected, so you both know what comes next.
        </p>
        <nav
          aria-label="Guide shortcuts"
          className="mt-9 flex flex-wrap gap-x-7 gap-y-1 border-y border-white/10 py-4 text-[13px] text-ash"
        >
          <a href="#step-1" className="inline-flex min-h-10 items-center hover:text-ice">
            Start a project
          </a>
          <a href="#step-4" className="inline-flex min-h-10 items-center hover:text-ice">
            Get paid
          </a>
          <a href="#step-5" className="inline-flex min-h-10 items-center hover:text-ice">
            Release a final
          </a>
          <Link
            href="/docs"
            className="inline-flex min-h-10 items-center gap-2 text-ice hover:text-paper"
          >
            All documentation <ArrowUpRight size={13} />
          </Link>
        </nav>
        <ol className="mt-5 divide-y divide-white/10">
          {projectFlow.map((step, i) => (
            <li
              id={`step-${i + 1}`}
              key={step.title}
              className="grid scroll-mt-8 gap-5 py-10 sm:grid-cols-[160px_1fr] sm:gap-10"
            >
              <div>
                <span className="mb-3 block text-xs tabular-nums text-ice">0{i + 1}</span>
                <span className="text-xs leading-6 text-ash">{step.actor}</span>
              </div>
              <div>
                <h2 className="text-2xl tracking-[-.035em] md:text-[28px]">{step.title}</h2>
                <p className="mt-4 max-w-[620px] text-base leading-8 text-ash">{step.text}</p>
                {i === 1 && (
                  <p className="mt-4 text-sm leading-7 text-ash">
                    A new proposal keeps the old agreement in place until both people approve the
                    replacement. Chat messages and AI suggestions cannot change the terms by
                    themselves.
                  </p>
                )}
                {i === 3 && (
                  <p className="mt-4 text-sm leading-7 text-ash">
                    Confirming payment instructions does not send money. The client reviews and
                    signs the actual transfer in their wallet. A matched receipt then awaits the
                    freelancer’s reconciliation.
                  </p>
                )}
                {i === 4 && (
                  <p className="mt-4 text-sm leading-7 text-ash">
                    A locked final is a file the client cannot download yet. The client can still
                    pay the invoice. Milestone previews let them review the work before the final
                    handoff.
                  </p>
                )}
                <Link
                  href={`/docs/${step.topic}`}
                  className="mt-5 inline-flex min-h-11 items-center gap-3 text-[13px] text-ice hover:text-paper"
                >
                  See the exact steps <ArrowUpRight size={14} />
                </Link>
              </div>
            </li>
          ))}
        </ol>
        <section aria-labelledby="guide-helpers" className="mt-5 border-t border-white/10 pt-10">
          <h2 id="guide-helpers" className="text-2xl tracking-[-.035em]">
            A little help along the way.
          </h2>
          <div className="mt-7 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: 'Reply to a new request',
                text: 'Ask Parius to review scope, inspect its evidence, then edit a suggested reply before you send it.',
                topic: 'conversation',
              },
              {
                title: 'Follow up on an invoice',
                text: 'Record a payment promise or prepare a private AI-assisted reminder. Review it before sending.',
                topic: 'follow-ups',
              },
              {
                title: 'See what happened',
                text: 'Activity records shared approvals, payments and file releases. Private drafts and AI reviews stay private.',
                topic: 'getting-started',
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-base">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ash">{item.text}</p>
                <Link
                  href={`/docs/${item.topic}`}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-ice hover:text-paper"
                >
                  Learn more <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </section>
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-5 border-t border-white/10 pt-8">
          <Link href="/dashboard" className={control.primary}>
            Open your workspace <ArrowUpRight size={14} />
          </Link>
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center gap-3 text-sm text-ash hover:text-ice"
          >
            Browse documentation <ArrowRight size={14} />
          </Link>
        </footer>
      </main>
    </>
  );
}
