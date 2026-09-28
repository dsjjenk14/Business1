import { readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';

/** A post's video or boomerang (a post has photos, a video, or a boomerang). */
export type PinMedia = {
  kind: 'video' | 'boomerang';
  path: string | null;
  poster_path: string | null;
  frames: string[] | null;
  duration_s: number | null;
};
/** What's shown: the same, with short-lived links to the files. */
export type PinMediaUrls = { kind: 'video' | 'boomerang'; videoUrl: string | null; frameUrls: string[] };

export const MAX_VIDEO_SECONDS = 30;
export const BOOMERANG_FRAMES = 10;

const BUCKET = 'pin-media';

/** Upload a video for a new post and attach it. */
export async function attachVideo(userId: string, pinId: number, uri: string, durationS?: number | null) {
  const { bytes, contentType } = await readBytes(uri, 'video/mp4');
  const type = contentType.includes('quicktime') ? 'video/quicktime' : 'video/mp4';
  const path = `${userId}/${pinId}/video.${type === 'video/quicktime' ? 'mov' : 'mp4'}`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) throw up.error;
  const { error } = await supabase.from('pin_media').insert({ pin_id: pinId, kind: 'video', path, duration_s: durationS ?? null });
  if (error) throw error;
}

/** Upload boomerang frames for a new post and attach them. */
export async function attachBoomerang(userId: string, pinId: number, frameUris: string[]) {
  const frames: string[] = [];
  for (const [i, uri] of frameUris.entries()) {
    const { bytes } = await readBytes(uri);
    const path = `${userId}/${pinId}/f${String(i + 1).padStart(2, '0')}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    frames.push(path);
  }
  const { error } = await supabase.from('pin_media').insert({ pin_id: pinId, kind: 'boomerang', frames });
  if (error) throw error;
}

// Cards ask one by one; batch those into one request (plus one to sign links).
const cache = new Map<number, Promise<PinMediaUrls | null>>();
let queue: { id: number; resolve: (m: PinMediaUrls | null) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue;
  queue = [];
  timer = null;
  const { data } = await supabase.from('pin_media').select('pin_id, kind, path, poster_path, frames, duration_s').in('pin_id', batch.map((b) => b.id));
  const rows = (data ?? []) as (PinMedia & { pin_id: number })[];
  const paths = rows.flatMap((r) => (r.kind === 'video' ? (r.path ? [r.path] : []) : (r.frames ?? [])));
  const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)).data ?? [] : [];
  const url = new Map(signed.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const byId = new Map(
    rows.map((r) => [
      r.pin_id,
      {
        kind: r.kind,
        videoUrl: r.kind === 'video' && r.path ? (url.get(r.path) ?? null) : null,
        frameUrls: (r.frames ?? []).map((f) => url.get(f)).filter((u): u is string => !!u),
      } satisfies PinMediaUrls,
    ]),
  );
  for (const b of batch) b.resolve(byId.get(b.id) ?? null);
}

export function pinMedia(pinId: number): Promise<PinMediaUrls | null> {
  const hit = cache.get(pinId);
  if (hit) return hit;
  const p = new Promise<PinMediaUrls | null>((resolve) => {
    queue.push({ id: pinId, resolve });
    if (!timer) timer = setTimeout(flush, 30);
  });
  cache.set(pinId, p);
  return p;
}

// A boomerang captured on the camera screen, waiting to be posted.
let draftFrames: string[] | null = null;
const draftListeners = new Set<(f: string[] | null) => void>();
export function setBoomerangDraft(frames: string[] | null) {
  draftFrames = frames;
  draftListeners.forEach((l) => l(frames));
}
export function takeBoomerangDraft() {
  const f = draftFrames;
  draftFrames = null;
  return f;
}
export function onBoomerangDraft(l: (f: string[] | null) => void) {
  draftListeners.add(l);
  return () => {
    draftListeners.delete(l);
  };
}
