'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@/features/payments/server/history-actions';
import type {
  Invoice,
  InvoiceBalance,
  PaymentRecord,
  PaymentRequest,
  PaymentClaim,
} from '@/features/payments/domain';
export function useInvoiceHistory({
  projectId,
  invoices,
  balances,
  hasMore,
  preview,
  ready,
  pending,
}: {
  projectId: string;
  invoices: Invoice[];
  balances: InvoiceBalance[];
  hasMore: boolean;
  preview: boolean;
  ready: boolean;
  pending: boolean;
}) {
  const router = useRouter();
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

  async function loadEarlierInvoices() {
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
  }
  async function loadEarlierRequests(invoiceId: string) {
    const history = histories[invoiceId];
    if (!history) return;
    setHistoryPending(invoiceId);
    setHistoryError('');
    try {
      const last = history.requests.at(-1);
      if (!last) return;
      const page = await readInvoiceRequests(invoiceId, cursorOf(last));
      if (page.error) throw new Error(page.error);
      setHistories((previous) => ({
        ...previous,
        [invoiceId]: {
          ...previous[invoiceId],
          requests: mergeHistory(previous[invoiceId].requests, page.requests || []),
          claims: mergeHistory(previous[invoiceId].claims, page.claims || []),
          claimsMore: { ...previous[invoiceId].claimsMore, ...page.claimsMore },
          requestsMore: Boolean(page.hasMore),
        },
      }));
    } catch {
      setHistoryError('Earlier instructions could not be loaded. Please retry.');
    } finally {
      setHistoryPending(null);
    }
  }
  async function loadEarlierClaims(invoiceId: string, requestId: string) {
    const invoiceClaims = histories[invoiceId]?.claims || [];
    setHistoryPending(invoiceId);
    setHistoryError('');
    try {
      const last = invoiceClaims.filter((c) => c.request_id === requestId).at(-1);
      if (!last) return;
      const page = await readRequestClaims(requestId, cursorOf(last));
      if (page.error) throw new Error(page.error);
      setHistories((previous) => ({
        ...previous,
        [invoiceId]: {
          ...previous[invoiceId],
          claims: mergeHistory(previous[invoiceId].claims, page.claims || []),
          claimsMore: {
            ...previous[invoiceId].claimsMore,
            [requestId]: Boolean(page.hasMore),
          },
        },
      }));
    } catch {
      setHistoryError('Earlier verification checks could not be loaded. Please retry.');
    } finally {
      setHistoryPending(null);
    }
  }
  async function loadEarlierRecords(invoiceId: string) {
    const history = histories[invoiceId];
    if (!history) return;
    setHistoryPending(invoiceId);
    setHistoryError('');
    try {
      const last = history.records.at(-1);
      if (!last) return;
      const page = await readInvoiceRecords(invoiceId, cursorOf(last));
      if (page.error) throw new Error(page.error);
      setHistories((previous) => ({
        ...previous,
        [invoiceId]: {
          ...previous[invoiceId],
          records: mergeHistory(previous[invoiceId].records, page.records || []),
          recordsMore: Boolean(page.hasMore),
        },
      }));
    } catch {
      setHistoryError('Earlier receipts could not be loaded. Please retry.');
    } finally {
      setHistoryPending(null);
    }
  }
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

  return {
    allInvoices,
    allBalances,
    histories,
    historyPending,
    historyError,
    refreshPending,
    invoicePagePending,
    hasEarlierInvoices: moreInvoices || (hasMore && allInvoices.length <= invoices.length),
    loadHistory,
    refreshAll,
    loadEarlierRecords,
    loadEarlierClaims,
    loadEarlierRequests,
    loadEarlierInvoices,
  };
}
