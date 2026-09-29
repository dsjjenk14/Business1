/**
 * Send a drink to whoever is live. The database checks everything (they're
 * live, you can watch, you have the credit) and moves the money; this then
 * announces it in the room so everyone sees the drink arrive.
 *
 * POST { drink, live_id? , event_id?, anonymous? } → { gift_id, drink, name, from_name, balance_cents }
 */
import { corsHeaders, getCaller, json, userRpc } from '../_shared/http.ts';
import { livekitSendData } from '../_shared/livekit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  let body: { drink?: string; live_id?: number; event_id?: number; anonymous?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const r = await userRpc<{ room: string; drink: string; name: string; from_name: string; gift_id: number; balance_cents: number; message?: string }>(
    req,
    'send_drink',
    { p_drink: String(body.drink ?? ''), p_live: body.live_id ?? null, p_event: body.event_id ?? null, p_anonymous: body.anonymous === true },
  );
  if (!r.ok || !r.data) {
    const credit = /credit/i.test(r.error ?? '');
    return json({ error: r.error ?? 'Couldn’t send that drink.', code: credit ? 'no_credit' : null }, r.status === 401 ? 401 : 400);
  }
  await livekitSendData(r.data.room, { type: 'drink', drink: r.data.drink, name: r.data.name, from: r.data.from_name, gift: r.data.gift_id });
  const { room: _room, ...rest } = r.data;
  return json(rest);
});
