/** Isolated hosted QA fixtures. Only an explicitly authorized --execute run sends test funds. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { usdcTypes } from '../src/features/payments/domain';
import { createClient } from '@supabase/supabase-js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Challenge } from 'mppx';
import {
  walletChallengeMessage,
  verifyWalletChallenge,
  type WalletChallenge,
} from '../src/features/payments/wallets';
process.loadEnvFile('.env.local');
if (process.env.NEXT_PUBLIC_SUI_NETWORK !== 'testnet')
  throw new Error('This acceptance fixture only supports Testnet.');
const path = '/private/tmp/parius-agent-acceptance.json';
const origin = 'http://localhost:3000';
type Fixture = {
  password: string;
  freelancerEmail: string;
  clientEmail: string;
  payerSecret: string;
  recipientSecret: string;
  project?: string;
  invoice?: string;
  request?: string;
  key?: string;
};
let fixture: Fixture;
try {
  fixture = JSON.parse(await readFile(path, 'utf8'));
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
    throw error;
  const suffix = randomBytes(8).toString('hex');
  fixture = {
    password: randomBytes(32).toString('base64url'),
    freelancerEmail: `parius-agent-f-${suffix}@example.invalid`,
    clientEmail: `parius-agent-c-${suffix}@example.invalid`,
    payerSecret: new Ed25519Keypair().getSecretKey(),
    recipientSecret: new Ed25519Keypair().getSecretKey(),
  };
  await writeFile(path, JSON.stringify(fixture), { flag: 'wx', mode: 0o600 });
}
const save = () => writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
const e = process.env;
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const service = createClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, options);
async function session(email: string) {
  const client = createClient(
    e.NEXT_PUBLIC_SUPABASE_URL!,
    e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
  let result = await client.auth.signInWithPassword({ email, password: fixture.password });
  if (result.error) {
    const created = await service.auth.admin.createUser({
      email,
      password: fixture.password,
      email_confirm: true,
    });
    if (created.error) throw new Error('Could not prepare isolated QA account.');
    result = await client.auth.signInWithPassword({ email, password: fixture.password });
  }
  if (result.error || !result.data.user) throw new Error('QA sign-in failed.');
  return { db: client, user: result.data.user };
}
async function rpc(
  db: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name} failed (${error.code}).`);
  return data;
}
const f = await session(fixture.freelancerEmail),
  c = await session(fixture.clientEmail);
const payer = Ed25519Keypair.fromSecretKey(fixture.payerSecret),
  recipient = Ed25519Keypair.fromSecretKey(fixture.recipientSecret);
if (!fixture.project) {
  fixture.project = await rpc(f.db, 'create_project', {
    p_name: 'Agent acceptance · Testnet',
    p_description: 'Isolated MCP and MPP acceptance fixture. No user project is modified.',
    p_client_name: 'Agent QA client',
    p_display_name: 'Agent QA freelancer',
  });
  await save();
  const invite = randomBytes(32).toString('hex');
  await rpc(f.db, 'create_project_invite', { p_project: fixture.project, p_token_hash: invite });
  await rpc(c.db, 'accept_project_invite', {
    p_token_hash: invite,
    p_display_name: 'Agent QA client',
  });
}
for (const [owner, key] of [
  [f.user.id, recipient],
  [c.user.id, payer],
] as const) {
  const found = await service
    .from('wallet_bindings')
    .select('id')
    .eq('owner_id', owner)
    .eq('address', key.toSuiAddress())
    .is('revoked_at', null)
    .maybeSingle();
  if (!found.data) {
    const challenge = (await rpc(service, 'begin_wallet_challenge', {
      p_owner: owner,
      p_address: key.toSuiAddress(),
      p_network: 'testnet',
      p_origin: origin,
    })) as WalletChallenge;
    const signature = (
      await key.signPersonalMessage(new TextEncoder().encode(walletChallengeMessage(challenge)))
    ).signature;
    const skew = Date.parse(challenge.created_at) - Date.now();
    if (skew > 5000)
      throw new Error(
        `QA clock is ${skew}ms behind the database; synchronize clocks before continuing.`,
      );
    if (skew > 0) await new Promise((resolve) => setTimeout(resolve, skew + 20));
    await verifyWalletChallenge(challenge, signature, { owner, origin, network: 'testnet' });
    await rpc(service, 'complete_wallet_challenge', {
      p_id: challenge.id,
      p_owner: owner,
      p_signature_hash: createHash('sha256').update(signature).digest('hex'),
    });
  }
}
if (!fixture.invoice) {
  const agreement = await rpc(f.db, 'propose_agreement', {
    p_project: fixture.project,
    p_title: 'Agent payment acceptance',
    p_scope:
      'One Testnet invoice payment for a reviewed project. No automatic release or public message.',
    p_amount: '10000',
    p_currency: 'USDC',
    p_decimals: 6,
    p_revisions: 1,
    p_expected_base: null,
  });
  await rpc(f.db, 'approve_agreement', { p_project: fixture.project, p_agreement: agreement });
  await rpc(c.db, 'approve_agreement', { p_project: fixture.project, p_agreement: agreement });
  fixture.invoice = await rpc(f.db, 'draft_invoice', {
    p_project: fixture.project,
    p_agreement: agreement,
    p_title: 'MPP Testnet acceptance',
    p_amount: '10000',
    p_due: null,
    p_milestone: null,
  });
  await save();
  await rpc(f.db, 'issue_invoice', {
    p_id: fixture.invoice,
    p_network: 'testnet',
    p_recipient: recipient.toSuiAddress(),
  });
}
if (!fixture.request) {
  fixture.request = await rpc(c.db, 'prepare_payment_request', {
    p_invoice: fixture.invoice,
    p_payer: payer.toSuiAddress(),
    p_amount: '10000',
  });
  await save();
}
if (!fixture.key) {
  fixture.key = `parius_${randomBytes(32).toString('base64url')}`;
  await rpc(c.db, 'create_agent_connection', {
    p_project: fixture.project,
    p_label: 'Isolated live acceptance',
    p_hash: createHash('sha256').update(fixture.key).digest('hex'),
    p_request: fixture.request,
  });
  await save();
}
if (process.argv.includes('--finalize')) {
  const old = await c.db.from('agent_connections').select('id').eq('project_id', fixture.project!);
  if (old.error) throw new Error('QA connections could not be read.');
  for (const row of old.data) await rpc(c.db, 'revoke_agent_connection', { p_id: row.id });
  // Test revocation with a fresh read-only key, even if the payment key expired between turns.
  const freshKey = `parius_${randomBytes(32).toString('base64url')}`;
  const connection = await rpc(c.db, 'create_agent_connection', {
    p_project: fixture.project,
    p_label: 'QA revocation acceptance',
    p_hash: createHash('sha256').update(freshKey).digest('hex'),
    p_request: null,
  });
  const probe = new Client({ name: 'parius-revocation-acceptance', version: '1' });
  await probe.connect(
    new StreamableHTTPClientTransport(new URL('/api/mcp', origin), {
      requestInit: { headers: { Authorization: `Bearer ${freshKey}` } },
    }),
  );
  try {
    if ((await probe.callTool({ name: 'project_context', arguments: {} })).isError)
      throw new Error('Fresh read-only key failed.');
    const local = new Client({ name: 'parius-stdio-acceptance', version: '1' });
    await local.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', fileURLToPath(new URL('./agent-mcp.mts', import.meta.url))],
        env: { PATH: process.env.PATH || '', PARIUS_URL: origin, PARIUS_AGENT_KEY: freshKey },
        stderr: 'pipe',
      }),
    );
    try {
      if (
        (await local.listTools()).tools.length !== 3 ||
        (await local.callTool({ name: 'project_context', arguments: {} })).isError
      )
        throw new Error('Local stdio bridge failed.');
    } finally {
      await local.close();
    }
    await rpc(c.db, 'revoke_agent_connection', { p_id: connection });
    const mcp = await fetch(new URL('/api/mcp', origin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshKey}` },
      signal: AbortSignal.timeout(20000),
    });
    const mpp = await fetch(new URL('/api/agent/payment', origin), {
      method: 'POST',
      headers: { 'X-Parius-Agent-Key': freshKey },
      signal: AbortSignal.timeout(20000),
    });
    if (mcp.status !== 401 || mpp.status !== 401) throw new Error('Revocation failed.');
    console.log(
      JSON.stringify({
        liveFreshKeyAccess: 'passed',
        localStdioBridge: 'passed',
        liveRevocation: 'passed',
        mcpAfterRevoke: mcp.status,
        mppAfterRevoke: mpp.status,
        qaPaymentKeyRevoked: true,
        additionalFundsMoved: false,
      }),
    );
  } finally {
    await probe.close();
  }
  process.exit(0);
}
const client = new Client({ name: 'parius-hosted-acceptance', version: '1' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', origin), {
    requestInit: { headers: { Authorization: `Bearer ${fixture.key}` } },
  }),
);
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 3) throw new Error('Unexpected MCP tools.');
  const context = await client.callTool({ name: 'project_context', arguments: {} });
  if (context.isError) throw new Error('MCP context failed.');
  const handoff = await client.callTool({ name: 'payment_handoff', arguments: {} });
  if (handoff.isError) throw new Error('MCP payment handoff failed.');
  const challengeResponse = await fetch(new URL('/api/agent/payment', origin), {
    method: 'POST',
    headers: { 'X-Parius-Agent-Key': fixture.key },
    signal: AbortSignal.timeout(20000),
  });
  if (challengeResponse.status === 402) {
    const challenge = Challenge.fromResponse(challengeResponse);
    if (challenge.request.amount !== '0.010000' || challenge.opaque?.payer !== payer.toSuiAddress())
      throw new Error('MPP challenge mismatch.');
  } else if (
    challengeResponse.status !== 200 ||
    (await challengeResponse.json()).status !== 'matched'
  ) {
    throw new Error(`Expected MPP challenge or saved receipt; got ${challengeResponse.status}.`);
  }
  console.log(
    JSON.stringify(
      {
        hostedMcpDiscovery: 'passed',
        projectContext: 'passed',
        paymentHandoff: 'passed',
        mppChallenge:
          challengeResponse.status === 402 ? 'passed' : 'saved completed receipt returned',
        fundsMoved: false,
        fixtureProject: `${origin}/projects/${fixture.project}?tab=payments`,
        dedicatedTestnetPayer: payer.toSuiAddress(),
        needed: '0.01 canonical Testnet USDC plus Testnet SUI for gas',
        fixtureFile: path,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--execute')) {
    const chain = new SuiGrpcClient({
      network: 'testnet',
      baseUrl: 'https://fullnode.testnet.sui.io:443',
    });
    const [suiBalance, usdcBalance] = await Promise.all([
      chain.core.getBalance({ owner: payer.toSuiAddress(), coinType: '0x2::sui::SUI' }),
      chain.core.getBalance({ owner: payer.toSuiAddress(), coinType: usdcTypes.testnet }),
    ]);
    if (
      BigInt(suiBalance.balance.balance) < 10_000_000n ||
      BigInt(usdcBalance.balance.balance) < 10000n
    )
      throw new Error('The dedicated wallet needs canonical Testnet USDC and SUI first.');
    console.log(
      JSON.stringify({
        funding: 'confirmed',
        testSuiAtomic: suiBalance.balance.balance,
        testUsdcAtomic: usdcBalance.balance.balance,
      }),
    );
    const args = [
      '--import',
      'tsx',
      fileURLToPath(new URL('./agent-payment.mts', import.meta.url)),
      '--url',
      origin,
      '--execute',
      '--network',
      'testnet',
      '--amount',
      '0.01',
      '--recipient',
      recipient.toSuiAddress(),
      '--request',
      fixture.request!,
      '--journal',
      '/private/tmp/parius-agent-payment.json',
    ];
    const env = {
      ...process.env,
      PARIUS_AGENT_KEY: fixture.key,
      PARIUS_AGENT_SUI_KEY: fixture.payerSecret,
    };
    const output = execFileSync(process.execPath, args, { env, encoding: 'utf8', timeout: 90000 });
    console.log(output);
    const context = await rpc(service, 'agent_context', {
      p_hash: createHash('sha256').update(fixture.key!).digest('hex'),
    });
    if (context.payment.claim?.status !== 'verified')
      throw new Error('Live receipt is not Tatum matched yet.');
    const claimId = context.payment.claim.id;
    const receipt = await rpc(f.db, 'reconcile_verified_receipt', {
      p_claim: claimId,
      p_replace_manual: null,
    });
    const repeated = await rpc(f.db, 'reconcile_verified_receipt', {
      p_claim: claimId,
      p_replace_manual: null,
    });
    if (receipt !== repeated) throw new Error('Reconciliation was not idempotent.');
    // Re-running the same journal must return the saved result before loading/signing a wallet.
    console.log(execFileSync(process.execPath, args, { env, encoding: 'utf8', timeout: 30000 }));
    const records = await c.db
      .from('payment_records')
      .select('amount_atomic,digest,source')
      .eq('invoice_id', fixture.invoice!);
    if (
      records.error ||
      records.data.length !== 1 ||
      records.data[0].amount_atomic !== '10000' ||
      records.data[0].source !== 'sui'
    )
      throw new Error('Unexpected invoice allocation.');
    console.log(
      JSON.stringify(
        {
          liveAgentPayment: 'passed',
          network: 'testnet',
          amount: '0.01 USDC',
          digest: records.data[0].digest,
          tatum: 'verified',
          freelancer: 'reconciled',
          receivedAtomic: '10000',
          remainingAtomic: '0',
          duplicateTransfer: false,
          duplicateCredit: false,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.close();
}
