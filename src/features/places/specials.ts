import { supabase } from '@/lib/supabase';

/** Tonight's special from a partner place. It runs until tonight ends (4 AM). */
export type Special = {
  id: number;
  venue_id: number;
  venue_name: string;
  neighborhood: string | null;
  title: string;
  details: string | null;
  ends_at: string;
  can_manage: boolean;
};

/** For one place, or every partner place with no id. */
export async function fetchSpecials(venueId?: number) {
  const { data, error } = await supabase.rpc('specials_tonight', venueId ? { p_venue: venueId } : {});
  if (error) throw error;
  return (data ?? []) as Special[];
}

/** Whether you manage this partner place and can post its special. */
export async function canPostSpecial(venueId: number) {
  const { data, error } = await supabase.rpc('can_post_special', { p_venue: venueId });
  if (error) throw error;
  return !!data;
}

export async function postSpecial(venueId: number, title: string, details: string) {
  const { error } = await supabase.rpc('post_venue_special', { p_venue: venueId, p_title: title.trim(), p_details: details.trim() });
  if (error) throw error;
}

/** Admin: let a member (by email) post specials for a place. */
export async function setVenueManager(venueId: number, email: string) {
  const { error } = await supabase.rpc('admin_set_venue_manager', { p_venue: venueId, p_email: email.trim() });
  if (error) throw error;
}

// ── Claim your place ──────────────────────────────────────────────────────
export type PlaceClaim = {
  id: number;
  business_name: string;
  venue_id: number | null;
  venue_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'canceled';
  free_months: number;
  created_at: string;
};

export async function fetchMyPlaceClaim() {
  const { data, error } = await supabase.rpc('my_place_claim');
  if (error) throw error;
  return ((data ?? []) as PlaceClaim[])[0] ?? null;
}

export async function claimPlace(input: { venueId: number | null; business: string; address: string; contact: string; phone: string; perk: string; perkDetails: string }) {
  const { error } = await supabase.rpc('claim_place', {
    p_venue: input.venueId as number,
    p_business: input.business.trim(),
    p_address: input.address.trim(),
    p_contact: input.contact.trim(),
    p_phone: input.phone.trim(),
    p_perk: input.perk.trim(),
    p_perk_details: input.perkDetails.trim(),
  });
  if (error) throw error;
}

/** Admin: claims waiting for a check. */
export type ClaimForReview = {
  id: number;
  business_name: string;
  address: string | null;
  contact_name: string;
  phone: string | null;
  perk: string;
  venue_id: number | null;
  status: string;
  created_at: string;
};

export async function fetchPendingClaims() {
  const { data, error } = await supabase
    .from('venue_claims')
    .select('id, business_name, address, contact_name, phone, perk, venue_id, status, created_at')
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ClaimForReview[];
}

export async function reviewClaim(claimId: number, approve: boolean, venueId?: number | null) {
  const { error } = await supabase.rpc('admin_review_claim', { p_claim: claimId, p_approve: approve, p_venue: venueId ?? undefined });
  if (error) throw error;
}

/** Admin: make a member a verified host (their vouches count double), or undo it. */
export async function setVerifiedHost(email: string, on: boolean) {
  const { error } = await supabase.rpc('admin_set_verified_host', { p_email: email.trim(), p_on: on });
  if (error) throw error;
}
