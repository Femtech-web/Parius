import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('previously authorized sender reconnects silently after a page reload', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    const address = '0x' + '12'.repeat(32);
    const account = { address, publicKey: new Uint8Array(32), chains: ['sui:testnet'], features: ['sui:signTransaction', 'sui:signPersonalMessage'] };
    let silentConnections = 0;
    const wallet = {
      id: 'com.mystenlabs.suiwallet', name: 'Slush', version: '1.0.0',
      icon: 'data:image/png;base64,AA==', chains: ['sui:testnet'], accounts: [],
      features: {
        'standard:connect': { version: '1.0.0', connect: async input => {
          assert.equal(input.silent, true);
          silentConnections++;
          return { accounts: [account] };
        } },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'sui:signTransaction': { version: '2.0.0', signTransaction() { throw new Error('Must not sign during restore'); } },
      },
    };
    globalThis.window = Object.assign(new EventTarget(), {
      location: { origin: 'http://localhost:3000' },
      open() { throw new Error('Must not open a popup during restore'); },
    });
    window.addEventListener('wallet-standard:app-ready', event => event.detail.register(wallet));
    const storage = new Map([['mysten-dapp-kit:selected-wallet-and-address', wallet.id + ':' + address + ':']]);
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    globalThis.document = { title: 'Parius', querySelector: () => null };
    delete process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    const module = await import('./src/features/payments/wallet-client.ts');
    const { dAppKit } = module.default ?? module;
    const unsubscribe = dAppKit.stores.$connection.subscribe(() => {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dAppKit.stores.$connection.get().account?.address, address, 'Saved sender should be available to checkout after reload');
    assert.equal(silentConnections, 1);
    await dAppKit.disconnectWallet();
    assert.equal(dAppKit.stores.$connection.get().account, null);
    assert.equal(storage.has('mysten-dapp-kit:selected-wallet-and-address'), false);
    unsubscribe();
    process.exit(0);
  `,
    ],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Slush popup navigates with the real Unicode page title and Parius wallet configuration', () => {
  // Isolate the real SDK's browser globals/registry from the other wallet tests.
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    let destination = 'about:blank';
    const popup = { closed: false, location: { assign(url) { destination = url; } } };
    globalThis.window = Object.assign(new EventTarget(), {
      location: { origin: 'http://localhost:3000', href: 'http://localhost:3000/projects/test' },
      screen: { width: 1440, height: 900 },
      open() { return popup; },
    });
    globalThis.document = {
      title: 'Parius — On the same page.',
      querySelector() { return null; },
    };
    globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
    // Metadata updates are irrelevant; never contact a provider in this regression test.
    globalThis.fetch = () => new Promise(() => {});
    globalThis.setInterval = () => 0;
    delete process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    const module = await import('./src/features/payments/wallet-client.ts');
    const { dAppKit } = module.default ?? module;
    const unsubscribe = dAppKit.stores.$wallets.subscribe(() => {});
    await new Promise(resolve => setImmediate(resolve));
    const wallet = dAppKit.stores.$wallets.get().find(wallet => wallet.name === 'Slush');
    assert.ok(wallet, 'Slush fallback registered');
    let error;
    void dAppKit.connectWallet({ wallet }).catch(reason => { error = reason; });
    await new Promise(resolve => setImmediate(resolve));
    assert.notEqual(destination, 'about:blank', error?.message || 'Popup stayed blank');
    const url = new URL(destination);
    assert.equal(url.origin, 'https://my.slush.app');
    const request = JSON.parse(atob(decodeURIComponent(url.hash.slice(1))));
    assert.equal(request.appName, 'Parius');
    assert.equal(request.payload.type, 'connect');
    unsubscribe();
  `,
    ],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
