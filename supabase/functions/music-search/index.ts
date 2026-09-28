/**
 * Song search for music on photo posts. Uses Apple's public iTunes Search
 * API (no key, no cost) and returns only songs with a 30-second preview.
 * Previews are streamed from Apple and always shown with the song, artist
 * and a link to Apple Music.
 *
 * POST { q: string } → { songs: Song[] }   (signed-in members only)
 */
import { corsHeaders, getCaller, json } from '../_shared/http.ts';

type ITunesSong = {
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  trackExplicitness?: string;
};

// Overridable only so tests can point at a local stand-in.
const SEARCH_URL = Deno.env.get('ITUNES_SEARCH_URL') ?? 'https://itunes.apple.com/search';
const APPLE = /^https:\/\/[a-z0-9.-]+\.(apple\.com|mzstatic\.com)\//;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await getCaller(req))) return json({ error: 'Sign in first.' }, 401);

  let q = '';
  try {
    q = String((await req.json())?.q ?? '').trim().slice(0, 80);
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (q.length < 2) return json({ songs: [] });

  const url = `${SEARCH_URL}?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '25', country: 'US' })}`;
  let results: ITunesSong[] = [];
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return json({ error: 'Song search isn’t available right now.' }, 502);
    results = ((await res.json()) as { results?: ITunesSong[] }).results ?? [];
  } catch {
    return json({ error: 'Song search isn’t available right now.' }, 502);
  }

  const songs = results
    .filter((r) => r.kind === 'song' && r.trackId && r.trackName && r.artistName && r.previewUrl && r.trackViewUrl)
    .filter((r) => APPLE.test(r.previewUrl!) && /^https:\/\/(music|itunes)\.apple\.com\//.test(r.trackViewUrl!))
    .map((r) => ({
      track_id: r.trackId!,
      title: r.trackName!,
      artist: r.artistName!,
      // Bigger cover art than the 100px default.
      artwork_url: r.artworkUrl100 && APPLE.test(r.artworkUrl100) ? r.artworkUrl100.replace('100x100bb', '300x300bb') : null,
      preview_url: r.previewUrl!,
      apple_url: r.trackViewUrl!.replace('https://itunes.apple.com/', 'https://music.apple.com/'),
      explicit: r.trackExplicitness === 'explicit',
    }))
    .slice(0, 20);
  return json({ songs });
});
