import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MarketingNav } from '@/features/marketing/components/home-experience';
import { productDocs, type ProductDoc } from '@/features/documentation/content';
const topicLabels: Record<string, string> = {
  'getting-started': 'Getting started',
  agreements: 'Agreements',
  conversation: 'Conversation & scope',
  milestones: 'Milestones',
  files: 'Files & final handoff',
  payments: 'Invoices & payments',
  'follow-ups': 'Promises & follow-ups',
  memory: 'Memory & lessons',
  agents: 'Project agents',
};
function Contents({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation topics" className="space-y-1 text-[13px]">
      <Link
        href="/docs"
        aria-current={!current ? 'page' : undefined}
        className={`block rounded-lg px-3 py-2.5 ${!current ? 'bg-ice/8 text-ice' : 'text-ash hover:text-paper'}`}
      >
        Overview
      </Link>
      {productDocs.map((doc) => (
        <Link
          key={doc.slug}
          href={`/docs/${doc.slug}`}
          aria-current={current === doc.slug ? 'page' : undefined}
          className={`block rounded-lg px-3 py-2.5 transition-colors ${current === doc.slug ? 'bg-ice/8 text-ice' : 'text-ash hover:text-paper'}`}
        >
          {topicLabels[doc.slug]}
        </Link>
      ))}
    </nav>
  );
}
export function DocumentationShell({
  current,
  children,
}: {
  current?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingNav active="docs" />
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1280px] px-6 md:px-12 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14 lg:px-16">
          <aside className="hidden border-r border-white/10 pr-6 lg:block">
            <div className="sticky top-8 py-12">
              <p className="mb-5 px-3 text-xs text-ash">Documentation</p>
              <Contents current={current} />
              <Link
                href="/guide"
                className="mt-8 block border-t border-white/10 px-3 pt-6 text-xs text-ash hover:text-ice"
              >
                Prefer a quick walkthrough? →
              </Link>
            </div>
          </aside>
          <div className="min-w-0">
            <details className="border-b border-white/10 py-4 lg:hidden">
              <summary className="py-2 text-sm text-ash">Browse documentation</summary>
              <div className="pt-4 pb-2">
                <Contents current={current} />
              </div>
            </details>
            <main id="main" className="max-w-[760px] pt-12 pb-20 md:pt-16 md:pb-28">
              {children}
            </main>
          </div>
        </div>
      </div>
      <footer className="border-t border-white/10 px-6 py-7 text-xs text-ash md:px-12">
        <div className="mx-auto flex max-w-[1152px] flex-wrap items-center justify-between gap-5">
          <span>Parius · A shared way forward.</span>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-3 hover:text-ice"
          >
            Open your workspace <ArrowRight size={14} />
          </Link>
        </div>
      </footer>
    </>
  );
}
export function DocumentationArticle({ doc }: { doc: ProductDoc }) {
  const index = productDocs.findIndex((d) => d.slug === doc.slug),
    previous = productDocs[index - 1],
    next = productDocs[index + 1];
  return (
    <DocumentationShell current={doc.slug}>
      <p className="mb-5 text-xs text-ash">
        <Link href="/docs" className="hover:text-ice">
          Documentation
        </Link>
        <span aria-hidden="true" className="mx-3 text-ash/50">
          /
        </span>
        {doc.title}
      </p>
      <h1 className="max-w-2xl text-[clamp(2.5rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-.055em]">
        {doc.title}
      </h1>
      <p className="mt-6 max-w-[640px] text-[17px] leading-8 text-ash">{doc.description}</p>
      <nav aria-label="On this page" className="mt-9 border-y border-white/10 py-5">
        <p className="mb-2 text-xs text-ash">On this page</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {doc.sections.map((s, i) => (
            <li key={s.title}>
              <a
                href={`#section-${i + 1}`}
                className="inline-flex min-h-9 items-center text-[13px] text-ice hover:text-paper"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="mt-12 space-y-14 text-[15px] leading-7 md:text-base md:leading-8">
        {doc.sections.map((section, i) => (
          <section id={`section-${i + 1}`} key={section.title} className="scroll-mt-8">
            <h2 className="mb-5 text-2xl leading-tight tracking-[-.035em] md:text-[28px]">
              {section.title}
            </h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="mt-4 text-ash">
                {p}
              </p>
            ))}
            {section.steps && (
              <ol className="list-decimal space-y-4 pl-5 text-ash marker:text-ice">
                {section.steps.map((step) => (
                  <li key={step} className="pl-3">
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {section.terms && (
              <dl className="divide-y divide-white/10 border-y border-white/10">
                {section.terms.map(([term, detail]) => (
                  <div key={term} className="py-5 sm:grid sm:grid-cols-[160px_1fr] sm:gap-6">
                    <dt className="mb-2 text-sm text-paper sm:mb-0">{term}</dt>
                    <dd className="text-[15px] leading-7 text-ash">{detail}</dd>
                  </div>
                ))}
              </dl>
            )}
            {section.code && (
              <pre className="mt-6 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate p-5 text-[13px] leading-6 text-paper">
                <code>{section.code}</code>
              </pre>
            )}
            {section.note && (
              <p className="mt-6 border-l-2 border-ice/50 pl-5 text-sm leading-7 text-ash">
                {section.note}
              </p>
            )}
          </section>
        ))}
      </article>
      <nav
        aria-label="Continue reading"
        className="mt-16 flex flex-wrap justify-between gap-8 border-t border-white/10 pt-7 text-sm"
      >
        <Link
          href={previous ? `/docs/${previous.slug}` : '/docs'}
          className="group flex min-h-12 items-center gap-3 text-ash hover:text-paper"
        >
          <ArrowLeft size={16} />
          <span>
            <span className="mb-1 block text-xs">Previous</span>
            {previous?.title ?? 'Overview'}
          </span>
        </Link>
        {next && (
          <Link
            href={`/docs/${next.slug}`}
            className="group ml-auto flex min-h-12 items-center gap-3 text-ice hover:text-paper"
          >
            <span>
              <span className="mb-1 block text-xs text-ash">Next</span>
              {next.title}
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
      </nav>
    </DocumentationShell>
  );
}
