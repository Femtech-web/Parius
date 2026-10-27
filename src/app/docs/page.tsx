import { publicPageMetadata } from '@/lib/site-metadata';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import {
  ConnectedProjectExample,
  DocumentationShell,
} from '@/features/documentation/components/documentation';
import { productDocs, projectFlow } from '@/features/documentation/content';
export const metadata = publicPageMetadata(
  '/docs',
  'Documentation',
  'Learn how to use Parius, from inviting a client and agreeing scope to payments, final files and confirmed lessons.',
);
export default function Docs() {
  return (
    <DocumentationShell>
      <p className="mb-5 text-xs text-ice">The Parius documentation</p>
      <h1 className="max-w-xl text-[clamp(2rem,3.5vw,2.5rem)] leading-[1.15] tracking-[-.045em]">
        From first conversation to final handoff.
      </h1>
      <p className="mt-7 max-w-[600px] text-[17px] leading-8 text-ash">
        Parius keeps your project conversation, agreement, milestones, invoices and files together.
        Here’s how you and your client move through the work.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm">
        <Link
          href="/docs/getting-started"
          className="inline-flex min-h-11 items-center gap-3 text-ice hover:text-paper"
        >
          Start your first project <ArrowUpRight size={15} />
        </Link>
        <Link href="/guide" className="inline-flex min-h-11 items-center text-ash hover:text-paper">
          Read the quick Product guide
        </Link>
      </div>
      <ConnectedProjectExample />
      <section aria-labelledby="flow-heading" className="mt-14 border-t border-white/10 pt-9">
        <h2 id="flow-heading" className="text-2xl tracking-[-.035em]">
          The project flow
        </h2>
        <ul role="list" className="mt-7 list-none divide-y divide-white/10">
          {projectFlow.map((step) => (
            <li key={step.title} className="py-7">
              <div>
                <h3 className="text-xl tracking-[-.025em]">{step.title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-ash">{step.text}</p>
                <Link
                  href={`/docs/${step.topic}`}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 text-[13px] text-ice hover:text-paper"
                >
                  Read the steps <ArrowUpRight size={13} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="topics-heading" className="mt-10 border-t border-white/10 pt-9">
        <h2 id="topics-heading" className="text-2xl tracking-[-.035em]">
          Find the step you need
        </h2>
        <div className="mt-6 grid gap-x-9 sm:grid-cols-2">
          {productDocs.map((doc) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="group border-b border-white/10 py-5"
            >
              <span className="flex items-center justify-between gap-4 text-base group-hover:text-ice">
                {doc.title}
                <ArrowUpRight size={14} className="text-ash group-hover:text-ice" />
              </span>
              <span className="mt-2 block text-[13px] leading-6 text-ash">{doc.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </DocumentationShell>
  );
}
