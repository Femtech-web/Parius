import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { privilegedClient } from '@/lib/server/privileged';
import { summarizeAgentInvoices } from '@/features/agents/invoice-summary';
import { agentContextSchema } from '@/features/agents/payment';
export function agentKeyHash(key: string) {
  if (!/^parius_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Invalid agent key.');
  return createHash('sha256').update(key).digest('hex');
}
export function agentPaymentSecret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Agent payments are not configured.');
  return createHmac('sha256', key).update('parius:mpp:sui:charge:v1').digest('hex');
}
export async function agentContext(hash: string) {
  const service = privilegedClient(12000);
  const { data, error } = await service.rpc('agent_context', { p_hash: hash });
  if (error) throw new Error('Agent key expired, revoked or invalid.');
  // Use only invoice IDs already authorized by agent_context; never fetch another project.
  const invoices = data.invoices as { id: string }[];
  if (invoices.length) {
    const balances = await service
      .from('invoice_balances')
      .select('invoice_id,project_id,paid,manual,verified,outstanding,surplus')
      .eq('project_id', data.connection.project_id)
      .in(
        'invoice_id',
        invoices.map((invoice) => invoice.id),
      );
    if (balances.error) throw new Error('Invoice balance unavailable.');
    data.invoices = summarizeAgentInvoices(invoices, balances.data, data.connection.project_id);
  }
  if (data.payment) {
    const invoice = data.payment.invoice;
    let paid = 0n;
    // Read the complete ledger, never just the first PostgREST page.
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error('Invoice ledger requires manual review.');
      const rows = await service
        .from('payment_records')
        .select('amount_atomic')
        .eq('invoice_id', invoice.id)
        .is('reversed_at', null)
        .order('id')
        .range(page * 100, page * 100 + 99);
      if (rows.error) throw new Error('Invoice balance unavailable.');
      for (const row of rows.data) paid += BigInt(row.amount_atomic);
      if (rows.data.length < 100) break;
    }
    const binding = await service
      .from('wallet_bindings')
      .select('id')
      .eq('owner_id', data.connection.owner_id)
      .eq('address', data.payment.request.payer)
      .eq('network', invoice.network)
      .is('revoked_at', null)
      .maybeSingle();
    if (binding.error) throw new Error('Wallet authorization unavailable.');
    data.payment.payable =
      Boolean(binding.data) &&
      invoice.network === process.env.NEXT_PUBLIC_SUI_NETWORK &&
      BigInt(data.payment.request.amount_atomic) <= BigInt(invoice.amount_atomic) - paid;
  }
  return agentContextSchema.parse(data);
}
