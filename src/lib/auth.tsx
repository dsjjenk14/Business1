import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Tables } from '@/types/database';

import { supabase } from './supabase';

export type Profile = Tables<'profiles'>;

type AuthContextValue = {
  /** undefined while we're still checking storage for a saved session. */
  session: Session | null | undefined;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const fetchProfile = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data ?? null;
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    setProfile(await fetchProfile());
  }, [fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    fetchProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  // A signed-out user never has a profile, even for the moment before state catches up.
  const visibleProfile = userId && profile?.id === userId ? profile : null;
  const value = useMemo(
    () => ({ session, profile: visibleProfile, refreshProfile, signOut }),
    [session, visibleProfile, refreshProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
