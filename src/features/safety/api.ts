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
