import { supabase } from '@/lib/supabase';

/** A place from the map search (OpenStreetMap). `area` = a neighborhood or town, not a venue. */
export type MapPlace = {
  osm_id: string;
  name: string;
  kind: 'place' | 'area';
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  lat: number;
  lng: number;
  distance_mi: number | null;
};

/** Places near you that match what you typed. Empty if the search is unavailable. */
export async function searchPlaces(q: string, lat?: number | null, lng?: number | null): Promise<MapPlace[]> {
  const { data, error } = await supabase.functions.invoke('place-search', { body: { q, lat: lat ?? undefined, lng: lng ?? undefined } });
  if (error) return [];
  return ((data as { places?: MapPlace[] })?.places ?? []) as MapPlace[];
}

/** Turn a picked map place into a venue (made once, then reused), so events and ratings link to it. */
export async function venueFromPlace(p: MapPlace) {
  const { data, error } = await supabase.rpc('venue_from_place', {
    p_osm: p.osm_id,
    p_name: p.name,
    p_lat: p.lat,
    p_lng: p.lng,
    p_address: p.address ?? undefined,
    p_neighborhood: p.neighborhood ?? p.city ?? undefined,
    p_category: p.category ?? undefined,
  });
  if (error) throw error;
  return data as number;
}
