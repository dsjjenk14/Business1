import { supabase } from '@/lib/supabase';

import { normalizeUSPhone } from './phone';

/**
 * Log in with an email OR a phone number, plus password.
 * Phone logins go through the `auth-phone-login` Edge Function, which finds the
 * account for that number server-side (so phone numbers are never exposed).
 */
export async function signInWithEmailOrPhone(identifier: string, password: string) {
  const value = identifier.trim();

  if (value.includes('@')) {
    const { error } = await supabase.auth.signInWithPassword({ email: value.toLowerCase(), password });
    if (error) throw error;
    return;
  }

  const phone = normalizeUSPhone(value);
  if (!phone) throw new Error('Enter a valid email or a 10-digit US phone number.');

  const { data, error } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>('auth-phone-login', {
    body: { phone, password },
  });
  if (error || !data?.access_token) throw new Error('Invalid login credentials');
  const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (sessionError) throw sessionError;
}
