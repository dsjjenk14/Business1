import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Ghost mode: hides you from everything that shows you're out or where
 * (Tonight, rings, "out tonight", What's In counts, going-out pins) until you
 * turn it off. The server enforces it; this just reads and flips the switch.
 */
export function useGhostMode() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [ghost, setGhost] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase
      .from('user_settings')
      .select('ghost_mode')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => alive && setGhost(data?.ghost_mode ?? false));
    return () => {
      alive = false;
    };
  }, [userId]);

  const set = useCallback(
    async (on: boolean) => {
      if (!userId) return false;
      const before = ghost;
      setGhost(on);
      const { error } = await supabase.from('user_settings').update({ ghost_mode: on }).eq('user_id', userId);
      if (error) {
        setGhost(before);
        return false;
      }
      return true;
    },
    [userId, ghost],
  );

  return { ghost, setGhost: set };
}

/** Vouches needed to see people out who aren't your Insiders (matches the server). */
export const SAFETY_MIN_VOUCHES = 2;
