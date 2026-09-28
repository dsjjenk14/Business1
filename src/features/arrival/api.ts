import { supabase } from '@/lib/supabase';

export type Arrival = { kind: 'event' | 'place'; id: number; title: string; place: string | null };
export type ArrivalRegion = { key: string; title: string; lat: number; lng: number; radius_m: number };

/** How many upcoming plans the phone should watch for arrival (0 = don't read GPS at all). */
export async function arrivalTargets() {
  const { data, error } = await supabase.rpc('arrival_targets');
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Send a GPS reading; the server marks you there at any plan you're standing at. */
export async function autoArrive(coords: { lat: number; lng: number; accuracy: number | null }) {
  const { data, error } = await supabase.rpc('auto_arrive', {
    p_lat: coords.lat,
    p_lng: coords.lng,
    p_accuracy_m: coords.accuracy ?? undefined,
  });
  if (error) throw error;
  return (data as unknown as Arrival[]) ?? [];
}

/** The places to watch while the app is closed (App Store build only). */
export async function fetchArrivalRegions() {
  const { data, error } = await supabase.rpc('arrival_regions');
  if (error) throw error;
  return (data ?? []) as ArrivalRegion[];
}
