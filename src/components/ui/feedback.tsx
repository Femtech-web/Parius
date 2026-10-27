'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { ActionResult } from '@/lib/action-result';
export function Feedback({ state }: { state: ActionResult }) {
  const [dismissed, setDismissed] = useState<ActionResult | null>(null);
  if (dismissed === state || (!state.error && !state.success)) return null;
  return (
    <div
      className={`my-5 flex items-start gap-3 rounded-xl p-4 text-[13px] leading-relaxed ${state.error ? 'bg-danger-soft text-danger' : 'bg-ice/10 text-ice'}`}
    >
      <p className="min-w-0 flex-1" role={state.error ? 'alert' : 'status'}>
        {state.error || state.success}
      </p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onClick={() => setDismissed(state)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
