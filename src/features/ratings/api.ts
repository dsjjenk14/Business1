import { supabase } from '@/lib/supabase';

export type EventRating = { can_rate: boolean; venue_id: number | null; venue_name: string | null; my_stars: number | null; my_note: string | null };
export type PlaceToRate = { event_id: number; title: string; starts_at: string; venue_id: number; venue_name: string };
export type TopVenue = {
  venue_id: number;
  name: string;
  glyph: string | null;
  neighborhood: string | null;
  category: string | null;
  avg_stars: number;
  ratings: number;
  distance_mi: number | null;
};

export async function fetchEventRating(eventId: number) {
  const { data, error } = await supabase.rpc('event_rating', { p_event: eventId });
  if (error) throw error;
  return data as unknown as EventRating | null;
}

/** Rate the place an event was at (1–5 stars, optional note). Rating again updates it. */
export async function rateVenue(eventId: number, stars: number, note?: string) {
  const { error } = await supabase.rpc('rate_venue', { p_event: eventId, p_stars: stars, p_note: note?.trim() || undefined });
  if (error) throw error;
}

export async function fetchPlacesToRate() {
  const { data, error } = await supabase.rpc('places_to_rate');
  if (error) throw error;
  return (data ?? []) as PlaceToRate[];
}

export async function fetchTopVenues(lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc('top_venues', { p_lat: lat ?? undefined, p_lng: lng ?? undefined });
  if (error) throw error;
  return (data ?? []) as TopVenue[];
}
