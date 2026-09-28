import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FeedPin } from '@/features/pins/api';
import type { FeedPlacement } from '@/features/places/api';
import type { DateModeStatus } from '@/features/dates/api';
import { supabase } from '@/lib/supabase';

export type HomeScope = 'friends' | 'everyone';

export type HomePerson = { id: string; display_name: string; avatar_url: string | null; kind: 'in' | 'out' | 'posted'; place: string | null };
export type HomeLive = { id: string; display_name: string; avatar_url: string | null; place: string; since: string; circle_there: number };
export type HomeEvent = {
  id: number;
  title: string;
  emoji: string | null;
  starts_at: string;
  venue_name: string | null;
  circle_going: number;
  going_count: number;
  i_am_going: boolean;
};
export type HomeConnection = { id: string; display_name: string; avatar_url: string | null; since: string; source: string };

export type HomeFeed = {
  circle_count: number;
  me: { out_tonight: boolean; in_now: boolean };
  people: HomePerson[];
  live: HomeLive[];
  events: HomeEvent[];
  new_connections: HomeConnection[];
  pins: FeedPin[];
  placement: FeedPlacement | null;
  date_mode: DateModeStatus | null;
  dates_waiting: number;
};

/** Everything Home shows, in one request. */
export async function fetchHomeFeed(scope: HomeScope, loc?: { lat: number; lng: number } | null) {
  const { data, error } = await supabase.rpc('home_feed', { p_scope: scope, p_lat: loc?.lat ?? undefined, p_lng: loc?.lng ?? undefined });
  if (error) throw error;
  return data as unknown as HomeFeed;
}

// The last Home is kept on the phone so the app opens instantly, then refreshes.
const cacheKey = (userId: string, scope: HomeScope) => `home:${userId}:${scope}`;

export async function readCachedHome(userId: string, scope: HomeScope) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, scope));
    return raw ? (JSON.parse(raw) as HomeFeed) : null;
  } catch {
    return null;
  }
}

export function cacheHome(userId: string, scope: HomeScope, feed: HomeFeed) {
  AsyncStorage.setItem(cacheKey(userId, scope), JSON.stringify(feed)).catch(() => undefined);
}

export async function readScope(): Promise<HomeScope> {
  try {
    return (await AsyncStorage.getItem('home:scope')) === 'everyone' ? 'everyone' : 'friends';
  } catch {
    return 'friends';
  }
}
export const saveScope = (s: HomeScope) => AsyncStorage.setItem('home:scope', s).catch(() => undefined);

export async function shareEvent(eventId: number, note?: string) {
  const { data, error } = await supabase.rpc('share_event', { p_event: eventId, p_note: note ?? undefined });
  if (error) throw error;
  return data as number;
}
