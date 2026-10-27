'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readMessages } from '@/features/conversation/server/history-actions';
import { cursorOf, mergeHistory, compareHistory } from '@/lib/history';
import type { Message } from '@/lib/domain';
export function useMessageHistory(
  projectId: string,
  incoming: Message[],
  incomingHasMore: boolean,
  preview: boolean,
) {
  const [items, setItems] = useState(incoming),
    [hasOlder, setHasOlder] = useState(incomingHasMore);
  const [olderPending, setOlderPending] = useState(false),
    [newerPending, setNewerPending] = useState(false),
    [needsCatchup, setNeedsCatchup] = useState(false),
    [error, setError] = useState('');
  const rows = useRef(incoming),
    latest = useRef({ incoming, incomingHasMore });
  useEffect(() => {
    latest.current = { incoming, incomingHasMore };
  }, [incoming, incomingHasMore]);
  const olderBusy = useRef(false),
    newerBusy = useRef(false);
  const merge = useCallback((page: Message[]) => {
    rows.current = mergeHistory(rows.current, page, true);
    setItems(rows.current);
  }, []);
  const catchUp = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      if (preview || newerBusy.current) return;
      newerBusy.current = true;
      await Promise.resolve();
      setNewerPending(true);
      setError('');
      try {
        if (!rows.current.length) {
          await Promise.resolve();
          if (!isCurrent()) return;
          merge(latest.current.incoming);
          setHasOlder(latest.current.incomingHasMore);
          setNeedsCatchup(false);
          return;
        }
        for (let step = 0; step < 5; step++) {
          const cursor = rows.current.at(-1)!;
          const page = await readMessages(projectId, cursorOf(cursor), 'newer');
          if (!isCurrent()) return;
          if (page.error) throw new Error(page.error);
          merge(page.messages || []);
          setNeedsCatchup(Boolean(page.hasMore));
          if (!page.hasMore) return;
        }
      } catch {
        if (isCurrent()) {
          setError('New messages could not be loaded. Retry to catch up.');
          setNeedsCatchup(true);
        }
      } finally {
        newerBusy.current = false;
        if (isCurrent()) setNewerPending(false);
      }
    },
    [projectId, preview, merge],
  );
  const incomingHead = incoming.at(-1)?.id;
  useEffect(() => {
    const head = latest.current.incoming.at(-1),
      current = rows.current.at(-1);
    if (!newerPending && !needsCatchup && head && (!current || compareHistory(head, current) > 0))
      void catchUp();
  }, [incomingHead, catchUp, newerPending, needsCatchup]);
  async function loadOlder(beforePrepend: () => void) {
    if (preview || olderBusy.current || !rows.current.length) return;
    olderBusy.current = true;
    setOlderPending(true);
    setError('');
    try {
      const page = await readMessages(projectId, cursorOf(rows.current[0]), 'older');
      if (page.error) throw new Error(page.error);
      beforePrepend();
      merge(page.messages || []);
      setHasOlder(Boolean(page.hasMore));
    } catch {
      setError('Earlier messages could not be loaded. Please retry.');
    } finally {
      olderBusy.current = false;
      setOlderPending(false);
    }
  }
  return { items, hasOlder, olderPending, newerPending, needsCatchup, error, loadOlder, catchUp };
}
