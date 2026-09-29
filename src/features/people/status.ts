import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * What someone is up to right now, for the ring around their photo, plus
 * their profile photos (up to 3, rotated by Avatar).
 *   live    : on a live video you can watch
 *   virtual : in a virtual event's room
 *   out     : here now somewhere (their "here" audience includes you)
 */
export type PersonStatus = 'live' | 'virtual' | 'out' | null;
export type PersonInfo = { status: PersonStatus; photos: string[] };

// Fixed colors, the same in every theme, so they read as signals.
export const STATUS_COLORS: Record<Exclude<PersonStatus, null>, string> = {
  live: '#FF2D55',
  virtual: '#8E5CF7',
  out: '#22C55E',
};
export const STATUS_LABELS: Record<Exclude<PersonStatus, null>, string> = {
  live: 'Live now',
  virtual: 'In a virtual event',
  out: 'Out now',
};

const FRESH_MS = 60_000;
const cache = new Map<string, { info: PersonInfo; at: number }>();
const listeners = new Map<string, Set<(info: PersonInfo) => void>>();
const queued = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

// Everyone on screen is looked up together, a moment after they appear.
function schedule() {
  if (timer) return;
  timer = setTimeout(flush, 120);
}

async function flush() {
  timer = null;
  const ids = [...queued].slice(0, 200);
  ids.forEach((id) => queued.delete(id));
  if (queued.size) schedule();
  if (!ids.length) return;
  try {
    const { data, error } = await supabase.rpc('people_status', { p_ids: ids });
    if (error) throw error;
    const now = Date.now();
    const seen = new Set<string>();
    for (const row of data ?? []) {
      seen.add(row.user_id);
      const info: PersonInfo = { status: (row.status as PersonStatus) ?? null, photos: row.photos ?? [] };
      cache.set(row.user_id, { info, at: now });
      listeners.get(row.user_id)?.forEach((fn) => fn(info));
    }
    // Blocked or unknown: no ring, no extra photos.
    for (const id of ids) if (!seen.has(id)) cache.set(id, { info: { status: null, photos: [] }, at: now });
  } catch {
    // Keep what we had; try again on the next refresh.
  }
}

function request(id: string) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return;
  queued.add(id);
  schedule();
}

/** Forget what we know (e.g. after changing your own photos), so it's looked up again. */
export function refreshPersonInfo(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
  for (const key of id ? [id] : [...listeners.keys()]) if (listeners.get(key)?.size) request(key);
}

/** Someone's status and photos; refreshed about once a minute while shown. */
export function usePersonInfo(id: string | null | undefined): PersonInfo | null {
  // The latest answer for this id; anything older comes from the shared cache.
  const [latest, setLatest] = useState<{ id: string; info: PersonInfo } | null>(null);
  useEffect(() => {
    if (!id) return;
    const onInfo = (info: PersonInfo) => setLatest({ id, info });
    let set = listeners.get(id);
    if (!set) listeners.set(id, (set = new Set()));
    set.add(onInfo);
    request(id);
    const every = setInterval(() => request(id), FRESH_MS);
    return () => {
      clearInterval(every);
      set.delete(onInfo);
    };
  }, [id]);
  if (!id) return null;
  return latest?.id === id ? latest.info : (cache.get(id)?.info ?? null);
}
