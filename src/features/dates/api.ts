import type { GlyphName } from '@/components/ui/Glyph';
import { supabase } from '@/lib/supabase';

export type DateWhen = 'tonight' | 'this_weekend' | 'next_week' | 'specific';
export type DateStatus = 'pending' | 'accepted' | 'countered' | 'passed' | 'cancelled';

export const DATE_WHEN: { key: Exclude<DateWhen, 'specific'>; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'this_weekend', label: 'This weekend' },
  { key: 'next_week', label: 'Next week' },
];

export const DATE_VIBES: { key: string; label: string; glyph: GlyphName }[] = [
  { key: 'drinks', label: 'Drinks', glyph: 'drinks' },
  { key: 'dinner', label: 'Dinner', glyph: 'dinner' },
  { key: 'coffee', label: 'Coffee', glyph: 'coffee' },
  { key: 'walk', label: 'Walk', glyph: 'route' },
  { key: 'music', label: 'Music', glyph: 'music' },
  { key: 'brunch', label: 'Brunch', glyph: 'brunch' },
  { key: 'activity', label: 'Activity', glyph: 'paddle' },
];

export const dateVibe = (key: string | null) => DATE_VIBES.find((v) => v.key === key) ?? null;

export type DateRequestInput = {
  when: DateWhen;
  startsAt?: Date | null;
  vibe?: string | null;
  venueId?: number | null;
  place?: string;
  note?: string;
};

const args = (i: DateRequestInput) => ({
  p_when: i.when,
  p_starts_at: i.startsAt ? i.startsAt.toISOString() : undefined,
  p_vibe: i.vibe ?? undefined,
  p_venue_id: i.venueId ?? undefined,
  p_place: i.place?.trim() || undefined,
  p_note: i.note?.trim() || undefined,
});

export async function sendDateRequest(to: string, input: DateRequestInput) {
  const { data, error } = await supabase.rpc('send_date_request', { p_to: to, ...args(input) });
  if (error) throw error;
  return data as number;
}

export async function counterDateRequest(requestId: number, input: DateRequestInput) {
  const { data, error } = await supabase.rpc('counter_date_request', { p_request: requestId, ...args(input) });
  if (error) throw error;
  return data as number;
}

export async function respondDateRequest(requestId: number, accept: boolean) {
  const { data, error } = await supabase.rpc('respond_date_request', { p_request: requestId, p_accept: accept });
  if (error) throw error;
  return data as 'accepted' | 'passed';
}

export async function cancelDateRequest(requestId: number) {
  const { error } = await supabase.rpc('cancel_date_request', { p_request: requestId });
  if (error) throw error;
}

export type DateDetail = {
  id: number;
  when_kind: DateWhen;
  starts_at: string | null;
  vibe: string | null;
  note: string | null;
  place: string | null;
  venue_id: number | null;
  neighborhood: string | null;
  status: DateStatus;
  created_at: string;
  responded_at: string | null;
  parent_id: number | null;
  label: string;
  i_sent: boolean;
  counter_id: number | null;
  other: { id: string; display_name: string; avatar_url: string | null; vouch_count: number; degree: number | null; via: string | null };
  conversation_id: number | null;
};

export async function fetchDate(id: number) {
  const { data, error } = await supabase.rpc('date_request_detail', { p_request: id });
  if (error) throw error;
  return data as unknown as DateDetail | null;
}

export type MyDate = { id: number; other_id: string; other_name: string; other_avatar_url: string | null; i_sent: boolean; status: DateStatus; label: string; vibe: string | null; created_at: string };

export async function fetchMyDates() {
  const { data, error } = await supabase.rpc('my_dates');
  if (error) throw error;
  return (data ?? []) as MyDate[];
}

// ── Date Mode ───────────────────────────────────────────────────────────────
export type DateModeStatus = {
  id: number;
  status: 'waiting' | 'active';
  i_started: boolean;
  problem: string | null;
  distance_mi: number | null;
  activated_at: string | null;
  checkin_minutes: number;
  next_checkin_at: string | null;
  partner: { id: string; display_name: string; avatar_url: string | null; vouch_count: number };
  date_label: string | null;
  contacts: number;
};

export async function fetchDateMode() {
  const { data, error } = await supabase.rpc('date_mode_status');
  if (error) throw error;
  return data as unknown as DateModeStatus | null;
}

export type DateModeCandidate = { user_id: string; display_name: string; avatar_url: string | null; vouch_count: number; detail: string };

export async function fetchDateModeCandidates() {
  const { data, error } = await supabase.rpc('date_mode_candidates');
  if (error) throw error;
  return (data ?? []) as DateModeCandidate[];
}

type Reading = { lat: number; lng: number; accuracy: number | null };

export async function startDateMode(partner: string, r: Reading) {
  const { error } = await supabase.rpc('start_date_mode', { p_partner: partner, p_lat: r.lat, p_lng: r.lng, p_accuracy_m: r.accuracy ?? undefined });
  if (error) throw error;
}

export async function confirmDateMode(sessionId: number, r: Reading) {
  const { error } = await supabase.rpc('confirm_date_mode', { p_session: sessionId, p_lat: r.lat, p_lng: r.lng, p_accuracy_m: r.accuracy ?? undefined });
  if (error) throw error;
}

export async function checkInSafe() {
  const { error } = await supabase.rpc('safety_check_in');
  if (error) throw error;
}

export async function setCheckinInterval(minutes: number) {
  const { error } = await supabase.rpc('set_checkin_interval', { p_minutes: minutes });
  if (error) throw error;
}

export async function endDateMode() {
  const { error } = await supabase.rpc('end_date_mode');
  if (error) throw error;
}
