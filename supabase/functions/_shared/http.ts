/**
 * Shared helpers for Edge Functions. Dependency-free on purpose: plain fetch
 * calls to Supabase's REST and Auth APIs, so functions boot fast and never
 * need to download packages at runtime.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = () => Deno.env.get('SUPABASE_ANON_KEY')!;

/**
 * Database access as the server (bypasses row-level security).
 * `path` is a PostgREST path, e.g. "profile_private?select=email&phone=eq.%2B12025550100".
 */
export async function adminRest<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<{ data: T | null; count: number | null; ok: boolean }> {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: SERVICE_KEY(),
      Authorization: `Bearer ${SERVICE_KEY()}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const range = res.headers.get('content-range'); // "0-4/5" or "*/5"
  const count = range?.includes('/') ? Number(range.split('/')[1]) : null;
  const text = await res.text();
  return { data: text ? (JSON.parse(text) as T) : null, count: Number.isFinite(count) ? count : null, ok: res.ok };
}

/** Count rows matching a PostgREST filter. */
export async function adminCount(table: string, filter: string): Promise<number> {
  const { count } = await adminRest(`${table}?select=id&${filter}`, { method: 'HEAD', prefer: 'count=exact' });
  return count ?? 0;
}

/** The signed-in caller, or null. */
export async function getCaller(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, { headers: { apikey: ANON_KEY(), Authorization: auth } });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? { id: user.id } : null;
}

/** Email + password sign-in. Returns tokens, or null on failure. */
export async function passwordSignIn(email: string, password: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.access_token ? { access_token: body.access_token, refresh_token: body.refresh_token } : null;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function configNumber(key: string, fallback: number): Promise<number> {
  const { data } = await adminRest<{ value: unknown }[]>(`app_config?select=value&key=eq.${encodeURIComponent(key)}`);
  const n = Number(data?.[0]?.value);
  return Number.isFinite(n) ? n : fallback;
}

export const enc = encodeURIComponent;

/**
 * Call a database function as the signed-in caller (their token, not the
 * server's), so the database's own "who can see what" rules apply.
 */
export async function userRpc<T = unknown>(
  req: Request,
  fn: string,
  body: Record<string, unknown> = {},
): Promise<{ data: T | null; ok: boolean; status: number; error: string | null }> {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY(), Authorization: req.headers.get('Authorization') ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  // On failure, the database's own message (e.g. "Add drink credit to send this.").
  const error = res.ok ? null : ((parsed as { message?: string } | null)?.message ?? 'Something went wrong.');
  return { data: res.ok ? (parsed as T) : null, ok: res.ok, status: res.status, error };
}
