/**
 * Live video access. The app asks here for a pass to a live video; the
 * database decides who may watch (circle / network / everyone, blocks),
 * and this signs a short-lived LiveKit access token. Only the host can send
 * video; viewers can only watch.
 *
 * POST { stream_id } → { url, token, role }
 *
 * Off until LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set
 * (docs/LIVE-VIDEO.md).
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

/** A LiveKit access token (a JWT signed with HS256). */
async function livekitToken(key: string, secret: string, identity: string, name: string, room: string, canPublish: boolean, ttlSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: key,
    sub: identity,
    name,
    nbf: now - 10,
    exp: now + ttlSec,
    video: { room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: false },
  };
  const body = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  const url = Deno.env.get('LIVEKIT_URL') ?? '';
  const key = Deno.env.get('LIVEKIT_API_KEY') ?? '';
  const secret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
  if (!url.startsWith('wss://') || !key || !secret) return json({ error: 'Live video isn’t turned on yet.' }, 503);

  let streamId: number;
  try {
    streamId = Number((await req.json())?.stream_id);
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (!Number.isInteger(streamId)) return json({ error: 'Bad request' }, 400);

  const { data, ok } = await adminRest<{ room?: string; role?: 'host' | 'viewer'; name?: string; max_minutes?: number; error?: string }>(
    'rpc/live_join_check',
    { method: 'POST', body: { p_stream: streamId, p_user: caller.id } },
  );
  if (!ok || !data) return json({ error: 'Live video isn’t available right now.' }, 502);
  if (data.error || !data.room || !data.role) return json({ error: data.error ?? 'Live video not found.' }, 404);

  const ttl = Math.max(15, Number(data.max_minutes ?? 120)) * 60;
  const token = await livekitToken(key, secret, caller.id, data.name ?? 'Member', data.room, data.role === 'host', ttl);
  return json({ url, token, role: data.role });
});
