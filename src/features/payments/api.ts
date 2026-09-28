import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PaymentAction = 'premium' | 'manage_premium' | 'ticket' | 'payouts_setup' | 'payouts_dashboard';

/**
 * Open Stripe for a payment or payout step. Card details only ever go to
 * Stripe. Resolves when the person comes back to the app (paid or not).
 * Throws with a readable message (e.g. "Payments aren't turned on yet.").
 */
/** Call the payments server function. Throws with its readable message. */
async function callPayments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payments', { body });
  if (error) {
    // The function answers with { error: "…" } and a non-2xx status.
    let message = 'Payments aren’t available right now.';
    try {
      const res = await (error as { context?: Response }).context?.json();
      if (res?.error) message = res.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return data as T;
}

export async function openPayment(action: PaymentAction, eventId?: number) {
  const data = await callPayments<{ url?: string }>({ action, event_id: eventId });
  const url = data?.url;
  if (!url) throw new Error('Payments aren’t available right now.');
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openAuthSessionAsync(url, 'imin://');
}

export type PayoutStatus = {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  fee_percent: number;
  sales: { tickets?: number; gross_cents?: number; fee_cents?: number; host_cents?: number };
};

export async function fetchPayoutStatus() {
  const { data, error } = await supabase.rpc('my_payout_status');
  if (error) throw error;
  return data as unknown as PayoutStatus;
}

export type MyTicket = { ticket_id: number; event_id: number; title: string; starts_at: string; place: string | null; amount_cents: number; status: string; bought_at: string };

export async function fetchMyTickets() {
  const { data, error } = await supabase.rpc('my_tickets');
  if (error) throw error;
  return (data ?? []) as MyTicket[];
}

export async function setTicketPrice(eventId: number, cents: number | null) {
  const { error } = await supabase.rpc('set_ticket_price', { p_event: eventId, p_cents: cents as number });
  if (error) throw error;
}

export const money = (cents: number | null | undefined) =>
  cents == null ? '' : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Parse "$25", "25.50" → cents; null if empty or not a price. */
export function parsePrice(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return text.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Ask Stripe whether payout setup is finished (right after the host comes back). */
export async function refreshPayouts() {
  return callPayments<{ charges_enabled: boolean }>({ action: 'payouts_refresh' });
}

export type TicketHolder = { ticket_id: number; user_id: string; display_name: string; amount_cents: number; status: string; bought_at: string };

export async function fetchTicketHolders(eventId: number) {
  const { data, error } = await supabase.rpc('event_ticket_holders', { p_event: eventId });
  if (error) throw error;
  return (data ?? []) as TicketHolder[];
}

/** Host only: refund a ticket in full. The guest is taken off the list and told. */
export async function refundTicket(ticketId: number) {
  await callPayments<{ refunded: boolean }>({ action: 'refund_ticket', ticket_id: ticketId });
}
