import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Tier = Tables<'vouch_tiers'>;
export type City = Pick<Tables<'cities'>, 'id' | 'slug' | 'name' | 'region'>;

type AppConfig = {
  tiers: Tier[];
  planLimits: Record<string, { free: number | null; premium: number | null }>;
  cities: City[];
  settings: Record<string, unknown>;
  loaded: boolean;
};

const empty: AppConfig = { tiers: [], planLimits: {}, cities: [], settings: {}, loaded: false };
const ConfigContext = createContext<AppConfig>(empty);

/**
 * Loads the founder-editable config tables once at startup:
 * tiers, plan limits, launch cities, and app settings.
 */
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(empty);

  useEffect(() => {
    Promise.all([
      supabase.from('vouch_tiers').select('*').order('min_vouches'),
      supabase.from('plan_limits').select('*'),
      supabase.from('cities').select('id, slug, name, region').eq('active', true).order('sort'),
      supabase.from('app_config').select('key, value'),
    ]).then(([tiers, limits, cities, settings]) => {
      setConfig({
        tiers: tiers.data ?? [],
        planLimits: Object.fromEntries((limits.data ?? []).map((l) => [l.key, { free: l.free_value, premium: l.premium_value }])),
        cities: cities.data ?? [],
        settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])),
        loaded: true,
      });
    });
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useAppConfig() {
  return useContext(ConfigContext);
}

/** Current tier, next tier, and how many more vouches to reach it. */
export function tierProgress(vouchCount: number, tiers: Tier[]) {
  const sorted = [...tiers].sort((a, b) => a.min_vouches - b.min_vouches);
  const current = [...sorted].reverse().find((tier) => vouchCount >= tier.min_vouches) ?? sorted[0] ?? null;
  const next = sorted.find((tier) => tier.min_vouches > vouchCount) ?? null;
  return { current, next, remaining: next ? next.min_vouches - vouchCount : 0 };
}

/**
 * Launch mode: features that stay off until they're turned on in app_config
 * (live video, drinks, online events). Off while config is still loading.
 */
export type FeatureKey = 'live_video_enabled' | 'drinks_enabled' | 'virtual_events_enabled';
export function useFeature(key: FeatureKey) {
  const { settings } = useContext(ConfigContext);
  return settings[key] === true || settings[key] === 'true';
}
