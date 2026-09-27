import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.');
}

// During static web rendering there is no window/localStorage.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Keep the session fresh only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns Supabase/Postgres errors into short, human messages. */
export function friendlyError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? '';
  if (/Invalid login credentials/i.test(message)) return "That email/phone and password don't match.";
  if (/already registered|already been registered/i.test(message)) return 'An account with that email already exists. Try logging in.';
  if (/Password should be at least/i.test(message)) return 'Password needs to be at least 8 characters.';
  if (/rate limit/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (/network|fetch/i.test(message)) return "Can't reach I'm In right now. Check your connection.";
  // Signup trigger messages are already written for humans.
  const dbMessage = message.match(/(You must be 18[^.]*\.|That invite code[^.]*\.|Date of birth is required\.|Full name is required\.)/);
  if (dbMessage?.[1]) return dbMessage[1];
  if (/Database error saving new user/i.test(message)) return "We couldn't create your account. Check your details and try again.";
  return message || 'Something went wrong. Try again.';
}
