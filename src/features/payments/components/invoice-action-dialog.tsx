'use client';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { control } from '@/components/ui/control-styles';
import { Feedback } from '@/components/ui/feedback';
import { displayAmount } from '@/lib/domain';
import type { ActionResult } from '@/lib/action-result';
import type { Invoice, PaymentRecord } from '@/features/payments/domain';
import type { WalletBinding } from '@/features/payments/wallets';
import {
  issueInvoice,
  voidInvoice,
  recordManualPayment,
  reverseManualPayment,
  preparePaymentRequest,
  reconcileReceipt,
} from '@/features/payments/server/payment-actions';
export type InvoiceDialogState = {
  kind: 'issue' | 'manual' | 'request' | 'void' | 'reconcile' | 'reverse';
  invoice: Invoice;
  id?: string;
};
const field =
  '[&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_input]:mb-5 [&_[data-select]]:mb-5';
export function InvoiceActionDialog({
  dialog,
  projectId,
  walletBindings,
  records,
  feedback,
  pending,
  preview,
  ready,
  getActionKey,
  run,
  onClose,
}: {
  dialog: InvoiceDialogState;
  projectId: string;
  walletBindings: WalletBinding[];
  records: PaymentRecord[];
  feedback: ActionResult;
  pending: boolean;
  preview: boolean;
  ready: boolean;
  getActionKey: () => string | null;
  run: (work: () => Promise<ActionResult>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={
        dialog.kind === 'issue'
          ? 'Issue this invoice?'
          : dialog.kind === 'manual'
            ? 'Record a received payment'
            : dialog.kind === 'request'
              ? 'Confirm payment instructions'
              : dialog.kind === 'void'
                ? 'Void this invoice?'
                : dialog.kind === 'reverse'
                  ? 'Reverse this manual record?'
                  : 'Reconcile this receipt?'
      }
      onClose={() => onClose()}
    >
      <form
        className={field}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(() =>
            dialog.kind === 'issue'
              ? issueInvoice(projectId, dialog.invoice.id, String(form.get('recipient') || ''))
              : dialog.kind === 'manual'
                ? recordManualPayment(
                    projectId,
                    dialog.invoice.id,
                    String(form.get('amount')),
                    String(form.get('note') || ''),
                    String(form.get('date')),
                    getActionKey()!,
                  )
                : dialog.kind === 'request'
                  ? preparePaymentRequest(
                      projectId,
                      dialog.invoice.id,
                      String(form.get('payer')),
                      String(form.get('amount')),
                    )
                  : dialog.kind === 'void'
                    ? voidInvoice(projectId, dialog.invoice.id)
                    : dialog.kind === 'reverse'
                      ? reverseManualPayment(projectId, dialog.id!)
                      : reconcileReceipt(
                          projectId,
                          dialog.id!,
                          String(form.get('replace') || '') || null,
                        ),
          );
        }}
      >
        <p className="mb-6 text-sm leading-relaxed text-ash">
          <strong className="font-medium text-paper">{dialog.invoice.title}</strong> ·{' '}
          {displayAmount(
            dialog.invoice.amount_atomic,
            dialog.invoice.currency,
            dialog.invoice.decimals,
          )}
          {dialog.kind === 'issue'
            ? '. This shares the immutable invoice with your client. It does not authorize a payment.'
            : dialog.kind === 'manual'
              ? '. Record money already received. This is a manual record, without blockchain verification. Use the invoice currency; no exchange-rate conversion is performed.'
              : dialog.kind === 'request'
                ? '. Review the recipient and network below, then choose your verified wallet. This confirms instructions only. No transfer is signed or sent.'
                : dialog.kind === 'reconcile'
                  ? '. Confirm this receipt belongs to this invoice. Replace the matching manual record if you previously recorded the same payment.'
                  : dialog.kind === 'reverse'
                    ? '. The audit trail stays preserved. Reversal does not send a refund.'
                    : '. Existing payment records and requests must be reconciled first. No money is moved.'}
        </p>
        {dialog.kind === 'issue' && dialog.invoice.currency === 'USDC' && (
          <>
            <label htmlFor="recipient">Sui recipient address (optional)</label>
            <input id="recipient" name="recipient" placeholder="0x…" list="verified-recipients" />
            <datalist id="verified-recipients">
              {walletBindings
                .filter((binding) => binding.network === process.env.NEXT_PUBLIC_SUI_NETWORK)
                .map((binding) => (
                  <option key={binding.id} value={binding.address}>
                    Your verified wallet
                  </option>
                ))}
            </datalist>
            <p className="mb-5 text-xs leading-relaxed text-ash">
              Use an address you control. Leave blank for manual tracking only. The configured
              network is {process.env.NEXT_PUBLIC_SUI_NETWORK || 'not set'}.
            </p>
          </>
        )}
        {(dialog.kind === 'manual' || dialog.kind === 'request') && (
          <>
            <label htmlFor="payment-amount">Amount ({dialog.invoice.currency})</label>
            <input
              id="payment-amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </>
        )}
        {dialog.kind === 'manual' && (
          <>
            <label htmlFor="payment-date">Received date (UTC)</label>
            <input id="payment-date" name="date" type="date" required />
            <label htmlFor="payment-note">Method or reference (optional)</label>
            <input
              id="payment-note"
              name="note"
              maxLength={500}
              placeholder="Bank transfer · deposit"
            />
          </>
        )}
        {dialog.kind === 'request' && (
          <>
            <p className="mb-5 break-all rounded-xl bg-night p-4 text-xs leading-relaxed text-ice">
              Sui {dialog.invoice.network} · USDC
              <br />
              {dialog.invoice.recipient}
            </p>
            <label htmlFor="payer">Your verified sender wallet</label>
            <Select id="payer" name="payer" required defaultValue="">
              <option value="" disabled>
                Choose a verified wallet
              </option>
              {walletBindings
                .filter((binding) => binding.network === dialog.invoice.network)
                .map((binding) => (
                  <option key={binding.id} value={binding.address}>
                    {binding.address}
                  </option>
                ))}
            </Select>
            {!walletBindings.some((binding) => binding.network === dialog.invoice.network) && (
              <p className="mb-5 text-xs leading-relaxed text-ash">
                Close this dialog and verify your wallet above before confirming payment
                instructions.
              </p>
            )}
          </>
        )}
        {dialog.kind === 'reconcile' && (
          <>
            <label htmlFor="replace-manual">Already recorded manually?</label>
            <Select id="replace-manual" name="replace">
              <option value="">No matching manual receipt</option>
              {records
                .filter(
                  (r) =>
                    r.invoice_id === dialog.invoice.id && r.source === 'manual' && !r.reversed_at,
                )
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {displayAmount(
                      r.amount_atomic,
                      dialog.invoice.currency,
                      dialog.invoice.decimals,
                    )}{' '}
                    · {r.note || 'Manual receipt'}
                  </option>
                ))}
            </Select>
          </>
        )}
        <Feedback state={feedback} />
        {preview && (
          <p className="mt-4 text-xs text-ice">Preview only. No changes will be saved.</p>
        )}
        <footer>
          <button type="button" className={control.secondary} onClick={() => onClose()}>
            Keep reviewing
          </button>
          <button className={control.primary} disabled={pending || preview || !ready}>
            {pending
              ? 'Saving…'
              : dialog.kind === 'issue'
                ? 'Issue invoice'
                : dialog.kind === 'manual'
                  ? 'Confirm received payment'
                  : dialog.kind === 'request'
                    ? 'Confirm these instructions'
                    : dialog.kind === 'void'
                      ? 'Void invoice'
                      : dialog.kind === 'reverse'
                        ? 'Reverse record'
                        : 'Confirm receipt allocation'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
