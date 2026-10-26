'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PageMotion } from './page-motion';
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-32px)] max-w-lg overflow-auto rounded-2xl border border-white/15 bg-slate p-0 text-paper backdrop:bg-night/75 backdrop:backdrop-blur-sm"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        ref.current?.close();
      }}
      onClose={onClose}
    >
      <div className="w-full p-6 sm:p-8 [&_header]:mb-6 [&_header]:flex [&_header]:items-center [&_header]:justify-between [&_header]:gap-4 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-tight [&>p]:text-sm [&>p]:text-ash [&_footer]:mt-8 [&_footer]:flex [&_footer]:flex-wrap [&_footer]:justify-end [&_footer]:gap-3">
        <header>
          <h2 id="dialog-title">{title}</h2>
          <button
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-transparent text-ash transition-colors hover:bg-white/5 hover:text-paper"
            aria-label="Close dialog"
            onClick={() => ref.current?.close()}
          >
            <X size={17} />
          </button>
        </header>
        <PageMotion animationKey={title}>{children}</PageMotion>
      </div>
    </dialog>
  );
}
