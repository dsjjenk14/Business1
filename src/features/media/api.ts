import type { EffectKey } from '@/features/photos/effects';
import type { FilterKey } from '@/features/photos/filters';
import { readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';

/** A post's video or boomerang (a post has photos, a video, or a boomerang). */
export type PinMedia = {
  kind: 'video' | 'boomerang';
  path: string | null;
  poster_path: string | null;
  frames: string[] | null;
  duration_s: number | null;
  motion: Motion;
  effect: EffectKey | null;
};
/** What's shown: the same, with short-lived links to the files. */
export type PinMediaUrls = { kind: 'video' | 'boomerang'; videoUrl: string | null; frameUrls: string[]; motion: Motion; effect: EffectKey | null };

/**
 * Camera modes that shoot a quick burst of frames, and how each plays them:
 * boomerang (forward then back), slo-mo (the same, at half speed), rewind
 * (backward, on a loop) and loop (forward, on a loop).
 */
export type Motion = 'boomerang' | 'slowmo' | 'rewind' | 'loop';
export const MOTIONS: { key: Motion; label: string; fps: number }[] = [
  { key: 'boomerang', label: 'Boomerang', fps: 12 },
  { key: 'slowmo', label: 'Slo-mo', fps: 6 },
  { key: 'rewind', label: 'Rewind', fps: 10 },
  { key: 'loop', label: 'Loop', fps: 10 },
];
export const motionLabel = (m: Motion) => MOTIONS.find((x) => x.key === m)?.label ?? 'Boomerang';

/** A video or burst on a post being made (a post has photos, a video, or a burst). */
export type MediaDraft =
  | { kind: 'video'; uri: string; durationS: number | null; effect?: EffectKey }
  | {
      kind: 'boomerang';
      /** Frames as shown (with the filter baked in). */
      frames: string[];
      /** Frames as shot, to re-apply a different filter. */
      original?: string[];
      filter?: FilterKey;
      motion: Motion;
      effect?: EffectKey;
    }
  | null;

export const MAX_VIDEO_SECONDS = 30;
export const BOOMERANG_FRAMES = 10;

const BUCKET = 'pin-media';

/** Upload a video for a new post and attach it. */
export async function attachVideo(userId: string, pinId: number, uri: string, durationS?: number | null, effect?: EffectKey) {
  const { bytes, contentType } = await readBytes(uri, 'video/mp4');
  const type = contentType.includes('quicktime') ? 'video/quicktime' : 'video/mp4';
  const path = `${userId}/${pinId}/video.${type === 'video/quicktime' ? 'mov' : 'mp4'}`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) throw up.error;
  const { error } = await supabase.from('pin_media').insert({ pin_id: pinId, kind: 'video', path, duration_s: durationS ?? null, effect: effect && effect !== 'none' ? effect : null });
  if (error) throw error;
}

/** Upload burst frames (boomerang, slo-mo, rewind, loop) for a new post and attach them. */
export async function attachBoomerang(userId: string, pinId: number, frameUris: string[], motion: Motion = 'boomerang', effect?: EffectKey) {
  const frames: string[] = [];
  for (const [i, uri] of frameUris.entries()) {
    const { bytes } = await readBytes(uri);
    const path = `${userId}/${pinId}/f${String(i + 1).padStart(2, '0')}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    frames.push(path);
  }
  const { error } = await supabase.from('pin_media').insert({ pin_id: pinId, kind: 'boomerang', frames, motion, effect: effect && effect !== 'none' ? effect : null });
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
  const { data } = await supabase.from('pin_media').select('pin_id, kind, path, poster_path, frames, duration_s, motion, effect').in('pin_id', batch.map((b) => b.id));
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
        motion: r.motion ?? 'boomerang',
        effect: r.effect ?? null,
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

// Something shot on the camera screen, waiting to go on a post.
export type CaptureDraft = { kind: 'photo'; uri: string } | { kind: 'video'; uri: string; durationS: number | null } | { kind: 'motion'; frames: string[]; motion: Motion };
let draft: CaptureDraft | null = null;
const draftListeners = new Set<() => void>();
export function setCaptureDraft(d: CaptureDraft | null) {
  draft = d;
  draftListeners.forEach((l) => l());
}
export function takeCaptureDraft() {
  const d = draft;
  draft = null;
  return d;
}
export function onCaptureDraft(l: () => void) {
  draftListeners.add(l);
  return () => {
    draftListeners.delete(l);
  };
}
