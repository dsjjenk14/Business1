/**
 * Deletes the signed-in member's account and everything tied to it
 * (App Store requirement: account deletion from inside the app).
 *
 * 1. Hands any groups they own to another member (or deletes empty groups).
 * 2. Deletes their photos (avatar + pin photos) from storage.
 * 3. Deletes their login, which removes their profile, pins, replies, vouches,
 *    connections, messages and GPS readings (database cascades).
 *
 * Requires the body { "confirm": "DELETE" } so it can't be triggered by accident.
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';

const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const serviceHeaders = () => ({ apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}`, 'Content-Type': 'application/json' });

/** All object paths under a folder, two levels deep (avatars/<uid>/x, pin-photos/<uid>/<pin>/x). */
async function listPaths(bucket: string, prefix: string, depth = 2): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) return [];
  const entries: { name: string; id: string | null }[] = await res.json();
  const out: string[] = [];
  for (const e of entries) {
    const path = `${prefix}/${e.name}`;
    if (e.id) out.push(path);
    else if (depth > 1) out.push(...(await listPaths(bucket, path, depth - 1)));
  }
  return out;
}

async function removePaths(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await fetch(`${SUPABASE_URL()}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: 'Sign in first.' }, 401);

  let confirm: unknown;
  try {
    ({ confirm } = await req.json());
  } catch {
    return json({ error: 'Type DELETE to confirm.' }, 400);
  }
  if (confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  const prep = await adminRest('rpc/prepare_account_deletion', { method: 'POST', body: { p_user: user.id } });
  if (!prep.ok) return json({ error: "We couldn't delete your account right now. Try again, or contact support." }, 500);

  await removePaths('avatars', await listPaths('avatars', user.id, 1));
  await removePaths('pin-photos', await listPaths('pin-photos', user.id, 2));

  const del = await fetch(`${SUPABASE_URL()}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceHeaders() });
  if (!del.ok) {
    console.error('delete-account: auth delete failed', del.status, await del.text());
    return json({ error: "We couldn't delete your account right now. Try again, or contact support." }, 500);
  }
  return json({ deleted: true });
});
