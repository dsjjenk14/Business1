/**
 * A pass into a virtual event's room. The database decides who may join (the
 * host, group admins, and people who said I'm In, from 15 minutes before the
 * start) and this signs a LiveKit token with the right powers:
 *   voice  : everyone can talk (microphone only)
 *   video  : everyone can turn on camera and microphone
 *   stream : hosts go on camera; everyone else watches and chats
 * Everyone can send chat messages and reactions inside the room.
 *
 * POST { event_id } → { url, token, kind, role, title }
 *
 * Off until LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set
 * (docs/LIVE-VIDEO.md).
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';
import { livekitConfig, livekitToken } from '../_shared/livekit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  let eventId: number;
  try {
    eventId = Number((await req.json())?.event_id);
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (!Number.isInteger(eventId)) return json({ error: 'Bad request' }, 400);

  const { data, ok } = await adminRest<{ room?: string; kind?: 'voice' | 'video' | 'stream'; role?: 'host' | 'guest'; name?: string; title?: string; minutes?: number; error?: string }>(
    'rpc/event_room_join_check',
    { method: 'POST', body: { p_event: eventId, p_user: caller.id } },
  );
  if (!ok || !data) return json({ error: 'The room isn’t available right now.' }, 502);
  if (data.error || !data.room || !data.kind) return json({ error: data.error ?? 'Event not found.' }, 403);

  const lk = livekitConfig();
  if (!lk) return json({ error: 'Voice and video rooms aren’t turned on yet.', code: 'not_configured' }, 503);

  const host = data.role === 'host';
  const token = await livekitToken({
    key: lk.key,
    secret: lk.secret,
    identity: caller.id,
    name: data.name ?? 'Member',
    room: data.room,
    ttlSec: Math.min(8 * 60, Math.max(30, Number(data.minutes ?? 240))) * 60,
    canPublish: data.kind !== 'stream' || host,
    canPublishSources: data.kind === 'voice' ? ['microphone'] : undefined,
    canPublishData: true,
  });
  return json({ url: lk.url, token, kind: data.kind, role: data.role, title: data.title ?? 'Event' });
});
