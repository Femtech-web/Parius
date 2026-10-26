// Isolated fictional integration fixture. Explicit --write queues one real
// Mainnet memory. --recall runs in a separate process and uses remote content.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  pairedScopeReview,
  scopeContext,
  SCOPE_PROMPT_VERSION,
  type MemoryInfluence,
} from '../src/lib/scope-review';
import { memoryPayload } from '../src/lib/memory';
process.loadEnvFile('.env.local');
const { withMemory } = await import('../src/lib/server/memory');
const owner = '00000000-0000-4000-8000-000000000001';
const evidencePath = new URL('../private-notes/walrus-learning-evidence.json', import.meta.url);
const fixtureId = '00000000-0000-4000-8000-000000000002';
const lesson =
  'For suggested client replies, use exactly one concise sentence, avoid emoji, and end with one concrete next step. Do not add a new price or change the approved scope.';
let evidence: {
  id: string;
  jobId?: string;
  blobId?: string;
  status?: string;
  learnedReply?: string;
  baselineReply?: string;
  model?: string;
  promptVersion?: string;
  contextHash?: string;
  influences?: MemoryInfluence[];
} = { id: fixtureId };
try {
  evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
} catch {
  /* first run */
}
try {
  if (process.argv.includes('--write')) {
    await withMemory(owner, undefined, async (client) => {
      if (!evidence.jobId) {
        await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
        const accepted = await client.remember(memoryPayload(fixtureId, lesson), {
          idempotencyKey: 'parius-integration-learning-v1',
        });
        evidence.jobId = accepted.job_id;
        await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      }
      const status = await client.getRememberStatus(evidence.jobId!);
      evidence.status = status.status;
      evidence.blobId = status.blob_id;
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      console.log(
        JSON.stringify({
          check: 'Real Walrus Mainnet write',
          jobAccepted: Boolean(evidence.jobId),
          status: status.status,
          blobPresent: Boolean(status.blob_id),
        }),
      );
    });
  } else if (process.argv.includes('--recall')) {
    if (!evidence.jobId) throw new Error('Write the isolated fixture first.');
    await withMemory(owner, undefined, async (client) => {
      const status = await client.getRememberStatus(evidence.jobId!);
      evidence.status = status.status;
      evidence.blobId = status.blob_id;
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      if (status.status !== 'done') throw new Error('Remote job not done yet.');
      const recalled = await client.recall({
        query: 'How should I write a reply to a client requesting extra checkout work?',
        limit: 5,
      });
      const hit = recalled.results.find((r) => r.blob_id === evidence.blobId);
      if (!hit) throw new Error('Remote memory not recalled.');
      const payload = JSON.parse(hit.text);
      if (payload.parius_memory_id !== fixtureId || payload.lesson !== lesson)
        throw new Error('Provenance mismatch.');
      const { reviewScope } = await import('../src/lib/server/groq');
      const agreement = {
        id: 'fixture',
        project_id: 'fixture',
        title: 'Portfolio',
        scope:
          'Five portfolio pages and two revision rounds. E-commerce and checkout are excluded.',
        amount_atomic: '100000000',
        currency: 'USDC',
        decimals: 6,
        revision_limit: 2,
        version: 1,
        base_version_id: null,
        created_at: '2026-10-23T00:00:00Z',
      };
      const message = {
        id: 'fixture',
        project_id: 'fixture',
        author_id: 'client',
        author_name: 'Fictional client',
        body: 'Could we add product pages and checkout?',
        source: 'chat',
        created_at: agreement.created_at,
      };
      const model = process.env.GROQ_SCOPE_MODEL || 'openai/gpt-oss-120b';
      const pair = await pairedScopeReview(
        agreement,
        message,
        [{ id: fixtureId, lesson: payload.lesson }],
        (a, m, lessons) => reviewScope(a, m, lessons, { model }),
      );
      const before = pair.without,
        after = pair.withMemory;
      evidence.model = model;
      evidence.promptVersion = SCOPE_PROMPT_VERSION;
      evidence.contextHash = createHash('sha256')
        .update(scopeContext(agreement, message, []))
        .digest('hex');
      evidence.influences = after.influences;
      evidence.baselineReply = before.result.suggested_reply;
      evidence.learnedReply = after.result.suggested_reply;
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      console.log(
        JSON.stringify({
          check: 'Fresh-process Walrus learning',
          remoteRecall: true,
          provenanceValidated: true,
          replyChanged: before.result.suggested_reply !== after.result.suggested_reply,
          classificationPreserved: before.result.classification === after.result.classification,
          status: status.status,
          memoryCitationsChecked: after.influences.length,
          baselineCitations: before.influences.length,
          sameModelAndContext: true,
        }),
      );
    });
  } else throw new Error('Use --write or --recall.');
} catch (error) {
  const safe = error as { name?: string; status?: number; code?: string };
  console.log(
    JSON.stringify({
      check: 'Walrus learning evidence',
      ok: false,
      name: safe.name,
      status: safe.status || null,
      code: safe.code || null,
    }),
  );
  process.exitCode = 1;
}
