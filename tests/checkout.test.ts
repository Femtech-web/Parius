import test from 'node:test';
import assert from 'node:assert/strict';
import { Transaction } from '@mysten/sui/transactions';
import { toBase58, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { inspectPreparedPayment, verifyCheckoutSignature } from '../src/lib/checkout';

// Entirely offline ephemeral fixtures; no funded objects or transactions.
async function fixture(key = new Ed25519Keypair()) {
  const tx = new Transaction();
  tx.setSender(key.toSuiAddress());
  tx.setGasOwner(key.toSuiAddress());
  const digest = toBase58(new Uint8Array(32).fill(1));
  const [coin] = tx.splitCoins(
    tx.objectRef({ objectId: '0x11', version: '1', digest }),
    [1_000_000],
  );
  tx.transferObjects([coin], '0x22');
  tx.setGasPayment([{ objectId: '0x33', version: '1', digest }]);
  tx.setGasPrice(1000);
  tx.setGasBudget(10_000_000);
  tx.setExpiration({ Epoch: 100 });
  const bytes = await tx.build();
  return {
    key,
    tx,
    bytes,
    encoded: toBase64(bytes),
    kind: await tx.build({ onlyTransactionKind: true }),
  };
}
test('reviewed bytes, digest and transaction-signature intent must match exactly', async () => {
  const f = await fixture(),
    { signature } = await f.key.signTransaction(f.bytes);
  const plan = { bytes: f.encoded, payer: f.key.toSuiAddress(), digest: await f.tx.getDigest() };
  await verifyCheckoutSignature(plan, f.encoded, signature);
  const changed = Transaction.from(f.bytes);
  changed.setGasBudget(20_000_000);
  await assert.rejects(
    verifyCheckoutSignature(plan, toBase64(await changed.build()), signature),
    /payment_changed/,
  );
  const foreign = await new Ed25519Keypair().signTransaction(f.bytes);
  await assert.rejects(verifyCheckoutSignature(plan, f.encoded, foreign.signature));
  const wrongIntent = await f.key.signPersonalMessage(f.bytes);
  await assert.rejects(verifyCheckoutSignature(plan, f.encoded, wrongIntent.signature));
  await assert.rejects(
    verifyCheckoutSignature({ ...plan, digest: 'wrong' }, f.encoded, signature),
    /payment_changed/,
  );
});
test('sponsor response may change gas, never payment kind, sender, fee cap or bounded expiry', async () => {
  const f = await fixture();
  const checked = await inspectPreparedPayment(
    f.encoded,
    f.kind,
    f.key.toSuiAddress(),
    'wallet',
    100n,
  );
  assert.equal(checked.digest, await f.tx.getDigest());
  const sponsored = Transaction.from(f.bytes);
  sponsored.setGasOwner(new Ed25519Keypair().toSuiAddress());
  await inspectPreparedPayment(
    toBase64(await sponsored.build()),
    f.kind,
    f.key.toSuiAddress(),
    'sponsored',
    100n,
  );
  for (const bad of [
    (tx: Transaction) => tx.setGasBudget(50_000_001),
    (tx: Transaction) => tx.setExpiration({ None: true }),
    (tx: Transaction) => tx.setExpiration({ Epoch: 99 }),
    (tx: Transaction) => tx.setExpiration({ Epoch: 102 }),
    (tx: Transaction) => tx.setSender(new Ed25519Keypair().toSuiAddress()),
    (tx: Transaction) => tx.transferObjects([tx.gas], '0x44'),
  ]) {
    const tx = Transaction.from(f.bytes);
    bad(tx);
    await assert.rejects(
      inspectPreparedPayment(
        toBase64(await tx.build()),
        f.kind,
        f.key.toSuiAddress(),
        'wallet',
        100n,
      ),
    );
  }
  await assert.rejects(
    inspectPreparedPayment(f.encoded, f.kind, f.key.toSuiAddress(), 'sponsored', 100n),
    /invalid_gas/,
  );
});
