'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function HomeExperience({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        gsap.from('[data-hero-copy]', {
          y: 24,
          opacity: 0,
          duration: 0.75,
          stagger: 0.09,
          ease: 'power3.out',
        });
        gsap.utils.toArray<HTMLElement>('[data-reveal]', root.current).forEach((element) => {
          gsap.from(element, {
            y: 36,
            opacity: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: element, start: 'top 92%', once: true },
          });
        });
        gsap.utils.toArray<HTMLElement>('[data-drift]', root.current).forEach((element) => {
          gsap.fromTo(
            element,
            { y: 30, rotate: -3 },
            {
              y: -30,
              rotate: 3,
              ease: 'none',
              scrollTrigger: {
                trigger: element.parentElement,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1,
              },
            },
          );
        });
      },
      root,
    );
    return () => media.revert();
  }, []);
  return (
    <div ref={root} className="overflow-clip bg-night text-paper [--focus-color:var(--color-ice)]">
      {children}
    </div>
  );
}

export function MarketingNav({ active }: { active?: 'docs' } = {}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    if (open) document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const links = [
    ['How it works', '/#approach'],
    ['Why Parius', '/#workspace'],
    ['Docs', '/docs'],
  ];
  return (
    <header className="relative z-30 mx-auto flex h-24 max-w-[1440px] items-center justify-between px-6 md:px-12 lg:px-20">
      <Link
        href="/"
        aria-label="Parius home"
        className="text-[30px] font-medium tracking-[-0.08em]"
      >
        parius<span className="text-ice">.</span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="hidden items-center gap-9 text-[13px] text-ash md:flex"
      >
        {links.map(([name, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={active === 'docs' && href === '/docs' ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center transition-colors hover:text-paper ${active === 'docs' && href === '/docs' ? 'text-ice' : ''}`}
          >
            {name}
          </Link>
        ))}
      </nav>
      <Link
        href="/dashboard"
        className="hidden min-h-11 items-center gap-4 rounded-full border border-white/25 px-5 text-[13px] transition-colors hover:border-ice hover:text-ice md:flex"
      >
        Open workspace <ArrowUpRight size={14} />
      </Link>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        ref={menuButton}
        aria-controls="mobile-nav"
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center rounded-full border border-white/20 md:hidden"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className="absolute inset-x-4 top-20 rounded-2xl border border-white/15 bg-slate p-5 shadow-2xl md:hidden"
        >
          {links.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center border-b border-white/10 text-base"
            >
              {name}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className="mt-5 flex min-h-12 items-center justify-between rounded-full bg-ice px-5 text-night"
          >
            Open workspace <ArrowUpRight size={16} />
          </Link>
        </nav>
      )}
    </header>
  );
}

const scopeOptions = {
  original: {
    title: 'The original agreement',
    detail: 'A five-page website, with a contact form and two rounds of revisions.',
    amount: '1,800 USDC',
    note: 'The terms both people approved.',
  },
  request: {
    title: 'A new request in the conversation',
    detail: '“Could we add a booking flow so customers can choose a time and pay online?”',
    amount: 'Needs review',
    note: 'A new feature, outside the agreed deliverables.',
  },
  proposal: {
    title: 'A clear proposal to discuss',
    detail:
      'Add a booking flow as a separate milestone. Confirm the price and delivery date together.',
    amount: 'Not yet agreed',
    note: 'Nothing changes until both people approve.',
  },
};
export function ScopeReview() {
  const [selected, setSelected] = useState<keyof typeof scopeOptions>('request');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from(panel.current, { opacity: 0, y: 8, duration: 0.22, ease: 'power2.out' });
    });
    return () => ctx.revert();
  }, [selected]);
  const keys = Object.keys(scopeOptions) as (keyof typeof scopeOptions)[];
  return (
    <div className="w-full rounded-2xl bg-white p-5 shadow-[0_30px_90px_-45px_rgb(0_0_0/0.3)] sm:p-8">
      <div
        role="tablist"
        aria-label="Explore a scope change"
        className="mb-10 flex gap-1 rounded-full bg-fog p-1 text-xs sm:text-sm"
      >
        {keys.map((key, index) => (
          <button
            key={key}
            id={`scope-tab-${key}`}
            role="tab"
            aria-selected={selected === key}
            aria-controls={`scope-panel-${key}`}
            tabIndex={selected === key ? 0 : -1}
            onClick={() => setSelected(key)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % keys.length;
              else if (event.key === 'ArrowLeft') next = (index + keys.length - 1) % keys.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = keys.length - 1;
              else return;
              event.preventDefault();
              setSelected(keys[next]);
              document.getElementById(`scope-tab-${keys[next]}`)?.focus();
            }}
            className={`min-h-11 flex-1 rounded-full px-2 transition-colors ${selected === key ? 'bg-night text-paper' : 'text-stone hover:text-night'}`}
          >
            {['Agreement', 'New request', 'Proposal'][index]}
          </button>
        ))}
      </div>
      <div
        ref={panel}
        key={selected}
        role="tabpanel"
        tabIndex={0}
        id={`scope-panel-${selected}`}
        aria-labelledby={`scope-tab-${selected}`}
        className="min-h-64"
      >
        <span className="text-xs text-stone">Illustrative scope review</span>
        <h3 className="mt-5 text-2xl font-normal tracking-tight">{scopeOptions[selected].title}</h3>
        <p className="mt-4 max-w-sm text-base text-stone">{scopeOptions[selected].detail}</p>
        <div className="mt-7 border-t border-night/10 pt-5 text-xl tabular-nums">
          {scopeOptions[selected].amount}
        </div>
        <p className="mt-2 text-xs text-stone">{scopeOptions[selected].note}</p>
      </div>
    </div>
  );
}
