import { MemoryMark } from '@/features/memory/components/memory-mark';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  Flag,
  Wallet,
  LockKeyhole,
  MessageCircle,
  Plus,
} from 'lucide-react';
import {
  HomeExperience,
  MarketingNav,
  ScopeReview,
} from '@/features/marketing/components/home-experience';
import { HomeScene } from '@/features/marketing/components/home-scene';

const wrap = 'mx-auto w-full max-w-[1280px] px-6 md:px-12 lg:px-20';
const heading = 'text-[clamp(2.5rem,5.1vw,4.5rem)] font-normal leading-[1.04] tracking-[-0.055em]';
const featureHeading =
  'text-[clamp(2rem,3.4vw,3rem)] font-normal leading-[1.12] tracking-[-0.045em]';
const copy = 'text-base leading-relaxed text-ash md:text-[17px]';
const action =
  'group inline-flex min-h-12 items-center justify-center gap-5 rounded-full bg-ice px-6 text-sm font-medium text-night! transition-colors hover:bg-paper active:scale-[0.98]';
const textLink =
  'group inline-flex min-h-11 items-center gap-3 text-sm transition-colors hover:text-ice';

function Arrow() {
  return (
    <ArrowUpRight
      size={16}
      className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
    />
  );
}
function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <path d="M9 31V9h12a8 8 0 0 1 0 16H9" stroke="currentColor" strokeWidth="5" />
      <path d="M21 9v22" stroke="currentColor" strokeWidth="2" opacity=".4" />
    </svg>
  );
}

function ProjectVisual() {
  return (
    <div className="overflow-hidden rounded-2xl bg-slate">
      <div className="px-7 pt-8 sm:px-10">
        <span className="text-xs text-ash">The conversation</span>
        <h3 className="mt-3 text-3xl font-normal tracking-[-0.04em]">Everything in context.</h3>
        <p className="mt-3 max-w-sm text-sm text-ash">
          A dedicated space for the work, the questions, and the decisions in between.
        </p>
      </div>
      <div className="mt-10 mr-0 ml-7 overflow-hidden rounded-tl-xl border-t border-l border-white/12 bg-night sm:ml-10">
        <div className="flex items-center gap-3 border-b border-white/10 p-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-ice/10 text-ice">
            <MessageCircle size={16} />
          </div>
          <div>
            <span className="block text-sm">Studio website</span>
            <span className="text-xs text-ash">Maya & Alex · Illustrative project</span>
          </div>
          <span className="ml-auto mr-4 size-2 rounded-full bg-ice" />
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <div className="max-w-[88%]">
            <div className="mb-2 flex items-center gap-2 text-xs text-ash">
              <span className="flex size-6 items-center justify-center rounded-full bg-paper/10 text-paper">
                M
              </span>
              Maya · Client
            </div>
            <p className="rounded-2xl rounded-tl-sm bg-white/6 p-4 text-sm text-paper/90">
              The direction looks great. Let’s keep the homepage simple and give the photography
              room to breathe.
            </p>
          </div>
          <div className="ml-auto max-w-[88%]">
            <span className="mb-2 block text-right text-xs text-ash">Alex · Freelancer</span>
            <p className="rounded-2xl rounded-tr-sm bg-ice/12 p-4 text-sm text-ice">
              Agreed. I’ve added the direction to our project brief.
            </p>
            <CheckCheck size={14} className="mt-2 ml-auto text-ice" />
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 pt-4 text-xs text-ash">
            <FileText size={14} />
            <span>Brief, agreement and milestones stay connected.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
function AgreementVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-fog text-night">
      <div className="relative z-10 px-7 pt-8 sm:px-10">
        <span className="text-xs text-stone">The commitment</span>
        <h3 className="mt-3 text-3xl font-normal tracking-[-0.04em]">Clear before you begin.</h3>
        <p className="mt-3 max-w-sm text-sm text-stone">
          Deliverables, milestones and approvals. A shared understanding you can come back to.
        </p>
      </div>
      <div className="relative mx-7 mt-10 sm:mx-10">
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-3 translate-y-4 rotate-3 rounded-t-xl bg-night/8"
        />
        <div
          data-drift
          className="relative min-h-80 rounded-t-xl bg-white p-6 shadow-[0_20px_60px_-20px_rgb(8_9_11/0.2)] sm:p-8"
        >
          <div className="flex items-start justify-between">
            <LogoMark className="size-8" />
            <span className="rounded-full bg-fog px-3 py-1.5 text-[11px] text-stone">
              Example agreement
            </span>
          </div>
          <h4 className="mt-6 text-2xl font-normal tracking-tight">Studio website</h4>
          <p className="mt-2 text-xs text-stone">Prepared for Maya · By Alex</p>
          <div className="mt-7 flex items-center justify-between border-y border-night/10 py-5">
            <span className="text-sm text-stone">Design & development</span>
            <span className="text-base tabular-nums">1,800 USDC</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm">
            <Check size={15} />
            <span>Five pages. Two revision rounds.</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-stone">
            <LockKeyhole size={13} />
            <span>Changes need both people’s approval.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const questions = [
  [
    'What is Parius?',
    'Parius is a shared workspace for freelancers and clients. It brings the project conversation, agreed scope, milestones and payment history into one place, so both people can see what was decided and what comes next.',
  ],
  [
    'What can I use today?',
    'You can create a private project, invite a client, agree scope, review milestones, share files, issue invoices and verify Sui USDC payments on Testnet or Mainnet when enabled. Scope reviews can recall confirmed lessons from Walrus Memory. Parius is in development; the public preview uses clearly labelled fictional examples.',
  ],
  [
    'Can AI change an agreement or make a payment?',
    'No. AI can help identify a request that may fall outside the agreed scope and draft a reply. Both people must explicitly approve agreement changes. Payment authorization remains a separate human action.',
  ],
  [
    'How does Parius learn across projects?',
    'A scope review can suggest a useful lesson. The freelancer confirms, edits or dismisses it in Memory. Confirmed lessons are stored through Walrus and recalled when relevant in later reviews, including after a new session. Personal lessons stay private; project lessons stay within their project context.',
  ],
  [
    'Do my clients need to understand crypto?',
    'The workspace uses familiar invitations, conversations and approvals. For Sui payments, Parius shows the token, recipient, amount and network before you authorize a transfer. Use Testnet to try the flow with test tokens, or Mainnet for real USDC. The project’s payment mode is fixed after its first invoice is issued. Wallet and gas sponsorship options depend on the configured provider.',
  ],
];

export function HomePage() {
  return (
    <HomeExperience>
      <MarketingNav />
      <main id="main">
        <section
          aria-labelledby="hero-heading"
          className="relative pt-12 text-center sm:pt-14 lg:pt-16"
        >
          <div className={`${wrap} relative z-10`}>
            <p data-hero-copy className="mb-6 text-xs tracking-[0.08em] text-ash">
              A little more clarity. A lot better together.
            </p>
            <h1
              id="hero-heading"
              data-hero-copy
              className="mx-auto max-w-4xl text-[clamp(3rem,6.6vw,5.5rem)] font-normal leading-[0.99] tracking-[-0.065em]"
            >
              On the same page.
              <br />
              <span className="text-ash">From start to paid.</span>
            </h1>
            <p
              data-hero-copy
              className="mx-auto mt-7 max-w-[475px] text-base leading-relaxed text-ash sm:text-[17px]"
            >
              A shared workspace for freelancers and clients. Keep the conversation, the agreement
              and the next step together.
            </p>
            <div
              data-hero-copy
              className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
            >
              <Link href="/dashboard" className={action}>
                Start a project <Arrow />
              </Link>
              <Link href="/preview" className={textLink}>
                Explore the workspace{' '}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          <div className="relative -mt-5 sm:-mt-4">
            <HomeScene />
            <p className="-mt-4 pb-10 text-xs text-ash">
              Independent people. Shared understanding.
            </p>
          </div>
        </section>

        <section
          id="workspace"
          aria-labelledby="workspace-heading"
          className={`${wrap} scroll-mt-12 pt-20 pb-24 md:pt-28 md:pb-32`}
        >
          <div
            data-reveal
            className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end"
          >
            <h2 id="workspace-heading" className={heading}>
              Less chasing.
              <br />
              More creating.
            </h2>
            <p className={`${copy} max-w-[350px]`}>
              Good projects need more than another chat. Give every conversation a place to become a
              clear next step.
            </p>
          </div>
          <div data-reveal className="grid gap-5 md:grid-cols-2">
            <ProjectVisual />
            <AgreementVisual />
          </div>
          <div className="mt-6 flex flex-col justify-between gap-3 text-xs text-ash sm:flex-row">
            <p>Illustrative project. Your workspace starts with your own people and work.</p>
            <Link
              href="/preview"
              className="group inline-flex min-h-8 items-center gap-2 text-paper"
            >
              Take a closer look <Arrow />
            </Link>
          </div>
        </section>

        <section
          id="approach"
          aria-labelledby="approach-heading"
          className={`${wrap} scroll-mt-20 pb-28 md:pb-40`}
        >
          <div data-reveal className="mx-auto max-w-3xl text-center">
            <p className="mb-5 text-xs text-ice">How Parius fits together</p>
            <h2 id="approach-heading" className={heading}>
              From the first brief.
              <br />
              Through every next step.
            </h2>
            <p className={`${copy} mx-auto mt-6 max-w-lg`}>
              Start a project, invite your client and keep the decisions with the work. Each step
              builds on what you have already agreed.
            </p>
          </div>
          <div data-reveal className="mt-16 grid gap-10 md:grid-cols-3 md:gap-12">
            {[
              {
                icon: MessageCircle,
                title: 'Start a private project.',
                text: 'Invite your client into a shared workspace. Keep the brief, questions and feedback together.',
              },
              {
                icon: FileText,
                title: 'Agree on the details.',
                text: 'Set the scope, price and revision limits. Each person approves the same version before it becomes active.',
              },
              {
                icon: LockKeyhole,
                title: 'Review changes together.',
                text: 'A new request can become a new proposal. Existing terms stay in place until both people approve the change.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="border-t border-white/15 pt-7">
                <Icon size={23} strokeWidth={1.3} className="mb-6 text-ice" />
                <h3 className="text-xl font-normal tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ash">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="scope-heading"
          className="relative overflow-hidden rounded-[28px] bg-fog py-20 text-night md:rounded-[40px] md:py-28 [--focus-color:var(--color-night)]"
        >
          <div className={`${wrap} grid items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-24`}>
            <div data-reveal>
              <span className="text-xs text-stone">For the “one small thing” that isn’t.</span>
              <h2 id="scope-heading" className={`${featureHeading} mt-6`}>
                A new request.
                <br />A fair conversation.
              </h2>
              <p className="mt-7 max-w-md text-base leading-relaxed text-stone">
                Projects evolve. Ask Parius to review a new request against the approved scope, so
                you can discuss the difference between a revision and a new deliverable.
              </p>
              <p className="mt-4 max-w-md text-base leading-relaxed text-stone">
                See the context, discuss a proposal, and agree on the next step together.
              </p>
              <div className="mt-8 flex items-center gap-3 text-sm">
                <span className="flex size-7 items-center justify-center rounded-full border border-night/20">
                  <Check size={13} />
                </span>
                Both people approve. Always.
              </div>
              <Link
                href="/guide"
                className="group mt-7 inline-flex min-h-11 items-center gap-3 text-sm"
              >
                Read how approvals work <Arrow />
              </Link>
            </div>
            <div data-reveal>
              <ScopeReview />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-48 -left-48 size-96 rounded-full border-[45px] border-night/3"
          />
        </section>

        <section aria-labelledby="delivery-heading" className={`${wrap} py-28 md:py-36`}>
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
            <div data-reveal>
              <p className="text-xs text-ice">Milestones, review and payment</p>
              <h2 id="delivery-heading" className={`${featureHeading} mt-6`}>
                Deliver the work.
                <br />
                Close the loop.
              </h2>
              <p className={`${copy} mt-7 max-w-md`}>
                Break the project into milestones. Submit each deliverable for review, then let your
                client accept it or request changes with the agreement in view.
              </p>
              <p className={`${copy} mt-4 max-w-md`}>
                Accepting work and authorizing payment are separate decisions. Tatum checks the USDC
                transfer on Sui. The freelancer then reconciles the receipt against the invoice.
              </p>
              <Link href="/preview" className={`${textLink} mt-7`}>
                Explore the project workflow <Arrow />
              </Link>
            </div>
            <div data-reveal className="relative">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate">
                <div className="flex items-center gap-3 border-b border-white/10 p-6 text-sm">
                  <Flag size={17} strokeWidth={1.4} className="text-ice" />
                  Studio website
                  <span className="ml-auto text-[11px] text-ash">Illustrative project</span>
                </div>
                <div className="space-y-7 p-7">
                  <div className="flex items-center gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ice/10 text-ice">
                      <Check size={14} />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm">Design direction</p>
                      <span className="text-xs text-ash">Reviewed and accepted</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ice/10 text-ice">
                      <Check size={14} />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm">Website design</p>
                      <span className="text-xs text-ash">Reviewed and accepted</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-ice/40 text-ice">
                      <FileText size={14} />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm">Build & handoff</p>
                      <span className="text-xs text-ice">Ready for client review</span>
                    </div>
                  </div>
                </div>
                <div className="m-4 mt-0 rounded-xl bg-fog p-6 text-night">
                  <div className="flex items-center gap-2 text-xs text-stone">
                    <Wallet size={15} />
                    Final payment<span className="ml-auto tabular-nums text-night">900 USDC</span>
                  </div>
                  <p className="mt-4 text-lg tracking-tight">Approval first. Verification next.</p>
                  <p className="mt-2 text-xs text-stone">
                    Payment concept · Nothing is paid or verified in this example.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="memory-heading" className={`${wrap} pt-4 pb-28 md:pt-8 md:pb-36`}>
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
            <div data-reveal className="order-2 lg:order-1">
              <div className="relative mx-auto max-w-md py-9">
                <div
                  aria-hidden="true"
                  className="absolute inset-x-8 top-0 h-44 rotate-[-8deg] rounded-2xl border border-ice/15 bg-slate"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-4 top-4 h-44 rotate-[-3deg] rounded-2xl border border-ice/20 bg-slate"
                />
                <div
                  data-drift
                  className="relative rounded-2xl border border-white/15 bg-slate p-7 sm:p-9"
                >
                  <div className="flex items-center gap-2 text-xs text-ice">
                    <MemoryMark size={15} />A lesson worth keeping
                  </div>
                  <p className="mt-7 text-2xl leading-snug tracking-tight">
                    “Revisions refine what’s agreed. A new feature needs a new conversation.”
                  </p>
                  <div className="mt-7 border-t border-white/10 pt-5">
                    <span className="flex items-center gap-2 text-xs text-ash">
                      <Check size={13} />
                      Confirmed by you
                    </span>
                  </div>
                </div>
                <div className="relative mx-5 mt-4 flex items-start gap-3 rounded-xl bg-ice/8 p-5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ice" />
                  <p className="text-sm text-ash">
                    Next project, better context.
                    <br />
                    <span className="text-ice">Remember the lesson. Apply it carefully.</span>
                  </p>
                </div>
                <p className="mt-5 text-center text-xs text-ash">
                  Illustrative lesson · Confirm, store and recall
                </p>
              </div>
            </div>
            <div data-reveal className="order-1 lg:order-2">
              <span className="text-xs text-ice">A workspace that grows with you</span>
              <h2 id="memory-heading" className={`${featureHeading} mt-6`}>
                Good context.
                <br />
                Better next projects.
              </h2>
              <p className={`${copy} mt-7 max-w-md`}>
                Your experience shouldn’t disappear when a project ends. Confirm the lessons Parius
                should remember, then bring that context into a later scope review.
              </p>
              <p className={`${copy} mt-4 max-w-md`}>
                Useful understanding that carries forward, so your next project starts with the
                lessons from the last.
              </p>
              <a href="#foundation" className={`${textLink} mt-7`}>
                Meet the foundation <Arrow />
              </a>
            </div>
          </div>
        </section>

        <section
          id="foundation"
          aria-labelledby="foundation-heading"
          className={`${wrap} scroll-mt-16 pb-28 md:pb-36`}
        >
          <div data-reveal className="mb-12 max-w-2xl">
            <h2
              id="foundation-heading"
              className="text-4xl font-normal leading-tight tracking-[-0.045em] md:text-5xl"
            >
              The foundation behind the work.
            </h2>
            <p className={`${copy} mt-5 max-w-lg`}>
              Lasting context and verifiable payments are part of the foundation. Here’s how each
              integration supports the work.
            </p>
          </div>
          <div data-reveal className="grid gap-5 md:grid-cols-2">
            <article className="flex flex-col justify-between rounded-2xl bg-slate p-7 sm:p-10">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-medium tracking-tight">Walrus Memory</h3>
                  <span className="flex size-10 items-center justify-center rounded-full border border-white/15 text-ice">
                    <MemoryMark size={18} strokeWidth={1.4} />
                  </span>
                </div>
                <p className="mt-6 max-w-sm text-base text-ash">
                  Confirmed lessons that persist across sessions and inform a later review. Learning
                  must change the assistance you receive.
                </p>
              </div>
              <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-5 text-xs">
                <span className="text-ash">Confirmed lessons, recalled with evidence</span>
                <a
                  href="https://walrus.xyz/products/walrus-memory/"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-8 items-center gap-2"
                >
                  Explore Walrus <Arrow />
                </a>
              </div>
            </article>
            <article className="flex flex-col justify-between rounded-2xl bg-slate p-7 sm:p-10">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-medium tracking-tight">Tatum × Sui</h3>
                  <span className="flex size-10 items-center justify-center rounded-full border border-white/15 text-ice">
                    <CheckCheck size={18} strokeWidth={1.4} />
                  </span>
                </div>
                <p className="mt-6 max-w-sm text-base text-ash">
                  USDC payments checked against real Sui transactions. The recipient, currency,
                  amount and successful execution must match the onchain record.
                </p>
              </div>
              <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-5 text-xs">
                <span className="text-ash">Sui payments · Testnet and Mainnet</span>
                <Link href="/docs/payments" className="group flex min-h-8 items-center gap-2">
                  Our payment approach <Arrow />
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section
          id="questions"
          aria-labelledby="questions-heading"
          className={`${wrap} scroll-mt-16 pb-28 md:pb-36`}
        >
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
            <div data-reveal>
              <h2 id="questions-heading" className={featureHeading}>
                Frequently asked questions
              </h2>
              <p className={`${copy} mt-5`}>About the workspace, approvals and your next step.</p>
            </div>
            <div data-reveal className="space-y-3">
              {questions.map(([question, answer]) => (
                <details key={question} className="group rounded-xl bg-slate px-6 open:pb-6">
                  <summary className="flex min-h-18 cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm [&::-webkit-details-marker]:hidden">
                    {question}
                    <Plus
                      size={16}
                      className="shrink-0 text-ash transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                    />
                  </summary>
                  <p className="max-w-xl pr-5 text-sm text-ash">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={`${wrap} pb-28 text-center md:pb-36`}>
          <div data-reveal className="border-t border-white/15 pt-24">
            <LogoMark className="mx-auto mb-8 size-10 text-ice" />
            <h2 className={heading}>
              Make room for
              <br />
              your best work.
            </h2>
            <p className={`${copy} mx-auto mt-6 max-w-md`}>
              Start with a conversation.
              <br />
              Build on a shared understanding.
            </p>
            <Link href="/dashboard" className={`${action} mt-8`}>
              Start a project <Arrow />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10">
        <div className={`${wrap} pt-16 pb-8`}>
          <div className="flex flex-col justify-between gap-10 sm:flex-row">
            <div>
              <Link href="/" className="text-3xl font-medium tracking-[-0.07em]">
                parius<span className="text-ice">.</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm text-ash">
                Independent work.
                <br />A shared way forward.
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-16 gap-y-8">
              <div className="flex flex-col gap-3 text-sm">
                <span className="mb-2 text-xs text-ash">Explore</span>
                <Link href="/preview" className="flex min-h-8 items-center hover:text-ice">
                  Workspace preview
                </Link>
                <a href="#approach" className="flex min-h-8 items-center hover:text-ice">
                  Our approach
                </a>
                <Link href="/guide" className="flex min-h-8 items-center hover:text-ice">
                  Product guide
                </Link>
                <Link href="/docs" className="flex min-h-8 items-center hover:text-ice">
                  Documentation
                </Link>
              </div>
              <div className="flex flex-col gap-3 text-sm">
                <span className="mb-2 text-xs text-ash">Get started</span>
                <Link href="/dashboard" className="flex min-h-8 items-center hover:text-ice">
                  Open workspace
                </Link>
                <a href="#questions" className="flex min-h-8 items-center hover:text-ice">
                  FAQs
                </a>
                <a href="#main" className="flex min-h-8 items-center gap-2 hover:text-ice">
                  Back to top <ChevronDown size={13} className="rotate-180" />
                </a>
              </div>
            </nav>
          </div>
          <div
            aria-hidden="true"
            className="mt-14 overflow-hidden text-center text-[clamp(7rem,25vw,21rem)] font-medium leading-[.95] tracking-[-0.08em] text-paper/[0.07]"
          >
            parius.
          </div>
          <div className="mt-10 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-[11px] text-ash sm:flex-row">
            <span>© 2026 Parius</span>
            <p>In development for Tatum × Walrus Total Recall</p>
            <span className="pr-28">Built for people, first.</span>
          </div>
        </div>
      </footer>
    </HomeExperience>
  );
}
