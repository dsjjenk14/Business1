import { supabase } from '@/lib/supabase';

export type FeaturedPlace = {
  placement_id: number;
  kind: 'featured' | 'sponsored';
  perk: string;
  perk_details: string;
  ends_at: string;
  venue_id: number;
  name: string;
  glyph: string | null;
  neighborhood: string | null;
  category: string | null;
  price_level: number | null;
  distance_mi: number | null;
  network_visited: number;
};

export type FeedPlacement = Pick<FeaturedPlace, 'placement_id' | 'kind' | 'perk' | 'venue_id' | 'name' | 'glyph' | 'neighborhood' | 'distance_mi' | 'network_visited'>;

export async function fetchFeaturedPlaces(lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc('featured_places', { p_lat: lat ?? undefined, p_lng: lng ?? undefined });
  if (error) throw error;
  return (data ?? []) as FeaturedPlace[];
}

export async function fetchFeedPlacement(lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc('feed_placement', { p_lat: lat ?? undefined, p_lng: lng ?? undefined });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as FeedPlacement | null;
}

export async function submitPartnerInquiry(input: { business: string; contact: string; email: string; phone?: string; address?: string; message?: string }) {
  const { error } = await supabase.rpc('submit_partner_inquiry', {
    p_business: input.business,
    p_contact: input.contact,
    p_email: input.email,
    p_phone: input.phone || undefined,
    p_address: input.address || undefined,
    p_message: input.message ?? '',
  });
  if (error) throw error;
}
