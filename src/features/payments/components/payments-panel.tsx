'use client';
import { useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Plus, ReceiptText, RotateCcw } from 'lucide-react';
import { verifyPayment } from '@/features/payments/server/payment-actions';
import { useInvoiceHistory } from '@/features/payments/hooks/use-invoice-history';
import {
  InvoiceActionDialog,
  type InvoiceDialogState,
} from '@/features/payments/components/invoice-action-dialog';
import { InvoiceDraftForm } from '@/features/payments/components/invoice-draft-form';
import { displayAmount, type Agreement, type Milestone } from '@/lib/domain';
import {
  invoiceTotals,
  type Invoice,
  type PaymentRecord,
  type PaymentRequest,
  type PaymentClaim,
  type InvoiceBalance,
} from '@/features/payments/domain';
import type { ActionResult } from '@/lib/action-result';
import type { WalletBinding } from '@/features/payments/wallets';
import { control } from '@/components/ui/control-styles';
import { Feedback } from '@/components/ui/feedback';
import { InvoiceFollowups } from '@/features/payments/components/invoice-followups';
import { AgentAccess } from '@/features/agents/components/agent-access';
const PaymentCheckout = dynamic(() => import('@/features/payments/components/payment-checkout'), {
  ssr: false,
});
const WalletPanel = dynamic(() => import('@/features/payments/components/wallet-panel'), {
  ssr: false,
  loading: () => (
    <p className="mb-6 text-xs text-ash" role="status">
      Loading wallet connection…
    </p>
  ),
});
export function PaymentsPanel({
  projectId,
  active,
  invoices,
  records,
  requests,
  claims,
  balances = [],
  milestones,
  isFreelancer,
  preview,
  ready,
  hasMore = false,
  onFollowupSent,
}: {
  projectId: string;
  active?: Agreement;
  invoices: Invoice[];
  records: PaymentRecord[];
  requests: PaymentRequest[];
  claims: PaymentClaim[];
  balances?: InvoiceBalance[];
  milestones: Milestone[];
  isFreelancer: boolean;
  preview: boolean;
  ready: boolean;
  hasMore?: boolean;
  onFollowupSent?: () => void;
}) {
  const [feedback, setFeedback] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const {
    allInvoices,
    allBalances,
    histories,
    historyPending,
    historyError,
    refreshPending,
    invoicePagePending,
    hasEarlierInvoices,
    loadHistory,
    refreshAll,
    loadEarlierRecords,
    loadEarlierClaims,
    loadEarlierRequests,
    loadEarlierInvoices,
  } = useInvoiceHistory({ projectId, invoices, balances, hasMore, preview, ready, pending });
  const [draft, setDraft] = useState(false),
    [dialog, setDialog] = useState<InvoiceDialogState | null>(null);
  const [walletBindings, setWalletBindings] = useState<WalletBinding[]>([]);
  const key = useRef<string | null>(null);
  const router = useRouter();
  const run = (work: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setFeedback({});
      try {
        const result = await work();
        setFeedback(result);
        if (!result.error) {
          setDialog(null);
          key.current = null;
          router.refresh();
          if (dialog?.invoice.id) await loadHistory(dialog.invoice.id, true);
          else await refreshAll();
        }
      } catch {
        setFeedback({
          error: 'The update could not be confirmed. Retry before creating another payment record.',
        });
      }
    });
  const open = (kind: NonNullable<typeof dialog>['kind'], invoice: Invoice, id?: string) => {
    key.current = crypto.randomUUID();
    setFeedback({});
    setDialog({ kind, invoice, id });
  };
  if (!ready && !preview)
    return (
      <div>
        <h2 className="text-2xl tracking-tight">Invoices & payments</h2>
        <p
          role="status"
          className="mt-6 rounded-xl border border-white/10 p-5 text-sm leading-relaxed text-ash"
        >
          Payments are being connected. Your agreements and conversation remain available.
        </p>
      </div>
    );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="text-2xl font-normal tracking-[-.04em]">Invoices & payments</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ash">
            Track invoices, receipts and outstanding balances.
          </p>
        </div>
        {isFreelancer && (
          <button
            className={control.smallSecondary}
            disabled={!active || (!ready && !preview)}
            onClick={() => setDraft(!draft)}
          >
            <Plus size={14} />
            Draft invoice
          </button>
        )}
      </div>
      {!preview && <WalletPanel onBindings={setWalletBindings} />}
      {(!ready || preview) && (
        <p className="mb-6 rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-ash">
          {preview
            ? 'Fictional preview. No invoice or payment actions are saved.'
            : 'Payments are being connected. Your agreements and conversation remain available.'}
        </p>
      )}
      {draft && active && (
        <InvoiceDraftForm
          projectId={projectId}
          active={active}
          milestones={milestones}
          pending={pending}
          preview={preview}
          ready={ready}
          run={run}
          onSaved={() => setDraft(false)}
        />
      )}
      {!dialog && <Feedback state={feedback} />}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        {!preview && allInvoices.length > 0 && (
          <button
            className={control.smallSecondary}
            disabled={refreshPending || historyPending !== null || pending}
            onClick={() => void refreshAll()}
          >
            {refreshPending ? 'Refreshing balances…' : 'Refresh balances'}
          </button>
        )}
        {!preview && invoices[0] && !allInvoices.some((i) => i.id === invoices[0].id) && (
          <p className="text-xs text-ash">
            New invoices are available. Refresh balances to load them.
          </p>
        )}
      </div>
      {historyError && (
        <p role="alert" className="mb-5 text-xs text-danger">
          {historyError}
        </p>
      )}
      <div className="space-y-6">
        {allInvoices.length ? (
          allInvoices.map((invoice) => {
            const totals =
              allBalances.find((b) => b.invoice_id === invoice.id) ||
              (preview ? invoiceTotals(invoice, records) : null);
            if (!totals)
              return (
                <article key={invoice.id} className="rounded-xl border border-white/10 p-5">
                  <h3>{invoice.title}</h3>
                  <p role="status" className="mt-3 text-sm text-ash">
                    Balance unavailable. Refresh balances before continuing.
                  </p>
                </article>
              );
            const history = histories[invoice.id];
            const invoiceRecords = preview
              ? records.filter((r) => r.invoice_id === invoice.id)
              : history?.records || [];
            const invoiceRequests = preview
              ? requests.filter((r) => r.invoice_id === invoice.id)
              : history?.requests || [];
            const invoiceClaims = preview ? claims : history?.claims || [];
            return (
              <article className="rounded-2xl bg-slate p-5 md:p-7" key={invoice.id}>
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] tracking-[.07em] text-ash">
                      {invoice.status === 'draft'
                        ? 'PRIVATE DRAFT'
                        : invoice.status === 'void'
                          ? 'VOID'
                          : BigInt(totals.outstanding) === 0n
                            ? 'PAID'
                            : 'ISSUED'}
                    </span>
                    <h3 className="mt-2 text-xl tracking-tight">{invoice.title}</h3>
                  </div>
                  <strong className="text-lg font-normal tabular-nums">
                    {displayAmount(invoice.amount_atomic, invoice.currency, invoice.decimals)}
                  </strong>
                </header>
                <div className="mt-6 grid grid-cols-2 gap-4 border-y border-white/10 py-5 text-xs">
                  <div>
                    <span className="block text-ash">Received</span>
                    <span className="mt-2 block tabular-nums text-paper">
                      {displayAmount(totals.paid, invoice.currency, invoice.decimals)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-ash">Remaining</span>
                    <span className="mt-2 block tabular-nums text-ice">
                      {displayAmount(totals.outstanding, invoice.currency, invoice.decimals)}
                    </span>
                  </div>
                </div>
                {BigInt(totals.surplus) > 0n && (
                  <p className="mt-4 text-xs text-warning">
                    Surplus of {displayAmount(totals.surplus, invoice.currency, invoice.decimals)}{' '}
                    needs review. No refund is automatic.
                  </p>
                )}
                {BigInt(totals.paid) > 0n &&
                  allBalances.find((b) => b.invoice_id === invoice.id) && (
                    <p className="mt-4 text-[11px] leading-relaxed text-ash">
                      Manual:{' '}
                      {displayAmount(
                        allBalances.find((b) => b.invoice_id === invoice.id)!.manual,
                        invoice.currency,
                        invoice.decimals,
                      )}{' '}
                      · Tatum verified:{' '}
                      {displayAmount(
                        allBalances.find((b) => b.invoice_id === invoice.id)!.verified,
                        invoice.currency,
                        invoice.decimals,
                      )}
                    </p>
                  )}
                {invoice.due_date && (
                  <p className="mt-4 text-xs text-ash">Due {invoice.due_date}</p>
                )}
                {invoice.status !== 'void' && (
                  <footer className="mt-5 flex flex-wrap gap-3">
                    {isFreelancer && invoice.status === 'draft' && (
                      <button
                        className={control.smallPrimary}
                        onClick={() => open('issue', invoice)}
                        disabled={pending}
                      >
                        Review & issue
                      </button>
                    )}
                    {isFreelancer && invoice.status === 'issued' && (
                      <button
                        className={control.smallSecondary}
                        onClick={() => open('manual', invoice)}
                        disabled={pending}
                      >
                        Record received payment
                      </button>
                    )}
                    {!isFreelancer &&
                      invoice.status === 'issued' &&
                      invoice.recipient &&
                      BigInt(totals.outstanding) > 0n && (
                        <button
                          className={control.smallPrimary}
                          onClick={() => open('request', invoice)}
                          disabled={pending}
                        >
                          Review & pay
                        </button>
                      )}
                    {isFreelancer && (
                      <button
                        className="min-h-11 px-2 text-xs text-ash hover:text-paper"
                        onClick={() => open('void', invoice)}
                        disabled={pending}
                      >
                        Void invoice
                      </button>
                    )}
                  </footer>
                )}
                {invoice.issued_at && (
                  <InvoiceFollowups
                    invoice={invoice}
                    outstanding={totals.outstanding}
                    isFreelancer={isFreelancer}
                    preview={preview}
                    onSent={onFollowupSent}
                  />
                )}
                {invoice.recipient && (
                  <details className="mt-4 text-xs">
                    <summary className="min-h-8 cursor-pointer text-ice">
                      Payment details · Sui {invoice.network}
                    </summary>
                    <p className="mt-2 leading-relaxed text-ash">
                      {invoice.network === 'testnet' ? 'Test tokens have no monetary value. ' : ''}
                      Check the recipient before signing a transfer.
                    </p>
                    <p className="mt-3 text-ash">Recipient</p>
                    <p className="mt-1 break-all text-paper">{invoice.recipient}</p>
                    <p className="mt-3 text-ash">USDC token</p>
                    <p className="mt-1 break-all text-ash">{invoice.coin_type}</p>
                  </details>
                )}
                {invoice.status !== 'draft' && (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                    <h4 className="text-sm">Payment history</h4>
                    {!preview && (
                      <button
                        className={control.smallSecondary}
                        disabled={historyPending !== null || pending || refreshPending}
                        onClick={() => void loadHistory(invoice.id, Boolean(history))}
                      >
                        {historyPending === invoice.id ? 'Loading history…' : 'Refresh history'}
                      </button>
                    )}
                  </div>
                )}
                {invoice.status !== 'draft' && !preview && !history && (
                  <p role="status" className="mt-3 text-xs text-ash">
                    {historyError
                      ? 'History unavailable. Refresh history to retry.'
                      : 'Loading payment history…'}
                  </p>
                )}
                {invoice.status !== 'draft' &&
                  (history || preview) &&
                  !invoiceRecords.length &&
                  !invoiceRequests.length && (
                    <p className="mt-3 text-xs text-ash">No payment records yet.</p>
                  )}
                {invoiceRecords.length > 0 && (
                  <ul className="mt-5 divide-y divide-white/8">
                    {invoiceRecords.map((record) => (
                      <li className="py-4 text-xs" key={record.id}>
                        <div className="flex flex-wrap justify-between gap-3">
                          <span
                            className={
                              record.reversed_at
                                ? 'text-ash'
                                : record.source === 'sui'
                                  ? 'text-ice'
                                  : 'text-paper'
                            }
                          >
                            {record.source === 'manual'
                              ? 'Manual receipt · not blockchain verified'
                              : 'Tatum-verified · reconciled'}
                            {record.reversed_at ? ' · reversed' : ''}
                          </span>
                          <span className="tabular-nums">
                            {displayAmount(
                              record.amount_atomic,
                              invoice.currency,
                              invoice.decimals,
                            )}
                          </span>
                        </div>
                        {record.note && (
                          <p className="mt-2 whitespace-pre-wrap wrap-anywhere leading-relaxed text-ash">
                            {record.note}
                          </p>
                        )}
                        {record.digest && (
                          <p className="mt-2 break-all text-ash">{record.digest}</p>
                        )}
                        {isFreelancer && record.source === 'manual' && !record.reversed_at && (
                          <button
                            className={`${control.smallSecondary} mt-3`}
                            disabled={pending || preview}
                            onClick={() => open('reverse', invoice, record.id)}
                          >
                            <RotateCcw size={14} aria-hidden="true" />
                            Reverse manual record
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {history?.recordsMore && (
                  <button
                    className={`${control.smallSecondary} mt-4`}
                    disabled={historyPending !== null || pending}
                    onClick={() => void loadEarlierRecords(invoice.id)}
                  >
                    Load earlier receipts
                  </button>
                )}
                {invoiceRequests.map((request) => (
                  <section className="mt-5 rounded-xl border border-white/10 p-4" key={request.id}>
                    <h4 className="text-xs text-paper">
                      Confirmed instructions · {displayAmount(request.amount_atomic, 'USDC', 6)}
                    </h4>
                    <p className="mt-2 text-[11px] leading-relaxed text-ash">
                      Transfer window ends{' '}
                      {new Date(request.expires_at).toLocaleString('en-GB', { timeZone: 'UTC' })}{' '}
                      UTC. Confirming instructions does not sign or send a transfer.
                    </p>
                    <p className="mt-3 break-all text-[11px] text-ash">
                      Expected sender: {request.payer}
                    </p>
                    {!isFreelancer && !preview && <PaymentCheckout requestId={request.id} />}
                    {!isFreelancer &&
                      invoice.status === 'issued' &&
                      BigInt(totals.outstanding) > 0n && (
                        <div className="mt-4">
                          <AgentAccess
                            projectId={projectId}
                            preview={preview}
                            delegation={{ request, invoiceTitle: invoice.title }}
                          />
                        </div>
                      )}
                    <details className="mt-4">
                      <summary className="min-h-8 cursor-pointer text-xs text-ice">
                        Already sent a transfer? (backup)
                      </summary>
                      <p
                        id={`digest-help-${request.id}`}
                        className="mt-2 text-xs leading-relaxed text-ash"
                      >
                        Paste its transaction ID to check it. Skip this if your saved payment is
                        already verified.
                      </p>
                      <form
                        className="mt-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = new FormData(e.currentTarget);
                          run(() =>
                            verifyPayment(projectId, request.id, String(form.get('digest'))),
                          );
                        }}
                      >
                        <label htmlFor={`digest-${request.id}`} className="mb-2 block text-xs">
                          Transaction digest
                        </label>
                        <input
                          id={`digest-${request.id}`}
                          name="digest"
                          aria-describedby={`digest-help-${request.id}`}
                          placeholder="Paste the transaction ID from your wallet"
                          required
                        />
                        <button
                          className={`${control.smallSecondary} mt-3`}
                          disabled={pending || preview || !ready}
                        >
                          Check with Tatum
                        </button>
                      </form>
                    </details>
                    {invoiceClaims
                      .filter((c) => c.request_id === request.id)
                      .map((claim) => (
                        <div className="mt-4 border-t border-white/10 pt-4 text-xs" key={claim.id}>
                          <p
                            className={
                              claim.status === 'verified' || claim.status === 'credited'
                                ? 'text-ice'
                                : 'text-ash'
                            }
                          >
                            {claim.status === 'verified'
                              ? 'Tatum matched · awaiting reconciliation'
                              : claim.status === 'credited'
                                ? 'Receipt reconciled'
                                : claim.status === 'rejected'
                                  ? 'Receipt does not match'
                                  : claim.status === 'checking'
                                    ? 'Checking receipt'
                                    : 'Verification pending · retry this digest'}
                          </p>
                          {claim.reason === 'network_identity_unavailable' && (
                            <p className="mt-2 leading-relaxed text-ash">
                              Tatum network identity evidence is unavailable. No payment has been
                              credited.
                            </p>
                          )}
                          <p className="mt-2 break-all text-ash">{claim.digest}</p>
                          {claim.proof?.networkEvidence ===
                            'tatum_endpoint_and_canonical_asset' && (
                            <p className="mt-2 text-[11px] leading-relaxed text-ash">
                              Network matched through Tatum’s configured endpoint and the canonical
                              USDC asset.
                            </p>
                          )}
                          {isFreelancer && claim.status === 'verified' && (
                            <button
                              className="mt-2 min-h-11 text-ice"
                              disabled={pending || preview}
                              onClick={() => open('reconcile', invoice, claim.id)}
                            >
                              Review & reconcile receipt
                            </button>
                          )}
                        </div>
                      ))}
                    {history?.claimsMore[request.id] && (
                      <button
                        className={`${control.smallSecondary} mt-4`}
                        disabled={historyPending !== null || pending}
                        onClick={() => void loadEarlierClaims(invoice.id, request.id)}
                      >
                        Load earlier verification checks
                      </button>
                    )}
                  </section>
                ))}
                {history?.requestsMore && (
                  <button
                    className={`${control.smallSecondary} mt-4`}
                    disabled={historyPending !== null || pending}
                    onClick={() => void loadEarlierRequests(invoice.id)}
                  >
                    Load earlier payment instructions
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 px-6 py-14 text-center">
            <ReceiptText className="mx-auto mb-5 text-ice" size={27} />
            <h3 className="text-xl tracking-tight">No invoices yet</h3>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ash">
              {isFreelancer
                ? 'Start with an approved agreement, then draft an invoice for the work.'
                : 'Your freelancer’s issued invoices and payment receipts will appear here.'}
            </p>
          </div>
        )}
      </div>
      {hasEarlierInvoices && !preview && (
        <button
          className={`${control.smallSecondary} mt-6`}
          disabled={invoicePagePending || pending || refreshPending}
          onClick={() => void loadEarlierInvoices()}
        >
          {invoicePagePending ? 'Loading earlier invoices…' : 'Load earlier invoices'}
        </button>
      )}
      {dialog && (
        <InvoiceActionDialog
          dialog={dialog}
          projectId={projectId}
          walletBindings={walletBindings}
          records={records}
          feedback={feedback}
          pending={pending}
          preview={preview}
          ready={ready}
          getActionKey={() => key.current}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
