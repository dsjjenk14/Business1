import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type ReportReason = Database['public']['Enums']['report_reason'];
export type MyReport = Database['public']['Functions']['my_reports']['Returns'][number];
export type BlockedMember = Database['public']['Functions']['my_blocked']['Returns'][number];

export const REPORT_REASONS: { key: ReportReason; label: string; detail: string }[] = [
  { key: 'harassment', label: 'Harassment', detail: 'Unwanted contact, threats, or bullying' },
  { key: 'unsafe', label: 'Made me feel unsafe', detail: 'Predatory or aggressive behavior' },
  { key: 'inappropriate', label: 'Inappropriate content', detail: 'Sexual, hateful, or violent content' },
  { key: 'misrepresentation', label: 'Fake or misleading', detail: "Photos or info didn't match, or impersonation" },
  { key: 'privacy', label: 'Privacy violation', detail: 'Shared my info without consent' },
  { key: 'spam', label: 'Spam or scam', detail: 'Selling, scams, or repetitive posts' },
  { key: 'other', label: 'Something else', detail: 'Tell us in the details' },
];

export async function report(input: { reason: ReportReason; details?: string; userId?: string; pinId?: number; replyId?: number; messageId?: number }) {
  const { error } = await supabase.rpc('report', {
    p_reason: input.reason,
    p_details: input.details ?? '',
    p_user: input.userId,
    p_pin: input.pinId,
    p_reply: input.replyId,
    p_message: input.messageId,
  });
  if (error) throw error;
}

export async function blockUser(userId: string) {
  const { error } = await supabase.rpc('block_user', { p_user: userId });
  if (error) throw error;
}
export async function unblockUser(userId: string) {
  const { error } = await supabase.rpc('unblock_user', { p_user: userId });
  if (error) throw error;
}
export async function fetchBlocked(): Promise<BlockedMember[]> {
  const { data, error } = await supabase.rpc('my_blocked');
  if (error) throw error;
  return data ?? [];
}
export async function fetchMyReports(): Promise<MyReport[]> {
  const { data, error } = await supabase.rpc('my_reports');
  if (error) throw error;
  return data ?? [];
}

export async function deleteMyAccount() {
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean; error?: string }>('delete-account', { body: { confirm: 'DELETE' } });
  if (error || !data?.deleted) {
    const context = (error as { context?: Response } | null)?.context;
    const parsed = context ? await context.json().catch(() => null) : null;
    throw new Error(parsed?.error ?? data?.error ?? "We couldn't delete your account right now. Try again, or contact support.");
  }
}

// ── Trusted contacts ────────────────────────────────────────────────────────
export type TrustedContact = { id: number; name: string; phone: string };

export async function fetchTrustedContacts() {
  const { data, error } = await supabase.from('trusted_contacts').select('id, name, phone').order('id');
  if (error) throw error;
  return (data ?? []) as TrustedContact[];
}

/** "(202) 555-0102", "202-555-0102", "+1 202 555 0102" → "+12025550102" (US numbers without a country code get +1). */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const bare = digits.replace(/\D/g, '');
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`;
  return null;
}

export async function addTrustedContact(userId: string, name: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Enter a full phone number, like (202) 555-0102.');
  const { error } = await supabase.from('trusted_contacts').insert({ user_id: userId, name: name.trim(), phone: normalized });
  if (error) throw error;
}

export async function removeTrustedContact(id: number) {
  const { error } = await supabase.from('trusted_contacts').delete().eq('id', id);
  if (error) throw error;
}

// ── "I need help" ───────────────────────────────────────────────────────────
export type SafetyLevel = 'unsafe' | 'leaving' | 'emergency';
export type AlertInfo = { alert_id: number; name: string; with: string | null; contacts: { name: string; phone: string }[] };

export async function raiseSafetyAlert(level: SafetyLevel, coords?: { lat: number; lng: number } | null) {
  const { data, error } = await supabase.rpc('raise_safety_alert', { p_level: level, p_lat: coords?.lat ?? undefined, p_lng: coords?.lng ?? undefined });
  if (error) throw error;
  return data as unknown as AlertInfo;
}

export async function resolveSafetyAlert() {
  const { error } = await supabase.rpc('resolve_safety_alert');
  if (error) throw error;
}

export async function markContactsNotified(alertId: number, count: number) {
  await supabase.rpc('mark_contacts_notified', { p_alert: alertId, p_count: count });
}

/** The text sent to trusted contacts. */
export function alertMessage(level: SafetyLevel, info: AlertInfo, coords?: { lat: number; lng: number } | null) {
  const where = coords ? ` My location: https://maps.google.com/?q=${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : '';
  const withWho = info.with ? ` I'm with ${info.with} (from I'm In).` : '';
  if (level === 'emergency') return `EMERGENCY from ${info.name}: I need help now. Please call me, and call 911 if you can't reach me.${withWho}${where}`;
  if (level === 'leaving') return `${info.name} here: I'm leaving a situation that doesn't feel safe. Please stay by your phone.${withWho}${where}`;
  return `${info.name} here: I don't feel safe right now. Please check on me.${withWho}${where}`;
}

// ── Hide and mute ────────────────────────────────────────────────────────────
export type PersonPrivacy = { blocked: boolean; muted: boolean; hidden: boolean };
export type HiddenOrMuted = { user_id: string; display_name: string; avatar_url: string | null; hidden: boolean; muted: boolean };

/** What you've set for one person. */
export async function fetchPersonPrivacy(userId: string) {
  const { data, error } = await supabase.rpc('person_privacy', { p_user: userId });
  if (error) throw error;
  return data as unknown as PersonPrivacy;
}

/** Mute: you stop seeing their pins, My Out and plans. They aren't told. */
export async function setMuted(userId: string, on: boolean) {
  const { error } = await supabase.rpc('set_muted', { p_user: userId, p_on: on });
  if (error) throw error;
}

/** Hide my posts from them: they stop seeing your pins, My Out and plans. They aren't told. */
export async function setHiddenFrom(userId: string, on: boolean) {
  const { error } = await supabase.rpc('set_hidden_from', { p_user: userId, p_on: on });
  if (error) throw error;
}

export async function fetchHiddenAndMuted() {
  const { data, error } = await supabase.rpc('my_hidden_and_muted');
  if (error) throw error;
  return (data ?? []) as HiddenOrMuted[];
}

/** Hide one pin from chosen people. */
export async function setPinHiddenFrom(pinId: number, userIds: string[]) {
  const { error } = await supabase.rpc('set_pin_hidden_from', { p_pin: pinId, p_users: userIds });
  if (error) throw error;
}
