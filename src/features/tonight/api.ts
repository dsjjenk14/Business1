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

export async function goLive(input: { place?: string; vibes?: string[]; note?: string; lat?: number | null; lng?: number | null }) {
  const { error } = await supabase.rpc('go_live', {
    p_place: input.place || undefined,
    p_vibes: input.vibes ?? [],
    p_note: input.note || undefined,
    p_lat: input.lat ?? undefined,
    p_lng: input.lng ?? undefined,
  });
  if (error) throw error;
}

export async function endLive() {
  const { error } = await supabase.rpc('end_live');
  if (error) throw error;
}

export async function rsvp(eventId: number, userId: string) {
  const { error } = await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export const VIBES: { key: string; label: string }[] = [
  { key: 'solo', label: 'Solo' },
  { key: 'small_group', label: 'Small group' },
  { key: 'drinks', label: '🍹 Drinks' },
  { key: 'dinner', label: '🍽️ Dinner' },
  { key: 'music', label: '🎵 Music' },
];
