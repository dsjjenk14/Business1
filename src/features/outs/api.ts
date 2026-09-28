import { readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';

export type OutsInbox = {
  received: { sender_id: string; name: string; avatar_url: string | null; unopened: number; latest_at: string; out_ids: number[]; next_out_id: number | null }[];
  stories: { sender_id: string; name: string; avatar_url: string | null; out_ids: number[]; latest_at: string; all_seen: boolean }[];
  my_story: { id: number; created_at: string; caption: string | null; audience: OutAudience; expires_at: string; views: number; pins: number; screenshots: number }[];
  sent: { id: number; created_at: string; to: string; recipients: number; opened: number; pins: number; screenshots: number }[];
  /** Outs you pinned: kept until you unpin them. */
  pinned: { id: number; created_at: string; caption: string | null; sender_id: string; sender_name: string; avatar_url: string | null; event_title: string | null }[];
};
export type OutAudience = 'circle' | 'network';
export type OpenedOut = {
  id: number;
  url: string;
  /** Photo, or a short video. */
  kind: 'photo' | 'video';
  caption: string | null;
  sender_name: string;
  sender_id: string;
  created_at: string;
  expires_at: string;
  event_title: string | null;
  pinned: boolean;
  is_mine: boolean;
};
export type OutEvent = { id: number; title: string; place: string | null };

export async function fetchOutsInbox() {
  const { data, error } = await supabase.rpc('outs_inbox');
  if (error) throw error;
  return data as unknown as OutsInbox;
}

/** Upload the photo, then send it to friends and/or post it to My Out. */
export async function sendOut(input: {
  userId: string;
  uri: string;
  /** A photo, or a video of up to 9 seconds. */
  kind: 'photo' | 'video';
  caption: string;
  to: string[];
  toStory: boolean;
  audience: OutAudience;
}) {
  const video = input.kind === 'video';
  const read = await readBytes(input.uri, video ? 'video/mp4' : 'image/jpeg');
  const bytes = read.bytes;
  // Phones don't always say what a file is; go by what was captured.
  const contentType = video
    ? /quicktime|\.mov$/i.test(read.contentType + input.uri)
      ? 'video/quicktime'
      : /webm/i.test(read.contentType)
        ? 'video/webm'
        : 'video/mp4'
    : read.contentType;
  const ext = video
    ? { 'video/quicktime': 'mov', 'video/webm': 'webm' }[contentType] ?? 'mp4'
    : contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpg';
  const path = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const up = await supabase.storage.from('outs').upload(path, bytes, { contentType });
  if (up.error) throw up.error;
  const { data, error } = await supabase.rpc('send_out', {
    p_path: path,
    p_caption: input.caption.trim(),
    p_recipients: input.to,
    p_to_story: input.toStory,
    p_audience: input.audience,
  });
  if (error) throw error;
  return data as number;
}

/** Open an Out: anyone it was meant for, as often as they like for 6 hours; after that, only people who pinned it. */
export async function openOut(outId: number): Promise<OpenedOut> {
  const { data, error } = await supabase.functions.invoke('open-out', { body: { out_id: outId } });
  if (error) {
    let message = 'Outs aren’t available right now.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return data as OpenedOut;
}

export async function reportScreenshot(outId: number) {
  await supabase.rpc('out_screenshot', { p_out: outId });
}

/** Pin an Out to keep it past 6 hours. The person who took it is told. */
export async function pinOut(outId: number) {
  const { error } = await supabase.rpc('pin_out', { p_out: outId });
  if (error) throw error;
}

export async function unpinOut(outId: number) {
  const { error } = await supabase.rpc('unpin_out', { p_out: outId });
  if (error) throw error;
}

/** The I'm In event you're at right now (its name goes on your Outs), or null. */
export async function fetchOutEvent() {
  const { data, error } = await supabase.rpc('my_out_event');
  if (error) throw error;
  return (data ?? null) as OutEvent | null;
}
