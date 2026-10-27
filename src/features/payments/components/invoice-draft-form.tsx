'use client';
import { ArrowUpRight } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { control } from '@/components/ui/control-styles';
import { draftInvoice } from '@/features/payments/server/payment-actions';
import type { ActionResult } from '@/lib/action-result';
import type { Agreement, Milestone } from '@/lib/domain';
const field =
  '[&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_input]:mb-5 [&_[data-select]]:mb-5';
export function InvoiceDraftForm({
  projectId,
  active,
  milestones,
  pending,
  preview,
  ready,
  run,
  onSaved,
}: {
  projectId: string;
  active: Agreement;
  milestones: Milestone[];
  pending: boolean;
  preview: boolean;
  ready: boolean;
  run: (work: () => Promise<ActionResult>) => void;
  onSaved: () => void;
}) {
  return (
    <form
      className={`mb-8 rounded-2xl bg-slate p-6 ${field}`}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        run(async () => {
          const result = await draftInvoice(
            projectId,
            active.id,
            String(form.get('title')),
            String(form.get('amount')),
            String(form.get('due') || ''),
            String(form.get('milestone') || '') || null,
          );
          if (!result.error) onSaved();
          return result;
        });
      }}
    >
      <h3 className="mb-5 text-xl tracking-tight">Draft invoice</h3>
      <label htmlFor="invoice-title">Invoice title</label>
      <input
        id="invoice-title"
        name="title"
        minLength={3}
        maxLength={150}
        placeholder="Website design · first milestone"
        required
      />
      <div className="grid gap-x-5 sm:grid-cols-2">
        <div>
          <label htmlFor="invoice-amount">Amount ({active.currency})</label>
          <input
            id="invoice-amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor="invoice-due">Due date (optional)</label>
          <input id="invoice-due" name="due" type="date" />
        </div>
      </div>
      <label htmlFor="invoice-milestone">Related milestone (optional)</label>
      <Select id="invoice-milestone" name="milestone">
        <option value="">Project invoice</option>
        {milestones.map((m) => (
          <option value={m.id} key={m.id}>
            {m.title}
          </option>
        ))}
      </Select>
      <p className="mb-5 text-xs leading-relaxed text-ash">
        Based on agreement v{active.version}. Invoice totals cannot exceed the approved project
        price. Creating this draft does not issue it or authorize payment.
      </p>
      <button disabled={pending || preview || !ready} className={control.primary}>
        Save private draft
        <ArrowUpRight size={14} />
      </button>
    </form>
  );
}
