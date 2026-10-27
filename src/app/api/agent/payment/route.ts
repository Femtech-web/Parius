import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { handleAgentPayment } from '@/features/agents/payment';
import { agentContext, agentKeyHash, agentPaymentSecret } from '@/features/agents/server/access';
import { privilegedClient } from '@/lib/server/privileged';
import { verifyTatumReceipt } from '@/lib/server/tatum';
import { withPaymentTatum } from '@/features/payments/server/checkout';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let hash: string;
  try {
    hash = agentKeyHash(request.headers.get('X-Parius-Agent-Key') || '');
  } catch {
    return Response.json({ error: 'A valid project agent key is required.' }, { status: 401 });
  }
  const service = privilegedClient(12000);
  return handleAgentPayment(request, {
    context: () => agentContext(hash),
    realm: new URL(request.url).host,
    secretKey: agentPaymentSecret(),
    signer: (bytes, signature) =>
      withPaymentTatum(async (client) =>
        (await verifyPersonalMessageSignature(bytes, signature, { client })).toSuiAddress(),
      ),
    reserve: async (digest) => {
      const { data, error } = await service.rpc('reserve_agent_receipt', {
        p_hash: hash,
        p_digest: digest,
      });
      if (error) throw new Error('Receipt reservation failed.');
      return data;
    },
    verify: verifyTatumReceipt,
    finish: async (claim, proof, reason) => {
      const { error } = await service.rpc('finish_payment_check', {
        p_id: claim.id,
        p_token: claim.lease_token,
        p_proof: proof,
        p_reason: reason,
      });
      if (error) throw new Error('Receipt persistence failed.');
    },
  });
}
