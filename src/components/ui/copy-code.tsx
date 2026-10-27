'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { control } from './control-styles';

export function CopyCode({
  value,
  title = 'Configuration',
  label = 'Copy',
}: {
  value: string;
  title?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const success = copied === value;
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-slate">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="text-xs text-ash">{title}</span>
        <button
          type="button"
          className={control.smallSecondary}
          aria-label={`${label}: ${title}`}
          onClick={async () => {
            setFailed(false);
            try {
              await navigator.clipboard.writeText(value);
              setCopied(value);
            } catch {
              setCopied(null);
              setFailed(true);
            }
          }}
        >
          {success ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {success ? 'Copied' : label}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-[13px] leading-6 text-paper">
        <code>{value}</code>
      </pre>
      <span className="sr-only" role="status">
        {success ? 'Copied to clipboard.' : ''}
      </span>
      {failed && (
        <p role="status" className="px-4 pb-4 text-xs text-ash">
          Copy is unavailable here. Select the text above and copy it manually.
        </p>
      )}
    </div>
  );
}
