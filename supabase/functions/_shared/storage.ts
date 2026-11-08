/** Storage helpers for server functions (service role). */
const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = () => ({ apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}`, 'Content-Type': 'application/json' });

/** All object paths under a folder, up to `depth` levels deep. */
export async function listPaths(bucket: string, prefix: string, depth = 2): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: headers(),
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

export async function removePaths(bucket: string, paths: string[]) {
  let ok = true;
  for (let i = 0; i < paths.length; i += 100) {
    const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
    });
    if (!res.ok) ok = false;
  }
  return ok;
}
