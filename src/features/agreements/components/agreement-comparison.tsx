import type { Agreement } from '@/lib/domain';
import { compareAgreements } from '@/features/agreements/domain';
export function AgreementComparison({ base, next }: { base?: Agreement; next: Agreement }) {
  if (!base) return null;
  const changes = compareAgreements(base, next);
  return (
    <details className="my-6 rounded-xl border border-white/10 open:bg-night/30">
      <summary className="cursor-pointer px-4 py-4 text-xs text-ice">
        Changes from version {base.version}{' '}
        <span className="text-ash">
          · {changes.length} {changes.length === 1 ? 'field' : 'fields'} changed
        </span>
      </summary>
      <div className="space-y-6 px-4 pb-5">
        {!changes.length && (
          <p className="text-sm text-ash">The scope, price and revision limit are unchanged.</p>
        )}
        {changes.map((change) => (
          <section key={change.field}>
            <h4 className="mb-3 text-xs font-medium text-paper">{change.field}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['before', 'after'] as const).map((side) => (
                <div key={side} className="min-w-0 rounded-lg bg-white/3 p-4">
                  <span className="mb-2 block text-[11px] text-ash">
                    {side === 'before'
                      ? `Version ${base.version}`
                      : `Proposed version ${next.version}`}
                  </span>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper/85">
                    {change[side]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
