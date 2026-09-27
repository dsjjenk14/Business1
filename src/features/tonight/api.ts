import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type TonightPerson = Database['public']['Functions']['tonight_network']['Returns'][number];
export type TonightPick = Database['public']['Functions']['tonight_pick']['Returns'][number];

export async function fetchTonightNetwork(): Promise<TonightPerson[]> {
  const { data, error } = await supabase.rpc('tonight_network');
  if (error) throw error;
  // Your circle first, then your network.
  return (data ?? []).sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.degree - b.degree || a.starts_at.localeCompare(b.starts_at));
}

export async function fetchTonightPick(): Promise<TonightPick | null> {
  const { data, error } = await supabase.rpc('tonight_pick');
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function endLive() {
  const { error } = await supabase.rpc('end_live');
  if (error) throw error;
}

export async function rsvp(eventId: number, userId: string) {
  const { error } = await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function cancelRsvp(eventId: number, userId: string) {
  const { error } = await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', userId);
  if (error) throw error;
}

export const VIBES: { key: string; label: string }[] = [
  { key: 'solo', label: 'Solo' },
  { key: 'small_group', label: 'Small group' },
  { key: 'drinks', label: '🍹 Drinks' },
  { key: 'dinner', label: '🍽️ Dinner' },
  { key: 'music', label: '🎵 Music' },
  { key: 'brunch', label: '🥂 Brunch' },
  { key: 'fitness', label: '🏋️ Fitness' },
  { key: 'outdoors', label: '🌿 Outdoors' },
];

export const vibeLabel = (key: string) => VIBES.find((v) => v.key === key)?.label.replace(/^\S+\s/, '') ?? key;

// ── Tonight / This Weekend feed ─────────────────────────────────────────────
export type GoingOutWhen = 'tonight' | 'weekend' | 'scheduled';

export type FeedPerson = {
  post_id: number;
  user_id: string;
  display_name: string;
  avatar_emoji: string | null;
  avatar_url: string | null;
  vouch_count: number;
  degree: number;
  is_me: boolean;
  place: string | null;
  neighborhood: string | null;
  venue_id: number | null;
  starts_at: string;
  when_kind: GoingOutWhen;
  vibes: string[];
  note: string | null;
  is_hosting: boolean;
  event_id: number | null;
  is_priority: boolean;
  distance_mi: number | null;
  lat: number | null;
  lng: number | null;
};

export type FeedEvent = {
  id: number;
  title: string;
  emoji: string | null;
  starts_at: string;
  ends_at: string | null;
  host_id: string;
  host_name: string;
  venue_id: number | null;
  venue_name: string | null;
  neighborhood: string | null;
  group_id: number | null;
  group_name: string | null;
  capacity: number | null;
  going_count: number;
  network_going: number;
  i_am_going: boolean;
  distance_mi: number | null;
  lat: number | null;
  lng: number | null;
};

export type GoingOutFeed = { radius_mi: number; people: FeedPerson[]; events: FeedEvent[] };

export async function fetchGoingOut(when: 'tonight' | 'weekend', args: { lat?: number | null; lng?: number | null; radiusMi: number }) {
  const { data, error } = await supabase.rpc('going_out_feed', {
    p_when: when,
    p_lat: args.lat ?? undefined,
    p_lng: args.lng ?? undefined,
    p_radius_mi: args.radiusMi,
  });
  if (error) throw error;
  return data as unknown as GoingOutFeed;
}

export type GroupEvent = {
  id: number;
  title: string;
  emoji: string | null;
  starts_at: string;
  group_id: number;
  group_name: string;
  venue_name: string | null;
  going_count: number;
  i_am_going: boolean;
};

export async function fetchMyGroupEvents() {
  const { data, error } = await supabase.rpc('my_group_events');
  if (error) throw error;
  return (data ?? []) as unknown as GroupEvent[];
}

export async function postGoingOut(input: {
  when: GoingOutWhen;
  startsAt?: Date | null;
  venueId?: number | null;
  place?: string;
  vibes: string[];
  note?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const { data, error } = await supabase.rpc('post_going_out', {
    p_when: input.when,
    p_starts_at: input.startsAt ? input.startsAt.toISOString() : undefined,
    p_venue_id: input.venueId ?? undefined,
    p_place: input.place || undefined,
    p_vibes: input.vibes,
    p_note: input.note || undefined,
    p_lat: input.lat ?? undefined,
    p_lng: input.lng ?? undefined,
  });
  if (error) throw error;
  return data as number;
}

export async function deleteGoingOut(postId: number) {
  const { error } = await supabase.rpc('delete_going_out', { p_post: postId });
  if (error) throw error;
}

// ── Venues ──────────────────────────────────────────────────────────────────
export type VenueHit = Database['public']['Functions']['search_venues']['Returns'][number];

export async function searchVenues(query: string, lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc('search_venues', { p_query: query, p_lat: lat ?? undefined, p_lng: lng ?? undefined });
  if (error) throw error;
  return data ?? [];
}

export type VenueDetail = {
  id: number;
  name: string;
  emoji: string | null;
  address: string | null;
  neighborhood: string | null;
  category: string | null;
  price_level: number | null;
  description: string;
  lat: number;
  lng: number;
  network_visited: number;
  events: { id: number; title: string; emoji: string | null; starts_at: string; host_name: string; going_count: number; capacity: number | null }[];
};

export async function fetchVenue(id: number) {
  const { data, error } = await supabase.rpc('venue_detail', { p_venue: id });
  if (error) throw error;
  return data as unknown as VenueDetail | null;
}
