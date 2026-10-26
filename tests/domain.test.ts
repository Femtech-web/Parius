import test from 'node:test';
import assert from 'node:assert/strict';
import { atomicAmount, displayAmount, safeNext } from '../src/lib/domain';
test('money uses exact integer units, including values beyond floating point precision', () => {
  assert.equal(atomicAmount('0.000001', 6), '1');
  assert.equal(atomicAmount('9007199254740993.12', 2), '900719925474099312');
  assert.equal(atomicAmount('2400.50', 6), '2400500000');
  assert.throws(() => atomicAmount('12.001', 2));
  assert.throws(() => atomicAmount('-1', 6));
  assert.throws(() => atomicAmount('1e6', 6));
  assert.equal(displayAmount('2400500000', 'USDC', 6), '$2,400.50 USDC');
});
test('auth redirects stay on explicitly allowed local routes', () => {
  assert.equal(safeNext('/invite/abc'), '/invite/abc');
  for (const path of [
    'https://evil.test',
    '//evil.test',
    '/dashboard\\evil.test',
    '/dashboardevil',
    '/auth/callback',
  ])
    assert.equal(safeNext(path), '/dashboard');
});

test('invitation destination survives sign-in, callback and failed-auth retries without granting external redirects', async () => {
  const { authLoginPath, authCallbackUrl } = await import('../src/lib/auth-navigation');
  const origin = 'https://parius.example',
    invitation = '/invite/' + 'a'.repeat(64);
  const login = new URL(authLoginPath(invitation), origin);
  assert.equal(login.searchParams.get('next'), invitation);
  const callback = new URL(authCallbackUrl(origin, login.searchParams.get('next')!));
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, '/auth/callback');
  assert.equal(safeNext(callback.searchParams.get('next')), invitation);
  const retry = new URL(authLoginPath(callback.searchParams.get('next'), 'callback'), origin);
  assert.equal(retry.searchParams.get('error'), 'callback');
  assert.equal(retry.searchParams.get('next'), invitation);
  assert.equal(
    new URL(authCallbackUrl(origin, retry.searchParams.get('next')!)).searchParams.get('next'),
    invitation,
  );
  for (const unsafe of ['https://evil.example', '//evil.example', '/dashboard\\evil.example']) {
    assert.equal(
      new URL(authLoginPath(unsafe, 'callback'), origin).searchParams.get('next'),
      '/dashboard',
    );
    assert.equal(new URL(authCallbackUrl(origin, unsafe)).searchParams.get('next'), '/dashboard');
  }
});

test('auth callback keeps same-port loopback cookies on the initiating host and ignores untrusted redirect hosts', async () => {
  const { authResponseOrigin } = await import('../src/lib/auth-navigation');
  const request = (host: string, forwarded?: string) => ({
    url: 'http://localhost:3000/auth/callback',
    headers: new Headers({ host, ...(forwarded ? { 'x-forwarded-host': forwarded } : {}) }),
  });
  assert.equal(
    authResponseOrigin('http://localhost:3000', request('127.0.0.1:3000'), true),
    'http://127.0.0.1:3000',
  );
  assert.equal(
    authResponseOrigin('http://127.0.0.1:3000', request('localhost:3000'), true),
    'http://localhost:3000',
  );
  for (const host of ['evil.example', '127.0.0.1:9999', 'evil.example/path', 'user@evil.example']) {
    assert.equal(
      authResponseOrigin('http://localhost:3000', request(host, host), true),
      'http://localhost:3000',
    );
    assert.equal(
      authResponseOrigin('https://parius.example', request(host, host), false),
      'https://parius.example',
    );
  }
});
