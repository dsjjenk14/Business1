import type { GlyphName } from '@/components/ui/Glyph';
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

export const VIBES: { key: string; label: string; glyph: GlyphName }[] = [
  { key: 'solo', label: 'Solo', glyph: 'person' },
  { key: 'small_group', label: 'Small group', glyph: 'people' },
  { key: 'drinks', label: 'Drinks', glyph: 'drinks' },
  { key: 'dinner', label: 'Dinner', glyph: 'dinner' },
  { key: 'music', label: 'Music', glyph: 'music' },
  { key: 'brunch', label: 'Brunch', glyph: 'brunch' },
  { key: 'fitness', label: 'Fitness', glyph: 'fitness' },
  { key: 'outdoors', label: 'Outdoors', glyph: 'outdoors' },
];

export const vibeLabel = (key: string) => VIBES.find((v) => v.key === key)?.label ?? key;

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
  /** Set when they tapped "I'm In" at the place (only shown to the audience they chose). */
  here_since: string | null;
  /** Your own post only: when "Here now" lapses unless you tap "Still here". */
  live_until: string | null;
  /** Your own post only: who sees that you're there ("circle" = 1st degree, "network" = 1st + 2nd, "custom" = people you picked). */
  here_audience: 'circle' | 'network' | 'custom' | null;
  open_to_join: boolean;
  heading_count: number;
  joined_here_count: number;
  my_join: 'heading' | 'here' | null;
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
  placement: { kind: 'featured' | 'sponsored'; perk: string; perk_details: string; ends_at: string } | null;
  events: { id: number; title: string; emoji: string | null; starts_at: string; host_name: string; going_count: number; capacity: number | null }[];
  /** From people who went to events here. */
  rating: { avg: number | null; count: number } | null;
  reviews: { name: string; stars: number; note: string; at: string }[];
};

export async function fetchVenue(id: number) {
  const { data, error } = await supabase.rpc('venue_detail', { p_venue: id });
  if (error) throw error;
  return data as unknown as VenueDetail | null;
}

// ── I'm In tonight (live) ──────────────────────────────────────────────────────────
export async function imHere(coords?: { lat: number; lng: number } | null) {
  const { data, error } = await supabase.rpc('im_here', { p_lat: coords?.lat ?? undefined, p_lng: coords?.lng ?? undefined });
  if (error) throw error;
  return data as string;
}

export async function joinGoingOut(postId: number, status: 'heading' | 'here' | null) {
  // null cancels (sent as SQL null; leaving it out would mean the default, 'heading').
  const { error } = await supabase.rpc('join_going_out', { p_post: postId, p_status: status as 'heading' });
  if (error) throw error;
}

/** Who sees a plan and where you're going: everyone nearby, 1st + 2nd degree, or 1st degree only. */
export type PlanAudience = 'everyone' | 'network' | 'circle';

export async function setPlanAudience(postId: number, audience: PlanAudience) {
  const { error } = await supabase.rpc('set_plan_audience', { p_post: postId, p_audience: audience });
  if (error) throw error;
}

export async function setHereAudience(postId: number, audience: 'circle' | 'network') {
  const { error } = await supabase.rpc('set_here_audience', { p_post: postId, p_audience: audience });
  if (error) throw error;
}

export async function setOpenToJoin(postId: number, open: boolean) {
  const { error } = await supabase.rpc('set_open_to_join', { p_post: postId, p_open: open });
  if (error) throw error;
}

export type Company = { user_id: string; display_name: string; avatar_url: string | null; status: 'heading' | 'here'; updated_at: string };

export async function fetchCompany(postId: number) {
  const { data, error } = await supabase.rpc('my_going_out_company', { p_post: postId });
  if (error) throw error;
  return (data ?? []) as Company[];
}

/** Show that you're there to only these friends. */
export async function setHereViewers(postId: number, viewers: string[]) {
  const { data, error } = await supabase.rpc('set_here_viewers', { p_post: postId, p_viewers: viewers });
  if (error) throw error;
  return data as number;
}

export async function fetchHereViewers(postId: number) {
  const { data, error } = await supabase.rpc('here_viewers', { p_post: postId });
  if (error) throw error;
  return (data ?? []) as string[];
}
