import { supabase } from '@/lib/supabase';

/** A song with a 30-second Apple Music preview. */
export type Song = {
  track_id: number;
  title: string;
  artist: string;
  artwork_url: string | null;
  preview_url: string;
  apple_url: string;
  explicit?: boolean;
};

export async function searchSongs(q: string): Promise<Song[]> {
  const { data, error } = await supabase.functions.invoke('music-search', { body: { q } });
  if (error) {
    let message = 'Song search isn’t available right now.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return ((data as { songs?: Song[] })?.songs ?? []) as Song[];
}

export async function attachMusic(pinId: number, song: Song) {
  const { error } = await supabase.from('pin_music').insert({
    pin_id: pinId,
    track_id: song.track_id,
    title: song.title,
    artist: song.artist,
    artwork_url: song.artwork_url,
    preview_url: song.preview_url,
    apple_url: song.apple_url,
  });
  if (error) throw error;
}

// Pin cards ask for their song one by one; batch those into one request.
const cache = new Map<number, Promise<Song | null>>();
let queue: { id: number; resolve: (s: Song | null) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue;
  queue = [];
  timer = null;
  const ids = batch.map((b) => b.id);
  const { data } = await supabase.from('pin_music').select('*').in('pin_id', ids);
  const byId = new Map((data ?? []).map((row) => [row.pin_id, row as unknown as Song & { pin_id: number }]));
  for (const b of batch) b.resolve(byId.get(b.id) ?? null);
}

export function pinMusic(pinId: number): Promise<Song | null> {
  const hit = cache.get(pinId);
  if (hit) return hit;
  const p = new Promise<Song | null>((resolve) => {
    queue.push({ id: pinId, resolve });
    if (!timer) timer = setTimeout(flush, 30);
  });
  cache.set(pinId, p);
  return p;
}
