'use client';
import { Select } from '@/components/select';
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Plus, ReceiptText, RotateCcw } from 'lucide-react';
import {
  draftInvoice,
  issueInvoice,
  voidInvoice,
  recordManualPayment,
  reverseManualPayment,
  preparePaymentRequest,
  verifyPayment,
  reconcileReceipt,
} from '@/app/payment-actions';
import { cursorOf, mergeHistory, collectNewHistory } from '@/lib/history';
import {
  readInvoicePage,
  readInvoiceHistory,
  readInvoiceRecords,
  readInvoiceRequests,
  readRequestClaims,
  refreshInvoices,
  refreshHistoryRows,
  type InvoiceHistory,
} from '@/app/history-actions';
import { displayAmount, type Agreement, type Milestone } from '@/lib/domain';
import {
  invoiceTotals,
  type Invoice,
  type PaymentRecord,
  type PaymentRequest,
  type PaymentClaim,
  type InvoiceBalance,
} from '@/lib/payments';
import type { ActionResult } from '@/app/actions';
import type { WalletBinding } from '@/lib/wallets';
import { control } from './control-styles';
import { Feedback } from './workspace-forms';
import { Dialog } from './dialog';
import { InvoiceFollowups } from './invoice-followups';
import { AgentAccess } from './agent-access';
const field =
  '[&_label]:mb-3 [&_label]:block [&_label]:text-xs [&_input]:mb-5 [&_[data-select]]:mb-5';
const PaymentCheckout = dynamic(() => import('./payment-checkout'), { ssr: false });
const WalletPanel = dynamic(() => import('./wallet-panel'), {
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
  const [invoiceState, setInvoiceState] = useState({
    incoming: invoices,
    balancesIncoming: balances,
    items: invoices,
    balances,
  });
  if (invoiceState.incoming !== invoices || invoiceState.balancesIncoming !== balances) {
    setInvoiceState({
      incoming: invoices,
      balancesIncoming: balances,
      items: invoiceState.items.length
        ? invoiceState.items.map((i) => invoices.find((latest) => latest.id === i.id) || i)
        : invoices,
      balances: [
        ...new Map([...invoiceState.balances, ...balances].map((b) => [b.invoice_id, b])).values(),
      ],
    });
  }
  const allInvoices = invoiceState.items;
  const allBalances = invoiceState.balances;
  const [moreInvoices, setMoreInvoices] = useState(hasMore),
    [invoicePagePending, setInvoicePagePending] = useState(false);
  const [histories, setHistories] = useState<Record<string, InvoiceHistory>>({}),
    [historyPending, setHistoryPending] = useState<string | null>(null),
    [historyError, setHistoryError] = useState('');
  const [refreshPending, setRefreshPending] = useState(false);
  async function loadHistory(invoiceId: string, refresh = false) {
    setHistoryPending(invoiceId);
    setHistoryError('');
    try {
      const result = await readInvoiceHistory(invoiceId);
      if (result.error || !result.history) throw new Error(result.error);
      const current = histories[invoiceId];
      let history = result.history;
      if (refresh && current) {
        const refreshed = {
          records: [] as PaymentRecord[],
          requests: [] as PaymentRequest[],
          claims: [] as PaymentClaim[],
        };
        for (const [name, table] of [
          ['records', 'payment_records'],
          ['requests', 'payment_requests'],
          ['claims', 'payment_claims'],
        ] as const) {
          for (let start = 0; start < current[name].length; start += 100) {
            const page = await refreshHistoryRows(
              projectId,
              table,
              current[name].slice(start, start + 100).map((r) => r.id),
            );
            if (page.error) throw new Error(page.error);
            (refreshed[name] as (PaymentRecord | PaymentRequest | PaymentClaim)[]).push(
              ...(page.rows || []),
            );
          }
        }
        const newRecords = await collectNewHistory(current.records, async (cursor) => {
          const p = await readInvoiceRecords(invoiceId, cursor, 'newer');
          return { ...p, rows: p.records || [] };
        });
        const requestClaims: PaymentClaim[] = [];
        const newClaimFlags: Record<string, boolean> = {};
        const newRequests = await collectNewHistory(current.requests, async (cursor) => {
          const p = await readInvoiceRequests(invoiceId, cursor, 'newer');
          requestClaims.push(...(p.claims || []));
          Object.assign(newClaimFlags, p.claimsMore);
          return { ...p, rows: p.requests || [] };
        });
        let freshClaims = mergeHistory(requestClaims, history.claims);
        for (const request of current.requests) {
          const previousClaims = current.claims.filter((c) => c.request_id === request.id);
          const extra = await collectNewHistory(previousClaims, async (cursor) => {
            const p = await readRequestClaims(request.id, cursor, 'newer');
            return { ...p, rows: p.claims || [] };
          });
          freshClaims = mergeHistory(freshClaims, extra);
        }
        history = {
          ...current,
          records: mergeHistory(refreshed.records, newRecords),
          requests: mergeHistory(refreshed.requests, newRequests),
          claims: mergeHistory(refreshed.claims, freshClaims),
          claimsMore: { ...history.claimsMore, ...newClaimFlags, ...current.claimsMore },
        };
      }
      setHistories((previous) => ({ ...previous, [invoiceId]: history }));
      const refreshed = await refreshInvoices(projectId, [invoiceId]);
      if (refreshed.error) throw new Error(refreshed.error);
      setInvoiceState((previous) => ({
        ...previous,
        items: mergeHistory(
          previous.items.filter((i) => i.id !== invoiceId),
          refreshed.invoices || [],
        ),
        balances: [
          ...previous.balances.filter((b) => b.invoice_id !== invoiceId),
          ...(refreshed.balances || []),
        ],
      }));
    } catch {
      setHistoryError(
        'Payment history could not be fully loaded. Retry with Refresh history. Loaded records have been kept.',
      );
    } finally {
      setHistoryPending(null);
    }
  }
  async function refreshAll() {
    setRefreshPending(true);
    setHistoryError('');
    try {
      const updatedInvoices: Invoice[] = [],
        updatedBalances: InvoiceBalance[] = [];
      for (let start = 0; start < allInvoices.length; start += 50) {
        const page = await refreshInvoices(
          projectId,
          allInvoices.slice(start, start + 50).map((i) => i.id),
        );
        if (page.error) throw new Error(page.error);
        updatedInvoices.push(...(page.invoices || []));
        updatedBalances.push(...(page.balances || []));
      }
      const newBalances: InvoiceBalance[] = [];
      const newInvoices = await collectNewHistory(allInvoices, async (cursor) => {
        const p = await readInvoicePage(projectId, cursor, 'newer');
        newBalances.push(...p.balances);
        return { ...p, rows: p.invoices };
      });
      setInvoiceState((previous) => ({
        ...previous,
        items: mergeHistory(updatedInvoices, newInvoices),
        balances: [
          ...new Map([...updatedBalances, ...newBalances].map((b) => [b.invoice_id, b])).values(),
        ],
      }));
      router.refresh();
    } catch {
      setHistoryError('Invoice balances could not be refreshed. Please retry.');
    } finally {
      setRefreshPending(false);
    }
  }
  const [draft, setDraft] = useState(false),
    [dialog, setDialog] = useState<{
      kind: 'issue' | 'manual' | 'request' | 'void' | 'reconcile' | 'reverse';
      invoice: Invoice;
      id?: string;
    } | null>(null);
  const [walletBindings, setWalletBindings] = useState<WalletBinding[]>([]);
  const [feedback, setFeedback] = useState<ActionResult>({}),
    [pending, startTransition] = useTransition();
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
  const automaticHistory = useRef<string | null>(null);
  const nextHistory = allInvoices.find(
    (invoice) => invoice.status !== 'draft' && !histories[invoice.id],
  )?.id;
  const loadAutomaticHistory = useEffectEvent(async (invoiceId: string) => {
    if (automaticHistory.current) return;
    automaticHistory.current = invoiceId;
    try {
      await loadHistory(invoiceId);
    } finally {
      automaticHistory.current = null;
    }
  });
  useEffect(() => {
    if (
      preview ||
      !ready ||
      pending ||
      historyPending ||
      refreshPending ||
      historyError ||
      !nextHistory
    )
      return;
    void loadAutomaticHistory(nextHistory);
  }, [preview, ready, pending, historyPending, refreshPending, historyError, nextHistory]);
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
      <AgentAccess
        projectId={projectId}
        requests={requests}
        client={!isFreelancer}
        preview={preview}
      />
      {(!ready || preview) && (
        <p className="mb-6 rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-ash">
          {preview
            ? 'Fictional preview. No invoice or payment actions are saved.'
            : 'Payments are being connected. Your agreements and conversation remain available.'}
        </p>
      )}
      {draft && active && (
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
              if (!result.error) setDraft(false);
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
                    onClick={async () => {
                      setHistoryPending(invoice.id);
                      setHistoryError('');
                      try {
                        const last = history.records.at(-1);
                        if (!last) return;
                        const page = await readInvoiceRecords(invoice.id, cursorOf(last));
                        if (page.error) throw new Error(page.error);
                        setHistories((previous) => ({
                          ...previous,
                          [invoice.id]: {
                            ...previous[invoice.id],
                            records: mergeHistory(previous[invoice.id].records, page.records || []),
                            recordsMore: Boolean(page.hasMore),
                          },
                        }));
                      } catch {
                        setHistoryError('Earlier receipts could not be loaded. Please retry.');
                      } finally {
                        setHistoryPending(null);
                      }
                    }}
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
                        onClick={async () => {
                          setHistoryPending(invoice.id);
                          setHistoryError('');
                          try {
                            const last = invoiceClaims
                              .filter((c) => c.request_id === request.id)
                              .at(-1);
                            if (!last) return;
                            const page = await readRequestClaims(request.id, cursorOf(last));
                            if (page.error) throw new Error(page.error);
                            setHistories((previous) => ({
                              ...previous,
                              [invoice.id]: {
                                ...previous[invoice.id],
                                claims: mergeHistory(
                                  previous[invoice.id].claims,
                                  page.claims || [],
                                ),
                                claimsMore: {
                                  ...previous[invoice.id].claimsMore,
                                  [request.id]: Boolean(page.hasMore),
                                },
                              },
                            }));
                          } catch {
                            setHistoryError(
                              'Earlier verification checks could not be loaded. Please retry.',
                            );
                          } finally {
                            setHistoryPending(null);
                          }
                        }}
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
                    onClick={async () => {
                      setHistoryPending(invoice.id);
                      setHistoryError('');
                      try {
                        const last = history.requests.at(-1);
                        if (!last) return;
                        const page = await readInvoiceRequests(invoice.id, cursorOf(last));
                        if (page.error) throw new Error(page.error);
                        setHistories((previous) => ({
                          ...previous,
                          [invoice.id]: {
                            ...previous[invoice.id],
                            requests: mergeHistory(
                              previous[invoice.id].requests,
                              page.requests || [],
                            ),
                            claims: mergeHistory(previous[invoice.id].claims, page.claims || []),
                            claimsMore: { ...previous[invoice.id].claimsMore, ...page.claimsMore },
                            requestsMore: Boolean(page.hasMore),
                          },
                        }));
                      } catch {
                        setHistoryError('Earlier instructions could not be loaded. Please retry.');
                      } finally {
                        setHistoryPending(null);
                      }
                    }}
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
      {(moreInvoices || (hasMore && invoiceState.items.length <= invoices.length)) && !preview && (
        <button
          className={`${control.smallSecondary} mt-6`}
          disabled={invoicePagePending || pending || refreshPending}
          onClick={async () => {
            setInvoicePagePending(true);
            setHistoryError('');
            try {
              const last = allInvoices.at(-1);
              if (!last) return;
              const page = await readInvoicePage(projectId, cursorOf(last));
              if (page.error) throw new Error(page.error);
              setInvoiceState((previous) => ({
                ...previous,
                items: mergeHistory(previous.items, page.invoices),
                balances: [
                  ...new Map(
                    [...previous.balances, ...page.balances].map((b) => [b.invoice_id, b]),
                  ).values(),
                ],
              }));
              setMoreInvoices(page.hasMore);
            } catch {
              setHistoryError('Earlier invoices could not be loaded. Please retry.');
            } finally {
              setInvoicePagePending(false);
            }
          }}
        >
          {invoicePagePending ? 'Loading earlier invoices…' : 'Load earlier invoices'}
        </button>
      )}
      {dialog && (
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
          onClose={() => setDialog(null)}
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
                        key.current!,
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
                <input
                  id="recipient"
                  name="recipient"
                  placeholder="0x…"
                  list="verified-recipients"
                />
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
                        r.invoice_id === dialog.invoice.id &&
                        r.source === 'manual' &&
                        !r.reversed_at,
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
              <button type="button" className={control.secondary} onClick={() => setDialog(null)}>
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
      )}
    </>
  );
}
