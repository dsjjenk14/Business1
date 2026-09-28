import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FeedPin } from '@/features/pins/api';
import { supabase } from '@/lib/supabase';

export type HomeActivity = {
  kind: 'like' | 'reply';
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  /** Likes are grouped per pin: the second liker's name, and how many in all. */
  second_name: string | null;
  count: number;
  pin_id: number;
  pin_body: string;
  text: string | null;
  at: string;
};

export type HomeEvent = {
  id: number;
  title: string;
  emoji: string | null;
  starts_at: string;
  place: string | null;
  group_name: string | null;
  host_id: string;
  host_name: string;
  host_avatar: string | null;
  capacity: number | null;
  going_count: number;
  friends_going: number;
  i_am_going: boolean;
};

/** Home: your friends' pins, likes and replies you got, your group events, events friends are hosting. */
export type HomeFeed = {
  friend_count: number;
  pins: FeedPin[];
  activity: HomeActivity[];
  group_events: HomeEvent[];
  friends_hosting: HomeEvent[];
  /** For new members (few friends yet). Empty once you have friends. */
  everyone_pins: FeedPin[];
  suggested_groups: SuggestedGroup[];
  nearby_events: HomeEvent[];
};

export type SuggestedGroup = { id: number; name: string; emoji: string; category: string; join_type: 'open' | 'request'; members: number; schedule: string | null };

/** Everything Home shows, in one request. */
export async function fetchHomeFeed(loc?: { lat: number; lng: number } | null) {
  const { data, error } = await supabase.rpc('home_feed', { p_lat: loc?.lat ?? undefined, p_lng: loc?.lng ?? undefined });
  if (error) throw error;
  return data as unknown as HomeFeed;
}

// The last Home is kept on the phone so the app opens instantly, then refreshes.
const cacheKey = (userId: string) => `home:v2:${userId}`;

export async function readCachedHome(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as HomeFeed) : null;
  } catch {
    return null;
  }
}

export function cacheHome(userId: string, feed: HomeFeed) {
  AsyncStorage.setItem(cacheKey(userId), JSON.stringify(feed)).catch(() => undefined);
}

export async function shareEvent(eventId: number, note?: string) {
  const { data, error } = await supabase.rpc('share_event', { p_event: eventId, p_note: note ?? undefined });
  if (error) throw error;
  return data as number;
}
