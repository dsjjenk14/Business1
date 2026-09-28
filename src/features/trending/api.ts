import type { HomeEvent } from '@/features/home/api';
import { supabase } from '@/lib/supabase';

export type HotSpot = { venue_id: number; name: string; glyph: string | null; neighborhood: string | null; people: number; friends: number; distance_mi: number | null };
export type WhatsIn = { hot_tonight: HotSpot[]; events: HomeEvent[] };

/** What's In: where people are tonight and the events picking up the most people. */
export async function fetchWhatsIn(lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc('whats_in', { p_lat: lat ?? undefined, p_lng: lng ?? undefined });
  if (error) throw error;
  return data as unknown as WhatsIn;
}
