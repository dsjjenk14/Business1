import { readBytes } from '@/lib/files';
import { supabase } from '@/lib/supabase';

/**
 * Split the bill: ask people for their share of something you paid for.
 * No money moves through I'm In. People pay you with Venmo, Cash App or
 * PayPal and tap "I paid"; you tap "Got it".
 */
export type ShareStatus = 'owed' | 'paid' | 'settled';

export type BillSummary = {
  id: number;
  title: string;
  created_at: string;
  is_mine: boolean;
  creator_name: string;
  canceled: boolean;
  my_amount_cents: number | null;
  my_status: ShareStatus | null;
  people: number;
  settled: number;
  outstanding_cents: number;
};

export type PayTo = { venmo: string | null; cashapp: string | null; paypal: string | null };

export type BillDetail = {
  id: number;
  title: string;
  total_cents: number;
  tip_cents: number;
  split: 'even' | 'custom';
  note: string | null;
  created_at: string;
  canceled: boolean;
  receipt_path: string | null;
  event: { id: number; title: string } | null;
  creator: { id: string; name: string; avatar_url: string | null };
  is_mine: boolean;
  creator_share_cents: number;
  shares: {
    user_id: string;
    name: string;
    avatar_url: string | null;
    amount_cents: number;
    status: ShareStatus;
    paid_at: string | null;
    settled_at: string | null;
    can_remind: boolean;
  }[];
  /** Where to pay the creator (only for people who owe them). */
  pay_to: PayTo | null;
};

export type BillPerson = { user_id: string; display_name: string; avatar_url: string | null; at_event: boolean };

/** "$12.50" */
export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "12.5", "$12.50", "12" → cents; null if it isn't an amount. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

/**
 * Split evenly in cents. Friends each get the same amount; any leftover cents
 * go to you (when you're in the split) or to the first friends.
 */
export function evenShares(grandCents: number, friendIds: string[], includeMe: boolean) {
  const n = friendIds.length + (includeMe ? 1 : 0);
  if (!n) return { shares: [] as { user_id: string; amount_cents: number }[], mine: grandCents };
  const base = Math.floor(grandCents / n);
  let extra = grandCents - base * n;
  const shares = friendIds.map((id) => {
    let amount = base;
    if (!includeMe && extra > 0) {
      amount += 1;
      extra -= 1;
    }
    return { user_id: id, amount_cents: amount };
  });
  const mine = grandCents - shares.reduce((a, s) => a + s.amount_cents, 0);
  return { shares, mine };
}

export async function fetchBillPeople(eventId?: number | null) {
  const { data, error } = await supabase.rpc('bill_people', { p_event: eventId ?? undefined });
  if (error) throw error;
  return (data ?? []) as BillPerson[];
}

export async function fetchMyBills() {
  const { data, error } = await supabase.rpc('my_bills');
  if (error) throw error;
  return (data ?? []) as unknown as BillSummary[];
}

export async function fetchBill(id: number) {
  const { data, error } = await supabase.rpc('bill_detail', { p_bill: id });
  if (error) throw error;
  return (data ?? null) as unknown as BillDetail | null;
}

/** A 5-minute link to the receipt photo (only people on the bill can get one). */
export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function createBill(input: {
  userId: string;
  title: string;
  totalCents: number;
  tipCents: number;
  split: 'even' | 'custom';
  shares: { user_id: string; amount_cents: number }[];
  receiptUri?: string | null;
  eventId?: number | null;
  note?: string;
}) {
  let receiptPath: string | undefined;
  if (input.receiptUri) {
    const { bytes, contentType } = await readBytes(input.receiptUri);
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    receiptPath = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const up = await supabase.storage.from('receipts').upload(receiptPath, bytes, { contentType });
    if (up.error) throw up.error;
  }
  const { data, error } = await supabase.rpc('create_bill', {
    p_title: input.title.trim(),
    p_total_cents: input.totalCents,
    p_tip_cents: input.tipCents,
    p_split: input.split,
    p_shares: input.shares,
    p_receipt_path: receiptPath,
    p_event: input.eventId ?? undefined,
    p_note: input.note?.trim() || undefined,
  });
  if (error) throw error;
  return data as number;
}

export async function markPaid(billId: number) {
  const { error } = await supabase.rpc('mark_bill_paid', { p_bill: billId });
  if (error) throw error;
}

export async function settleShare(billId: number, userId: string) {
  const { error } = await supabase.rpc('settle_bill_share', { p_bill: billId, p_user: userId });
  if (error) throw error;
}

export async function remind(billId: number, userId: string) {
  const { data, error } = await supabase.rpc('remind_bill', { p_bill: billId, p_user: userId });
  if (error) throw error;
  return !!data;
}

export async function cancelBill(billId: number) {
  const { error } = await supabase.rpc('cancel_bill', { p_bill: billId });
  if (error) throw error;
}

export async function fetchMyPayTo() {
  const { data, error } = await supabase.rpc('my_payment_handles');
  if (error) throw error;
  return data as unknown as PayTo;
}

export async function saveMyPayTo(p: { venmo: string; cashapp: string; paypal: string }) {
  const { error } = await supabase.rpc('set_payment_handles', { p_venmo: p.venmo, p_cashapp: p.cashapp, p_paypal: p.paypal });
  if (error) throw error;
}

/** Links that open each app with the amount filled in. */
export function payLinks(to: PayTo, cents: number, note: string) {
  const amount = (cents / 100).toFixed(2);
  const links: { key: 'venmo' | 'cashapp' | 'paypal'; label: string; url: string }[] = [];
  if (to.venmo) links.push({ key: 'venmo', label: 'Venmo', url: `https://venmo.com/${encodeURIComponent(to.venmo)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}` });
  if (to.cashapp) links.push({ key: 'cashapp', label: 'Cash App', url: `https://cash.app/$${encodeURIComponent(to.cashapp)}/${amount}` });
  if (to.paypal) links.push({ key: 'paypal', label: 'PayPal', url: `https://paypal.me/${encodeURIComponent(to.paypal)}/${amount}USD` });
  return links;
}
