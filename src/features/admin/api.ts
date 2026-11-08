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

/** The numbers that say whether launch is working. */
export type LaunchMetrics = {
  members: number;
  /** North star: I'm Ins to events that happened in the last 7 days (nights out). */
  nights_out_7d: number;
  going_out_now: number;
  signups_28d: number;
  /** Of those, said I'm In to something within their first 7 days. */
  activated_28d: number;
  activation_pct: number | null;
  /** People who joined 4 to 5 weeks ago, and how many of them came back this week. */
  week4_cohort: number;
  week4_retained: number;
  week4_pct: number | null;
  avg_insiders: number | null;
  events_next_7d: number;
  open_reports: number;
};
export const fetchLaunchMetrics = async () => unwrap<LaunchMetrics>(await supabase.rpc('launch_metrics'));
export const fetchReports = async () => unwrap<AdminReport[]>(await supabase.rpc('admin_reports'));
export const actOnReport = async (id: number, action: 'resolve' | 'remove' | 'restore' | 'dismiss', note?: string) =>
  unwrap<null>(await supabase.rpc('admin_act_on_report', { p_report: id, p_action: action, p_note: note ?? undefined }));
/** Act on the member a report is about: warn, suspend for some days, or remove from the app. */
export const memberAction = async (reportId: number, action: 'warn' | 'suspend' | 'ban', days?: number) =>
  unwrap<null>(await supabase.rpc('admin_member_action', { p_report: reportId, p_action: action, p_days: days ?? undefined }));
/** Clear an automatic hold when the report didn't hold up. */
export const clearHold = async (userId: string) => unwrap<null>(await supabase.rpc('admin_clear_hold', { p_user: userId }));

type Dated = { at: string };
/** Everything saved about one report, plus both people's history. */
export type ReportEvidence = {
  saved: {
    met_in_person?: ({ until: string; place: string | null; context: string } & Dated)[];
    date_requests?: { from_id: string; status: string; starts_at: string | null; place_text: string | null; note: string | null; created_at: string }[];
    date_mode?: { status: string; activated_at: string | null; ended_at: string | null; last_problem: string | null; alerts: ({ who: 'reporter' | 'reported'; level: string } & Dated)[] }[];
    messages?: ({ from: 'reporter' | 'reported'; body: string } & Dated)[];
  };
  independent_reporters: number;
  serious_reports: number;
  past_actions: ({ action: string; note: string | null } & Dated)[];
  vouches_taken_back_90d: number;
  reporter_reports_made: number;
  reporter_reports_dismissed: number;
  reporter_was_reported: number;
};
export const fetchEvidence = async (reportId: number) => unwrap<ReportEvidence>(await supabase.rpc('admin_report_evidence', { p_report: reportId }));

/** Ask the reporter a follow-up question (they get it in My reports). */
export const askReporter = async (reportId: number, question: string) =>
  unwrap<null>(await supabase.rpc('admin_ask_reporter', { p_report: reportId, p_question: question }));

export type PoliceBasis = 'reporter_consent' | 'legal_process' | 'emergency';
export type PolicePacket = {
  report: { id: number; reason: string; filed_at: string; details: string; incident_when: string | null; incident_place: string | null; reporter: string | null; reported: string | null };
  basis: PoliceBasis;
  agency: string;
  case: string | null;
  messages: { from: 'reporter' | 'reported'; body: string; at: string }[];
  date_requests: { from_id: string; status: string; starts_at: string | null; place_text: string | null; note: string | null; created_at: string }[];
  met_in_person: { at: string; until: string; place: string | null; context: string }[] | null;
  date_mode: { status: string; activated_at: string | null; ended_at: string | null; last_problem: string | null; alerts: { who: string; level: string; at: string }[] }[] | null;
};
/** The records to give police for a report. Logged every time. */
export const policePacket = async (reportId: number, basis: PoliceBasis, agency: string, caseNumber?: string) =>
  unwrap<PolicePacket>(await supabase.rpc('admin_police_packet', { p_report: reportId, p_basis: basis, p_agency: agency, p_case: caseNumber || undefined }));

export type Takedown = Fn['admin_takedowns']['Returns'][number];
export const fetchTakedowns = async () => unwrap<Takedown[]>(await supabase.rpc('admin_takedowns'));
/** Remove for good: deletes the post or Out and its files (server function). */
export async function removeTakedown(id: number, note?: string) {
  const { data, error } = await supabase.functions.invoke<{ removed: boolean; files: number; file_errors: boolean }>('takedown', { body: { id, note } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json().catch(() => null);
    throw new Error(body?.error ?? 'Couldn’t remove it. Try again.');
  }
  return data;
}
export const declineTakedown = async (id: number, note: string) => unwrap<null>(await supabase.rpc('admin_takedown_decline', { p_id: id, p_note: note }));

export type Appeal = Fn['admin_appeals']['Returns'][number];
export const fetchAppeals = async () => unwrap<Appeal[]>(await supabase.rpc('admin_appeals'));
/** lift: account back to normal. Otherwise the decision stays. */
export const decideAppeal = async (id: number, lift: boolean) => unwrap<null>(await supabase.rpc('admin_decide_appeal', { p_appeal: id, p_lift: lift }));
export const fetchVerifications = async () => unwrap<AdminVerification[]>(await supabase.rpc('admin_verifications'));
export const reviewVerification = async (id: number, approve: boolean, note?: string) =>
  unwrap<null>(await supabase.rpc('admin_review_verification', { p_request: id, p_approve: approve, p_note: note ?? undefined }));
/** New profile photos from photo-verified members, waiting for a reviewer. */
export type PendingPhotoSet = Fn['admin_pending_photos']['Returns'][number];
export const fetchPendingPhotoSets = async () => unwrap<PendingPhotoSet[]>(await supabase.rpc('admin_pending_photos'));
export const reviewPhotoSet = async (userId: string, approve: boolean, note?: string) =>
  unwrap<null>(await supabase.rpc('admin_review_photos', { p_user: userId, p_approve: approve, p_note: note ?? undefined }));
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

export type UsageRow = { name: string; people_7d: number; events_7d: number; people_30d: number; events_30d: number };
/** How many people used each feature in the last 7 and 30 days. */
export const fetchUsage = async () => unwrap<UsageRow[]>(await supabase.rpc('admin_usage'));

export type RevenueRow = { month: string; tickets: number; gross_cents: number; fee_cents: number };
/** Ticket sales and I'm In's fees, by month (last 12). */
export const fetchRevenue = async () => unwrap<RevenueRow[]>(await supabase.rpc('admin_revenue'));
