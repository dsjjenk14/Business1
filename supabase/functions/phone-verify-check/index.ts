/** Checks a 6-digit code and marks the member's phone as verified. */
import { adminRest, corsHeaders, getCaller, json, sha256 } from '../_shared/http.ts';

const MAX_ATTEMPTS = 5;

type Pending = { id: number; phone: string; code_hash: string; attempts: number; expires_at: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: 'Sign in first.' }, 401);

  let code: unknown;
  try {
    ({ code } = await req.json());
  } catch {
    return json({ error: 'Enter the 6-digit code.' }, 400);
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return json({ error: 'Enter the 6-digit code.' }, 400);

  const { data: rows } = await adminRest<Pending[]>(
    `phone_verifications?select=id,phone,code_hash,attempts,expires_at&user_id=eq.${user.id}&verified_at=is.null&order=created_at.desc&limit=1`,
  );
  const pending = rows?.[0];
  if (!pending || new Date(pending.expires_at) < new Date()) return json({ error: 'That code expired. Send a new one.' }, 400);
  if (pending.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many wrong tries. Send a new code.' }, 429);

  if ((await sha256(`${user.id}:${code}`)) !== pending.code_hash) {
    await adminRest(`phone_verifications?id=eq.${pending.id}`, { method: 'PATCH', body: { attempts: pending.attempts + 1 }, prefer: 'return=minimal' });
    return json({ error: "That code doesn't match. Check the text and try again." }, 400);
  }

  const now = new Date().toISOString();
  await adminRest(`phone_verifications?id=eq.${pending.id}`, { method: 'PATCH', body: { verified_at: now }, prefer: 'return=minimal' });
  await adminRest(`profile_private?id=eq.${user.id}&phone=eq.${encodeURIComponent(pending.phone)}`, {
    method: 'PATCH',
    body: { phone_verified_at: now },
    prefer: 'return=minimal',
  });
  return json({ verified: true });
});
