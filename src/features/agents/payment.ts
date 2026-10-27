import { Challenge, Credential, Receipt } from 'mppx';
import { z } from 'zod';
import { digestInput, usdcTypes, type ReceiptProof } from '@/features/payments/domain';

const paymentSchema = z.object({
  payable: z.boolean(),
  request: z.object({
    id: z.uuid(),
    payer: z.string(),
    amount_atomic: z.string().regex(/^[0-9]{1,18}$/),
    created_at: z.string(),
    expires_at: z.string(),
  }),
  invoice: z.object({
    id: z.uuid(),
    status: z.string(),
    network: z.enum(['testnet', 'mainnet']),
    recipient: z.string(),
    coin_type: z.string(),
  }),
  digest: z.string().nullable(),
  claim: z
    .object({ id: z.uuid(), status: z.string(), digest: z.string(), reason: z.string().nullable() })
    .nullable(),
});
export const agentContextSchema = z
  .object({
    connection: z.object({
      id: z.uuid(),
      project_id: z.uuid(),
      expires_at: z.string(),
      request_id: z.uuid().nullable(),
    }),
    payment: paymentSchema.optional(),
  })
  .passthrough();
export type AgentContext = z.infer<typeof agentContextSchema>;
export function exactUsdc(atomic: string) {
  return `${BigInt(atomic) / 1_000_000n}.${(BigInt(atomic) % 1_000_000n).toString().padStart(6, '0')}`;
}
export function paymentChallenge(ctx: AgentContext, realm: string, secretKey: string) {
  const p = ctx.payment;
  if (
    !p ||
    !p.payable ||
    p.invoice.status !== 'issued' ||
    p.invoice.coin_type !== usdcTypes[p.invoice.network] ||
    Date.parse(ctx.connection.expires_at) <= Date.now() ||
    Date.parse(p.request.expires_at) <= Date.now()
  )
    throw new Error('No active delegated payment instructions.');
  return Challenge.from({
    realm,
    secretKey,
    method: 'sui',
    intent: 'charge',
    request: {
      amount: exactUsdc(p.request.amount_atomic),
      currency: p.invoice.coin_type,
      recipient: p.invoice.recipient,
    },
    expires: ctx.connection.expires_at,
    description:
      'One reviewed Parius invoice payment. Freelancer reconciliation is still required.',
    meta: {
      connection: ctx.connection.id,
      request: p.request.id,
      network: p.invoice.network,
      payer: p.request.payer,
    },
  });
}
/** The suimpp sui/charge proof format. The wallet signs this after obtaining its digest. */
export function paymentProofBytes(challenge: Challenge.Challenge, digest: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      domain: 'suimpp.sui.payment-proof',
      version: 1,
      method: challenge.method,
      intent: challenge.intent,
      challengeId: challenge.id,
      amount: challenge.request.amount,
      currency: challenge.request.currency,
      recipient: challenge.request.recipient,
      digest,
    }),
  );
}
export type AgentPaymentServices = {
  context: () => Promise<AgentContext>;
  reserve: (digest: string) => Promise<{ id: string; cached: boolean; lease_token?: string }>;
  signer: (bytes: Uint8Array, signature: string) => Promise<string>;
  verify: (expected: {
    network: 'testnet' | 'mainnet';
    digest: string;
    payer: string;
    recipient: string;
    coinType: string;
    amountAtomic: string;
    createdAt: string;
    expiresAt: string;
  }) => Promise<ReceiptProof>;
  finish: (
    claim: { id: string; lease_token?: string },
    proof: ReceiptProof | null,
    reason: string | null,
  ) => Promise<void>;
  realm: string;
  secretKey: string;
};
function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...headers },
  });
}
function matched(digest: string) {
  const receipt = Receipt.from({
    method: 'sui',
    reference: digest,
    status: 'success',
    timestamp: new Date().toISOString(),
  });
  return response(
    {
      status: 'matched',
      digest,
      next: 'The freelancer must reconcile this receipt. Final files still require explicit release.',
    },
    200,
    { 'Payment-Receipt': Receipt.serialize(receipt) },
  );
}
export async function handleAgentPayment(request: Request, services: AgentPaymentServices) {
  let ctx: AgentContext;
  try {
    ctx = await services.context();
  } catch {
    return response({ error: 'Agent key expired, revoked or invalid.' }, 401);
  }
  if (!ctx.payment) return response({ error: 'This agent connection is read-only.' }, 403);
  const payment = ctx.payment;
  // A retry after a lost response returns the existing receipt, never a fresh charge.
  if (
    payment.digest &&
    payment.claim?.digest === payment.digest &&
    ['verified', 'credited'].includes(payment.claim.status)
  )
    return matched(payment.digest);
  let challenge: ReturnType<typeof paymentChallenge>;
  try {
    challenge = paymentChallenge(ctx, services.realm, services.secretKey);
  } catch {
    return response(
      { error: 'Payment instructions expired or unavailable. No new payment is authorized.' },
      409,
    );
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization)
    return response(
      { status: 'payment_required', savedDigest: payment.digest, instructions: challenge },
      402,
      { 'WWW-Authenticate': Challenge.serialize(challenge) },
    );
  let digest: string;
  try {
    const credential = Credential.deserialize(authorization);
    // HMAC covers opaque request/grant/network/payer bindings as well as price and expiry.
    if (
      !Challenge.verify(credential.challenge, { secretKey: services.secretKey }) ||
      credential.challenge.id !== challenge.id
    )
      throw new Error('Invalid challenge');
    const payload = z
      .object({ digest: digestInput, signature: z.string().min(20).max(16384) })
      .parse(credential.payload);
    digest = payload.digest;
    if (payment.digest && payment.digest !== digest)
      return response(
        { error: 'Resume the saved digest. A second payment is not authorized.' },
        409,
      );
    const signer = await services.signer(
      paymentProofBytes(credential.challenge, digest),
      payload.signature,
    );
    if (signer !== payment.request.payer) throw new Error('Wrong proof signer');
  } catch {
    return response({ error: 'Invalid payment proof or challenge. No receipt was accepted.' }, 400);
  }
  let claim: Awaited<ReturnType<AgentPaymentServices['reserve']>>;
  try {
    claim = await services.reserve(digest);
  } catch {
    return response(
      {
        error:
          'Receipt is reserved, rate limited or belongs to another payment. Retry this digest; do not pay again.',
      },
      409,
    );
  }
  if (claim.cached) {
    const fresh = await services.context();
    return fresh.payment?.claim?.digest === digest &&
      ['verified', 'credited'].includes(fresh.payment.claim.status)
      ? matched(digest)
      : response({ error: 'The saved receipt did not match. No invoice credit was created.' }, 409);
  }
  try {
    const proof = await services.verify({
      network: payment.invoice.network,
      digest,
      payer: payment.request.payer,
      recipient: payment.invoice.recipient,
      coinType: payment.invoice.coin_type,
      amountAtomic: payment.request.amount_atomic,
      createdAt: payment.request.created_at,
      expiresAt: payment.request.expires_at,
    });
    await services.finish(claim, proof, null);
    return matched(digest);
  } catch {
    await services.finish(claim, null, 'provider_unavailable').catch(() => undefined);
    return response(
      {
        error:
          'Tatum could not confirm this receipt. The digest is saved. Retry verification; do not send another payment.',
      },
      503,
    );
  }
}
