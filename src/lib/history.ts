import { z } from 'zod';
export const historyCursor = z.object({
  created_at: z.iso
    .datetime({ offset: true })
    .refine((v) => (v.match(/\.(\d+)/)?.[1].length || 0) <= 6),
  id: z.uuid(),
});
export type HistoryCursor = z.infer<typeof historyCursor>;
export type HistoryRow = { id: string; created_at: string };
export function cursorOf(row: HistoryRow): HistoryCursor {
  return { created_at: row.created_at, id: row.id };
}
// Preserve PostgreSQL microseconds: Date alone collapses distinct rows into the same millisecond.
function micros(value: string) {
  return (
    BigInt(Date.parse(value)) * 1000n +
    BigInt((value.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3, 6) || '0')
  );
}
export function compareHistory(a: HistoryRow, b: HistoryRow) {
  const delta = micros(a.created_at) - micros(b.created_at);
  return delta < 0n ? -1 : delta > 0n ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export function mergeHistory<T extends HistoryRow>(
  existing: T[],
  updates: T[],
  ascending = false,
): T[] {
  return [...new Map([...existing, ...updates].map((row) => [row.id, row])).values()].sort(
    (a, b) => (ascending ? compareHistory(a, b) : compareHistory(b, a)),
  );
}
export function historyFilter(cursor: HistoryCursor, direction: 'older' | 'newer' = 'older') {
  const safe = historyCursor.parse(cursor),
    operator = direction === 'older' ? 'lt' : 'gt';
  return `created_at.${operator}.${safe.created_at},and(created_at.eq.${safe.created_at},id.${operator}.${safe.id})`;
}

export async function collectNewHistory<T extends HistoryRow>(
  existing: T[],
  read: (cursor?: HistoryCursor) => Promise<{ rows: T[]; hasMore?: boolean; error?: string }>,
  maxPages = 20,
): Promise<T[]> {
  let cursor = existing.length ? cursorOf(existing[0]) : undefined;
  let collected: T[] = [];
  for (let step = 0; step < maxPages; step++) {
    const page = await read(cursor);
    if (page.error) throw new Error(page.error);
    collected = mergeHistory(collected, page.rows);
    if (!page.hasMore) return collected;
    const newest = mergeHistory([], page.rows)[0];
    if (!newest || (cursor && compareHistory(newest, cursor) <= 0))
      throw new Error('History cursor did not advance.');
    cursor = cursorOf(newest);
  }
  throw new Error('Catch-up limit reached. Reopen history and page through recent activity.');
}
