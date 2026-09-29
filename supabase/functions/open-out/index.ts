/**
 * Opening an Out. The database decides if you may (for an hour: the people it
 * was sent to, or its My Out audience; after that, only people who pinned it)
 * and marks it opened; this returns a link to the photo that works for one
 * minute. Nobody can read Outs straight from Storage.
 *
 * It also deletes photos that are finished (the hour is up and nobody pinned it).
 *
 * POST { out_id } → { id, url, kind, effect, caption, sender_name, created_at, expires_at, event_title, pinned, is_mine }
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';

const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const storageHeaders = () => ({ apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}`, 'Content-Type': 'application/json' });

async function signedUrl(path: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/sign/outs/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: storageHeaders(),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL?: string };
  // The link the phone opens. Locally the functions reach Storage on an internal
  // address, so tests can set a public one; in production they're the same.
  const base = Deno.env.get('PUBLIC_SUPABASE_URL') ?? SUPABASE_URL();
  return signedURL ? `${base}/storage/v1${signedURL}` : null;
}

/** Delete finished Outs' photos (a batch per call keeps this quick). */
async function cleanUp() {
  const { data } = await adminRest<{ id: number; path: string }[]>('rpc/outs_to_clean', { method: 'POST', body: { p_limit: 50 } });
  if (!data?.length) return;
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/outs`, {
    method: 'DELETE',
    headers: storageHeaders(),
    body: JSON.stringify({ prefixes: data.map((o) => o.path) }),
  });
  if (res.ok) await adminRest('rpc/outs_cleaned', { method: 'POST', body: { p_ids: data.map((o) => o.id) } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  let outId: number;
  try {
    outId = Number((await req.json())?.out_id);
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (!Number.isInteger(outId)) return json({ error: 'Bad request' }, 400);

  const { data, ok } = await adminRest<{
    path?: string;
    caption?: string | null;
    sender_name?: string;
    sender_id?: string;
    created_at?: string;
    event_title?: string | null;
    expires_at?: string;
    kind?: 'photo' | 'video';
    effect?: string | null;
    pinned?: boolean;
    is_mine?: boolean;
    error?: string;
  }>(
    'rpc/out_open',
    { method: 'POST', body: { p_out: outId, p_user: caller.id } },
  );
  if (!ok || !data) return json({ error: 'Outs aren’t available right now.' }, 502);
  if (data.error || !data.path) return json({ error: data.error ?? 'This Out is gone.' }, 410);

  const url = await signedUrl(data.path);
  // Tidy up after answering the first time; failures here never block opening.
  await cleanUp().catch(() => undefined);
  if (!url) return json({ error: 'Outs aren’t available right now.' }, 502);
  return json({
    id: outId,
    url,
    kind: data.kind ?? 'photo',
    effect: data.effect ?? null,
    caption: data.caption ?? null,
    sender_name: data.sender_name,
    sender_id: data.sender_id,
    created_at: data.created_at,
    event_title: data.event_title ?? null,
    expires_at: data.expires_at,
    pinned: !!data.pinned,
    is_mine: !!data.is_mine,
  });
});
