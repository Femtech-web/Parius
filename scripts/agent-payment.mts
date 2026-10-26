/** Local, explicitly bounded MPP payer. Wallet secrets never enter Parius. */
import { parseArgs } from 'node:util';
import { open, readFile, writeFile, unlink } from 'node:fs/promises';
import { Challenge, Credential } from 'mppx';
import { sui } from '@suimpp/mpp/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { atomicAmount } from '../src/lib/domain';
import { usdcTypes } from '../src/lib/payments';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    execute: { type: 'boolean', default: false },
    amount: { type: 'string' },
    network: { type: 'string' },
    recipient: { type: 'string' },
    request: { type: 'string' },
    journal: { type: 'string' },
  },
});
async function main() {
  const url = new URL('/api/agent/payment', values.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    throw new Error('Use HTTPS, or localhost for development.');
  const key = process.env.PARIUS_AGENT_KEY;
  if (!key) throw new Error('Set PARIUS_AGENT_KEY locally. Do not paste it into a chat.');
  const headers = { 'X-Parius-Agent-Key': key };
  const first = await fetch(url, {
    method: 'POST',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (first.status !== 402) {
    const body = await first.json();
    console.log(JSON.stringify(body, null, 2));
    if (!first.ok) process.exitCode = 1;
    return;
  }
  const challenge = Challenge.fromResponse(first);
  const body = await first.json();
  console.log(
    JSON.stringify(
      {
        network: challenge.opaque?.network,
        recipient: challenge.request.recipient,
        amount: challenge.request.amount,
        request: challenge.opaque?.request,
        expires: challenge.expires,
        savedDigest: body.savedDigest,
      },
      null,
      2,
    ),
  );
  if (!values.execute) {
    console.log('Preview only. No wallet was loaded and no payment was sent.');
    return;
  }
  if (!values.journal || !values.amount || !values.network || !values.recipient || !values.request)
    throw new Error(
      '--execute requires --journal, --amount, --network, --recipient and --request.',
    );
  // Testnet is the enabled implementation phase. Mainnet requires a separate acceptance run.
  if (
    values.network !== 'testnet' ||
    challenge.opaque?.network !== values.network ||
    challenge.method !== 'sui' ||
    challenge.intent !== 'charge' ||
    challenge.request.currency !== usdcTypes.testnet ||
    atomicAmount(values.amount, 6) !== atomicAmount(String(challenge.request.amount), 6) ||
    challenge.request.recipient !== values.recipient ||
    challenge.opaque?.request !== values.request ||
    !challenge.expires ||
    Date.parse(challenge.expires) <= Date.now()
  )
    throw new Error('The challenge does not match your explicit Testnet payment authorization.');
  const walletSecret = process.env.PARIUS_AGENT_SUI_KEY;
  if (!walletSecret)
    throw new Error(
      'Set PARIUS_AGENT_SUI_KEY for a dedicated local Testnet wallet. Existing Slush keys are not required.',
    );
  const signer = Ed25519Keypair.fromSecretKey(walletSecret);
  if (signer.toSuiAddress() !== challenge.opaque?.payer)
    throw new Error('The dedicated agent wallet must match the client-reviewed sender.');
  const journal = values.journal;
  const lock = await open(`${journal}.lock`, 'wx', 0o600).catch(() => {
    throw new Error('Journal is locked by another attempt. Check it before retrying.');
  });
  try {
    let saved:
      | { request: string; connection: string; bytes: string; signature: string; digest: string }
      | undefined;
    try {
      saved = JSON.parse(await readFile(journal, 'utf8'));
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
    if (
      saved &&
      (saved.request !== values.request || saved.connection !== challenge.opaque?.connection)
    )
      throw new Error('This journal belongs to another payment.');
    if (body.savedDigest && body.savedDigest !== saved?.digest)
      throw new Error(
        'Parius already saved a digest. Resume its original journal; do not pay again.',
      );
    const client = new SuiGrpcClient({
      network: 'testnet',
      baseUrl: 'https://fullnode.testnet.sui.io:443',
    });
    if (!saved) {
      const tx = new Transaction();
      tx.setSender(signer.toSuiAddress());
      tx.transferObjects(
        [
          coinWithBalance({
            type: usdcTypes.testnet,
            balance: BigInt(atomicAmount(values.amount, 6)),
          }),
        ],
        values.recipient,
      );
      tx.setGasBudget(10_000_000); // Explicit ceiling: 0.01 test SUI, independent of invoice amount.
      const epoch = await client.ledgerService.getEpoch({ readMask: { paths: ['epoch'] } });
      if (epoch.response.epoch?.epoch === undefined)
        throw new Error('Could not determine transaction expiry.');
      tx.setExpiration({ Epoch: epoch.response.epoch.epoch.toString() });
      const bytes = await tx.build({ client });
      const signed = await signer.signTransaction(bytes);
      saved = {
        request: values.request,
        connection: challenge.opaque!.connection,
        bytes: toBase64(bytes),
        signature: signed.signature,
        digest: await Transaction.from(bytes).getDigest(),
      };
      await writeFile(journal, JSON.stringify(saved), { flag: 'wx', mode: 0o600 });
    }
    const prepared = saved;
    // suimpp creates the standard proof; execution always uses the durable saved transaction.
    const method = sui({
      client,
      signer,
      currency: { type: usdcTypes.testnet, decimals: 6 },
      execute: async () => {
        if (body.savedDigest) return { digest: prepared.digest };
        const result = await client.core.executeTransaction({
          transaction: fromBase64(prepared.bytes),
          signatures: [prepared.signature],
          include: { effects: true },
        });
        if (!result.Transaction?.status.success)
          throw new Error(
            'Transaction response is uncertain or failed. Keep this journal; do not create another transfer.',
          );
        return { digest: prepared.digest };
      },
    });
    const credential = await method.createCredential({
      challenge: {
        ...challenge,
        method: 'sui',
        intent: 'charge',
        request: {
          amount: String(challenge.request.amount),
          currency: String(challenge.request.currency),
          recipient: String(challenge.request.recipient),
        },
      },
    });
    // Parse once to ensure only a standard Payment credential is sent.
    Credential.deserialize(credential);
    const paid = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Authorization: credential },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    console.log(JSON.stringify(await paid.json(), null, 2));
    if (!paid.ok) process.exitCode = 1;
  } finally {
    await lock.close();
    await unlink(`${journal}.lock`);
  }
}
main().catch(() => {
  console.error(
    'Payment could not finish. Preserve the journal and retry the same request. No second transfer should be created. Check the preview and your explicit authorization values.',
  );
  process.exitCode = 1;
});
