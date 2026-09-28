import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Fn = Database['public']['Functions'];
export type AdminReport = Fn['admin_reports']['Returns'][number];
export type AdminVerification = Fn['admin_verifications']['Returns'][number];
export type Overview = {
  members: number;
  founding_left: number;
  open_reports: number;
  pending_verifications: number;
  new_inquiries: number;
  active_placements: number;
  venues: number;
};

const unwrap = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export const fetchOverview = async () => unwrap<Overview>(await supabase.rpc('admin_overview'));
export const fetchReports = async () => unwrap<AdminReport[]>(await supabase.rpc('admin_reports'));
export const actOnReport = async (id: number, action: 'resolve' | 'remove' | 'restore' | 'dismiss', note?: string) =>
  unwrap<null>(await supabase.rpc('admin_act_on_report', { p_report: id, p_action: action, p_note: note ?? undefined }));
export const fetchVerifications = async () => unwrap<AdminVerification[]>(await supabase.rpc('admin_verifications'));
export const reviewVerification = async (id: number, approve: boolean, note?: string) =>
  unwrap<null>(await supabase.rpc('admin_review_verification', { p_request: id, p_approve: approve, p_note: note ?? undefined }));
export const grantPremium = async (email: string, days: number) =>
  unwrap<string>(await supabase.rpc('admin_grant_premium', { p_email: email, p_days: days }));

export async function signedSelfie(path: string) {
  const { data } = await supabase.storage.from('verifications').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export type AdminVenue = { id: number; name: string; emoji: string | null; neighborhood: string | null; address: string | null; category: string | null };
export type Placement = { id: number; venue_id: number; kind: 'featured' | 'sponsored'; perk: string; perk_details: string; starts_at: string; ends_at: string };
export type Inquiry = { id: number; business_name: string; contact_name: string; email: string; phone: string | null; address: string | null; message: string; status: string; created_at: string };

export async function fetchVenues() {
  const { data, error } = await supabase.from('venues').select('id, name, emoji, neighborhood, address, category').order('name');
  if (error) throw error;
  return (data ?? []) as AdminVenue[];
}

export async function addVenue(v: { name: string; glyph: string; address: string; neighborhood: string; category: string; description: string; price_level: number | null; lat: number; lng: number }) {
  const { error } = await supabase.from('venues').insert({
    name: v.name.trim(),
    emoji: v.glyph,
    address: v.address.trim() || null,
    neighborhood: v.neighborhood.trim() || null,
    category: v.category.trim() || null,
    description: v.description.trim(),
    price_level: v.price_level,
    location: `SRID=4326;POINT(${v.lng} ${v.lat})`,
  });
  if (error) throw error;
}

export async function fetchPlacements() {
  const { data, error } = await supabase.from('venue_placements').select('id, venue_id, kind, perk, perk_details, starts_at, ends_at').order('ends_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Placement[];
}

export async function addPlacement(p: Omit<Placement, 'id'>) {
  const { error } = await supabase.from('venue_placements').insert(p);
  if (error) throw error;
}

export async function endPlacement(id: number) {
  const { error } = await supabase.from('venue_placements').update({ ends_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function fetchInquiries() {
  const { data, error } = await supabase.from('partner_inquiries').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Inquiry[];
}

export async function setInquiryStatus(id: number, status: string) {
  const { error } = await supabase.from('partner_inquiries').update({ status }).eq('id', id);
  if (error) throw error;
}
