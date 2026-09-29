import { supabase } from '@/lib/supabase';
import { WEB_URL } from '@/lib/webUrl';

export type RoomKind = 'voice' | 'video' | 'stream' | 'link';
export type RoomPass = {
  url: string;
  token: string;
  kind: Exclude<RoomKind, 'link'>;
  role: 'host' | 'guest';
  title: string;
  /** For sending drinks to the host (only in the app, where you're signed in). */
  event_id?: number;
  host_id?: string;
  host_name?: string;
};

export const ROOM_KINDS: { key: RoomKind; label: string; detail: string; icon: 'mic-outline' | 'videocam-outline' | 'radio-outline' | 'link-outline' }[] = [
  { key: 'video', label: 'Video call', detail: 'Everyone on camera, like a group FaceTime.', icon: 'videocam-outline' },
  { key: 'voice', label: 'Voice chat', detail: 'Everyone can talk. No cameras.', icon: 'mic-outline' },
  { key: 'stream', label: 'Livestream', detail: 'You (and your group’s admins) on camera. Everyone else watches and chats.', icon: 'radio-outline' },
  { key: 'link', label: 'Your own link', detail: 'Zoom, Google Meet, Instagram Live, YouTube… Only people going see it.', icon: 'link-outline' },
];
export const roomKindLabel = (k: RoomKind | null | undefined) => ROOM_KINDS.find((x) => x.key === k)?.label ?? 'Online';

export async function setEventVirtual(eventId: number, format: 'in_person' | 'virtual' | 'hybrid', roomKind: RoomKind | null, joinUrl: string | null) {
  const { error } = await supabase.rpc('set_event_virtual', { p_event: eventId, p_format: format, p_room_kind: roomKind ?? undefined, p_join_url: joinUrl ?? undefined });
  if (error) throw error;
}

export class RoomError extends Error {
  constructor(
    message: string,
    public code: string | null,
  ) {
    super(message);
  }
}

/** A pass into the event's room (only for people going, from 15 minutes before). */
export async function fetchRoomPass(eventId: number): Promise<RoomPass> {
  const { data, error } = await supabase.functions.invoke('event-room', { body: { event_id: eventId } });
  if (error) {
    let message = 'The room isn’t available right now.';
    let code: string | null = null;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
      code = body?.code ?? null;
    } catch {
      // keep the default
    }
    throw new RoomError(message, code);
  }
  return data as RoomPass;
}

/**
 * Phones join through the web version (Expo Go can't do live audio and
 * video). The pass travels after the #, so it never reaches a server log,
 * and it only opens this one room.
 */
export function roomWebLink(pass: RoomPass) {
  const q = new URLSearchParams({ u: pass.url, t: pass.token, k: pass.kind, r: pass.role, n: pass.title });
  return `${WEB_URL}/room#${q.toString()}`;
}

export function parseRoomHash(hash: string): RoomPass | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const url = q.get('u');
  const token = q.get('t');
  const kind = q.get('k');
  if (!url || !token || !(kind === 'voice' || kind === 'video' || kind === 'stream')) return null;
  return { url, token, kind, role: q.get('r') === 'host' ? 'host' : 'guest', title: q.get('n') ?? 'Event' };
}

/**
 * Tell the server you're in an event's room (about once a minute while
 * connected) or that you left, so your Insiders see the purple ring on your
 * photo. The room pass proves who you are; best effort, never throws.
 */
export function roomCheckIn(token: string, leave = false) {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return;
  fetch(`${base}/functions/v1/event-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(leave ? { leave: token } : { ping: token }),
    // Lets the "left" message go out even as the page closes.
    keepalive: true,
  }).catch(() => undefined);
}
