/**
 * Log in with phone number + password.
 *
 * Supabase's built-in phone login needs SMS for every sign-in. Instead, members
 * sign up with an email, and this function lets them use their phone number as
 * a username: it finds the account for that number on the server and signs in
 * with the password. The response is identical for "no such number" and
 * "wrong password", so it can't be used to discover who is a member.
 */
import { adminCount, adminRest, configNumber, corsHeaders, enc, json, passwordSignIn } from '../_shared/http.ts';

const FAIL = { error: 'Invalid login credentials' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let phone: unknown, password: unknown;
  try {
    ({ phone, password } = await req.json());
  } catch {
    return json(FAIL, 400);
  }
  if (typeof phone !== 'string' || !/^\+1\d{10}$/.test(phone) || typeof password !== 'string' || !password) return json(FAIL, 400);

  // Rate limit failed attempts per number (15-minute window).
  const maxFailures = await configNumber('phone_login_max_failures', 10);
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const failures = await adminCount('login_attempts', `phone=eq.${enc(phone)}&succeeded=eq.false&attempted_at=gte.${enc(since)}`);
  if (failures >= maxFailures) return json({ error: 'Too many tries. Wait a few minutes and try again.' }, 429);

  const { data: rows } = await adminRest<{ email: string | null }[]>(`profile_private?select=email&phone=eq.${enc(phone)}`);
  const email = rows?.[0]?.email;
  const tokens = email ? await passwordSignIn(email, password) : null;

  await adminRest('login_attempts', { method: 'POST', body: { phone, succeeded: !!tokens }, prefer: 'return=minimal' });
  if (!tokens) return json(FAIL, 401);
  return json(tokens);
});
