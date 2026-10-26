// One real Groq call using fictional invoice data. No database/memory/message writes.
import { suggestFollowupClosing } from '../src/lib/server/followups';
import { composeFollowup, type FollowupContext } from '../src/lib/followups';
process.loadEnvFile('.env.local');
const context: FollowupContext = {
  invoice: {
    id: '20000000-0000-4000-8000-000000000001',
    title: 'Fictional portfolio milestone',
    currency: 'USDC',
    decimals: 6,
    due_date: '2026-10-25',
    status: 'issued',
  },
  paid: '25000000',
  outstanding: '75000000',
  promise: {
    id: '20000000-0000-4000-8000-000000000002',
    amount_atomic: '25000000',
    promised_date: '2026-10-27',
    status: 'reported',
    note: 'Fictional test only',
  },
};
try {
  const closing = await suggestFollowupClosing(context);
  const body = composeFollowup(context, closing);
  const checked =
    body.includes('$75.00 USDC') && body.includes('unconfirmed') && !body.includes('You confirmed');
  console.log(
    JSON.stringify({
      check: 'Real Groq follow-up closing',
      model: 'openai/gpt-oss-20b',
      ok: checked,
      exactInvoiceFacts: checked,
      sharedMessageCreated: false,
    }),
  );
  if (!checked) process.exitCode = 1;
} catch {
  console.log(
    JSON.stringify({
      check: 'Real Groq follow-up closing',
      ok: false,
      sharedMessageCreated: false,
    }),
  );
  process.exitCode = 1;
}
