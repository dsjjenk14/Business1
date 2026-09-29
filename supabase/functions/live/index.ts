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
import { livekitConfig, livekitToken } from '../_shared/livekit.ts';


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  const lk = livekitConfig();
  if (!lk) return json({ error: 'Live video isn’t turned on yet.' }, 503);
  const { url, key, secret } = lk;

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
  const token = await livekitToken({ key, secret, identity: caller.id, name: data.name ?? 'Member', room: data.room, ttlSec: ttl, canPublish: data.role === 'host' });
  return json({ url, token, role: data.role });
});
