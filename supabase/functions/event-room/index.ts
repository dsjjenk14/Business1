/**
 * A pass into a virtual event's room. The database decides who may join (the
 * host, group admins, and people who said I'm In, from 15 minutes before the
 * start) and this signs a LiveKit token with the right powers:
 *   voice  : everyone can talk (microphone only)
 *   video  : everyone can turn on camera and microphone
 *   stream : hosts go on camera; everyone else watches and chats
 * Everyone can send chat messages and reactions inside the room.
 *
 * POST { event_id } → { url, token, kind, role, title, event_id, host_id, host_name }
 *
 * The room also checks in about once a minute while you're connected, so your
 * Insiders see you're in a virtual event (a purple ring on your photo):
 * POST { ping: <room pass> } or { leave: <room pass> }. No sign-in needed:
 * the pass itself proves who and which room.
 *
 * Off until LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set
 * (docs/LIVE-VIDEO.md).
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';
import { livekitConfig, livekitToken, verifyLivekitToken } from '../_shared/livekit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: { event_id?: unknown; ping?: unknown; leave?: unknown };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  // Room check-in: who's in the room right now.
  const pass = typeof body.ping === 'string' ? body.ping : typeof body.leave === 'string' ? body.leave : null;
  if (pass) {
    const lk = livekitConfig();
    const who = lk ? await verifyLivekitToken(pass, lk.secret) : null;
    if (!who || !who.room.startsWith('event-')) return json({ error: 'Bad pass' }, 403);
    const { ok } = await adminRest('rpc/event_room_ping', {
      method: 'POST',
      body: { p_room: who.room, p_user: who.identity, p_leave: typeof body.leave === 'string' },
    });
    return json({ ok }, ok ? 200 : 502);
  }

  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);
  const eventId = Number(body.event_id);
  if (!Number.isInteger(eventId)) return json({ error: 'Bad request' }, 400);

  const { data, ok } = await adminRest<{
    room?: string;
    kind?: 'voice' | 'video' | 'stream';
    role?: 'host' | 'guest';
    name?: string;
    title?: string;
    minutes?: number;
    event_id?: number;
    host_id?: string;
    host_name?: string;
    error?: string;
  }>(
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
  return json({ url: lk.url, token, kind: data.kind, role: data.role, title: data.title ?? 'Event', event_id: data.event_id, host_id: data.host_id, host_name: data.host_name });
});
