import { z } from 'zod';

const atomic = z.string().regex(/^[0-9]+$/);
const invoiceSchema = z.object({ id: z.uuid(), status: z.string() }).passthrough();
const balanceSchema = z.object({
  invoice_id: z.uuid(),
  project_id: z.uuid(),
  paid: atomic,
  manual: atomic,
  verified: atomic,
  outstanding: atomic,
  surplus: atomic,
});

/** Join only the authorized invoice list to the dashboard's reconciled ledger totals. */
export function summarizeAgentInvoices(invoices: unknown, balances: unknown, projectId: string) {
  const rows = z.array(balanceSchema).parse(balances);
  return z
    .array(invoiceSchema)
    .parse(invoices)
    .map((invoice) => {
      const matches = rows.filter(
        (row) => row.invoice_id === invoice.id && row.project_id === projectId,
      );
      if (matches.length !== 1) throw new Error('Invoice balance unavailable.');
      const balance = matches[0];
      return {
        ...invoice,
        payment_status:
          invoice.status === 'draft' || invoice.status === 'void'
            ? invoice.status
            : BigInt(balance.outstanding) === 0n
              ? 'paid'
              : BigInt(balance.paid) > 0n
                ? 'partially_paid'
                : 'unpaid',
        received_atomic: balance.paid,
        manual_received_atomic: balance.manual,
        verified_received_atomic: balance.verified,
        remaining_atomic: balance.outstanding,
        surplus_atomic: balance.surplus,
      };
    });
}
