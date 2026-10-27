import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAgentMcp } from '../src/features/agents/mcp';
import { summarizeAgentInvoices } from '../src/features/agents/invoice-summary';

const project = crypto.randomUUID();
const invoice = {
  network: 'mainnet',
  coin_type: 'canonical-mainnet-test-fixture',
  id: crypto.randomUUID(),
  status: 'issued',
  amount_atomic: '10000',
  decimals: 6,
};
const balance = {
  invoice_id: invoice.id,
  project_id: project,
  paid: '10000',
  manual: '0',
  verified: '10000',
  outstanding: '0',
  surplus: '0',
};
test('MCP distinguishes an issued invoice from its reconciled paid balance', () => {
  const [summary] = summarizeAgentInvoices([invoice], [balance], project);
  assert.equal(summary.status, 'issued');
  assert.equal(summary.network, 'mainnet');
  assert.equal(summary.payment_status, 'paid');
  assert.equal(summary.verified_received_atomic, '10000');
  assert.equal(summary.manual_received_atomic, '0');
  assert.equal(summary.remaining_atomic, '0');
});
test('MCP reports partial, unpaid, surplus, draft and void totals without number rounding', () => {
  for (const [paid, remaining, expected] of [
    ['0', '10000', 'unpaid'],
    ['2000', '8000', 'partially_paid'],
    ['9007199254740993', '0', 'paid'],
  ]) {
    const [summary] = summarizeAgentInvoices(
      [invoice],
      [{ ...balance, paid, outstanding: remaining }],
      project,
    );
    assert.equal(summary.payment_status, expected);
    assert.equal(summary.received_atomic, paid);
  }
  for (const status of ['draft', 'void']) {
    assert.equal(
      summarizeAgentInvoices([{ ...invoice, status }], [balance], project)[0].payment_status,
      status,
    );
  }
  assert.equal(
    summarizeAgentInvoices([invoice], [{ ...balance, surplus: '2000' }], project)[0].surplus_atomic,
    '2000',
  );
});
test('MCP fails closed on missing, malformed, duplicate or wrong-project ledger rows', () => {
  for (const rows of [
    [],
    [{ ...balance, project_id: crypto.randomUUID() }],
    [{ ...balance, paid: '-1' }],
    [balance, balance],
  ]) {
    assert.throws(() => summarizeAgentInvoices([invoice], rows, project));
  }
  const other = { ...balance, invoice_id: crypto.randomUUID() };
  assert.equal(summarizeAgentInvoices([invoice], [balance, other], project).length, 1);
});

test('official MCP client receives paid invoice totals without the delegated payment payload', async () => {
  const invoices = summarizeAgentInvoices([invoice], [balance], project);
  const server = createAgentMcp(
    async () => ({
      connection: {
        id: crypto.randomUUID(),
        project_id: project,
        request_id: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      invoices,
    }),
    'localhost',
    'test-only',
  );
  const client = new Client({ name: 'invoice-acceptance', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const response = await client.callTool({ name: 'project_context', arguments: {} });
    assert.equal(response.isError, undefined);
    const content = response.content as { type: string; text: string }[];
    const result = JSON.parse(content[0].text);
    assert.equal(result.invoices[0].status, 'issued');
    assert.equal(result.invoices[0].payment_status, 'paid');
    assert.equal(result.invoices[0].remaining_atomic, '0');
    assert.equal(result.payment, undefined);
  } finally {
    await client.close();
    await server.close();
  }
});
