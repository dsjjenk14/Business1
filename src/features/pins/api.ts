import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import type { GlyphName } from '@/components/ui/Glyph';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type PinCategory = Database['public']['Enums']['pin_category'];
export type PinAudience = Database['public']['Enums']['pin_audience'];
export type FeedPin = Database['public']['Functions']['pins_feed']['Returns'][number];
export type FeedMode = 'nearby' | 'trending' | 'community' | 'network' | 'bookmarks' | 'author' | 'single';

export const CATEGORY_LABEL: Record<PinCategory, string> = {
  thought: 'Thought',
  question: 'Question',
  photos: 'Photos',
  event: 'Event',
  going_out: 'Going Out',
  recap: 'Recap',
};

export const CATEGORY_GLYPH: Record<PinCategory, GlyphName> = {
  thought: 'thought',
  question: 'question',
  photos: 'camera',
  event: 'calendar',
  going_out: 'pin',
  recap: 'party',
};

export const FILTERS: { key: PinCategory | 'all'; label: string; glyph?: GlyphName }[] = [
  { key: 'all', label: 'All' },
  { key: 'thought', label: 'Thoughts', glyph: 'thought' },
  { key: 'question', label: 'Q&A', glyph: 'question' },
  { key: 'photos', label: 'Photos', glyph: 'camera' },
  { key: 'event', label: 'Events', glyph: 'calendar' },
  { key: 'going_out', label: 'Going Out', glyph: 'pin' },
];

export const AUDIENCE_OPTIONS: { key: PinAudience; label: string; detail: string }[] = [
  { key: 'everyone', label: 'Everyone', detail: "Nearby and They're In" },
  { key: 'network', label: 'My Network', detail: 'Your 1st and 2nd degree' },
  { key: 'circle', label: 'My Circle', detail: '1st degree only' },
];

export async function fetchFeed(args: {
  mode: FeedMode;
  lat?: number | null;
  lng?: number | null;
  radiusMi?: number;
  category?: PinCategory | null;
  author?: string;
  pin?: number;
  before?: string;
  limit?: number;
}): Promise<FeedPin[]> {
  const { data, error } = await supabase.rpc('pins_feed', {
    p_mode: args.mode,
    p_lat: args.lat ?? undefined,
    p_lng: args.lng ?? undefined,
    p_radius_mi: args.radiusMi,
    p_category: args.category ?? undefined,
    p_author: args.author,
    p_pin: args.pin,
    p_before: args.before,
    p_limit: args.limit ?? 30,
  });
  if (error) throw error;
  return data ?? [];
}

export async function setLiked(pinId: number, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('pin_likes').insert({ pin_id: pinId, user_id: userId })
    : await supabase.from('pin_likes').delete().eq('pin_id', pinId).eq('user_id', userId);
  if (error && error.code !== '23505') throw error;
}

export async function setBookmarked(pinId: number, userId: string, bookmarked: boolean) {
  const { error } = bookmarked
    ? await supabase.from('pin_bookmarks').insert({ pin_id: pinId, user_id: userId })
    : await supabase.from('pin_bookmarks').delete().eq('pin_id', pinId).eq('user_id', userId);
  if (error && error.code !== '23505') throw error;
}

export function sharePin(pin: Pick<FeedPin, 'id' | 'body' | 'author_name'>) {
  const url = Linking.createURL(`/pins/${pin.id}`);
  return Share.share({ message: `${pin.author_name} on I'm In: "${pin.body}"\n${url}`, url });
}

export type Reply = {
  id: number;
  body: string;
  created_at: string;
  author_id: string;
  author: { display_name: string; avatar_emoji: string | null; avatar_url: string | null } | null;
};

export async function fetchReplies(pinId: number): Promise<Reply[]> {
  const { data, error } = await supabase
    .from('pin_replies')
    .select('id, body, created_at, author_id, author:profiles!pin_replies_author_id_fkey(display_name, avatar_emoji, avatar_url)')
    .eq('pin_id', pinId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Reply[];
}

export async function addReply(pinId: number, userId: string, body: string) {
  const { error } = await supabase.from('pin_replies').insert({ pin_id: pinId, author_id: userId, body: body.trim() });
  if (error) throw error;
}

export async function editPin(pinId: number, body: string) {
  const { error } = await supabase.from('pins').update({ body: body.trim(), edited_at: new Date().toISOString() }).eq('id', pinId);
  if (error) throw error;
}

export async function deletePin(pinId: number) {
  const { error } = await supabase.from('pins').update({ deleted_at: new Date().toISOString() }).eq('id', pinId);
  if (error) throw error;
}

export const MAX_PHOTOS = 6;

/** Creates a pin, then uploads its photos to <user>/<pin>/<n>.jpg. */
export async function createPin(input: {
  userId: string;
  category: PinCategory;
  body: string;
  audience: PinAudience;
  lat?: number | null;
  lng?: number | null;
  photoUris: string[];
}): Promise<{ pinId: number; failedPhotos: number }> {
  const location = input.lat != null && input.lng != null ? `SRID=4326;POINT(${input.lng} ${input.lat})` : undefined;
  const { data, error } = await supabase
    .from('pins')
    .insert({ author_id: input.userId, category: input.category, body: input.body.trim(), audience: input.audience, approx_location: location })
    .select('id')
    .single();
  if (error) throw error;

  const failedPhotos = await uploadPinPhotos(input.userId, data.id, input.photoUris);
  return { pinId: data.id, failedPhotos };
}

/** Uploads photos for a pin to <user>/<pin>/<n>.jpg. Returns how many failed. */
export async function uploadPinPhotos(userId: string, pinId: number, photoUris: string[]): Promise<number> {
  let failedPhotos = 0;
  const uris = photoUris.slice(0, MAX_PHOTOS);
  for (const [i, uri] of uris.entries()) {
    try {
      const response = await fetch(uri);
      const blob = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const path = `${userId}/${pinId}/${i + 1}.${ext}`;
      const up = await supabase.storage.from('pin-photos').upload(path, blob, { contentType, upsert: true });
      if (up.error) throw up.error;
      const row = await supabase.from('pin_photos').insert({ pin_id: pinId, storage_path: path, position: i + 1 });
      if (row.error) throw row.error;
    } catch {
      failedPhotos += 1;
    }
  }
  return failedPhotos;
}

/** Short-lived links for pin photos (the bucket is private). */
export async function signPhotoPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from('pin-photos').createSignedUrls(paths, 60 * 60);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
