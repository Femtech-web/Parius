import { loadEnvFile } from 'node:process';
try {
  loadEnvFile('.env.local');
} catch {
  /* Deployed environments can supply variables directly. */
}
const secret = process.env.BACKGROUND_WORKER_SECRET;
if (!secret || secret.length < 32)
  throw new Error('Set BACKGROUND_WORKER_SECRET in .env.local (at least 32 characters).');
const app = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000');
if (!['http:', 'https:'].includes(app.protocol) || app.username || app.password)
  throw new Error('Invalid app origin.');
if (app.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(app.hostname))
  throw new Error('Use HTTPS outside localhost.');
const mode = process.argv[2] || 'once';
if (!['once', 'watch', 'status'].includes(mode)) throw new Error('Use once, watch or status.');
const stop = new AbortController();
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => stop.abort());
async function tick() {
  try {
    const response = await fetch(new URL('/api/internal/jobs', app.origin), {
      method: mode === 'status' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(58000)]),
    });
    if (!response.ok)
      throw new Error(
        `Worker returned HTTP ${response.status}. Check that the server, migration and worker secret are configured.`,
      );
    const data = await response.json();
    const allowed = [
      'outcome',
      'runs',
      'started_at',
      'finished_at',
      'memories',
      'files',
      'errors',
      'memory_waiting',
      'memory_attention',
      'file_waiting',
      'file_attention',
    ];
    console.log(
      JSON.stringify(
        Object.fromEntries(allowed.filter((key) => key in data).map((key) => [key, data[key]])),
      ),
    );
  } catch (error) {
    if (stop.signal.aborted) return;
    console.error(
      error instanceof Error && error.message.startsWith('Worker returned HTTP')
        ? error.message
        : 'Worker unavailable. Check your server and configuration.',
    );
    if (mode !== 'watch') process.exitCode = 1;
  }
}
do {
  await tick();
  if (mode !== 'watch' || stop.signal.aborted) break;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      stop.signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 120000);
    stop.signal.addEventListener('abort', done, { once: true });
    if (stop.signal.aborted) done();
  });
} while (!stop.signal.aborted);
