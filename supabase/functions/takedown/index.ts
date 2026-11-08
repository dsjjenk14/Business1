/**
 * Admin: remove an intimate image named in a removal request, for good.
 * 1. Runs admin_takedown_remove as the calling admin (the database checks they're an admin),
 *    which deletes the post or Out and returns its files.
 * 2. Deletes those files from storage, so no copy is left behind.
 *
 * Body: { "id": <request id>, "note": "optional" }
 */
import { corsHeaders, json } from '../_shared/http.ts';
import { listPaths, removePaths } from '../_shared/storage.ts';

type FileRef = { bucket: string; path?: string; folder?: string };
const BUCKETS = new Set(['pin-media', 'pin-photos', 'outs', 'avatars']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in first.' }, 401);

  let id: unknown, note: unknown;
  try {
    ({ id, note } = await req.json());
  } catch {
    return json({ error: 'Missing request id.' }, 400);
  }
  if (typeof id !== 'number') return json({ error: 'Missing request id.' }, 400);

  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/admin_takedown_remove`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id, p_note: typeof note === 'string' ? note : null }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return json({ error: body?.message ?? 'Only admins can do this.' }, res.status === 401 ? 401 : 403);

  let removed = 0;
  let failed = false;
  for (const f of (Array.isArray(body) ? body : []) as FileRef[]) {
    if (!BUCKETS.has(f.bucket)) continue;
    const paths = f.path ? [f.path] : f.folder ? await listPaths(f.bucket, f.folder, 2) : [];
    if (!paths.length) continue;
    if (await removePaths(f.bucket, paths)) removed += paths.length;
    else failed = true;
  }
  if (failed) console.error('takedown: some files could not be deleted', id);
  return json({ removed: true, files: removed, file_errors: failed });
});
