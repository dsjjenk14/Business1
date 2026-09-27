import { useEffect, useState } from 'react';

import { useAppConfig } from '@/config/useAppConfig';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** The signed-in member's plan and its limits (from the plan_limits config table). */
export function usePlan() {
  const { session } = useAuth();
  const { planLimits } = useAppConfig();
  const userId = session?.user.id;
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('entitlements')
      .select('premium_until')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setPremiumUntil(data?.premium_until ?? null));
  }, [userId]);

  const isPremium = !!premiumUntil && new Date(premiumUntil) > new Date();
  /** Limit for this member; null = unlimited. */
  const limit = (key: string): number | null => {
    const row = planLimits[key];
    if (!row) return null;
    return isPremium ? row.premium : row.free;
  };
  /** The same limit on Premium, for "Premium unlocks…" hints. */
  const premiumLimit = (key: string): number | null => planLimits[key]?.premium ?? null;

  return { isPremium, limit, premiumLimit };
}
