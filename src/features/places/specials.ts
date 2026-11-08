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
