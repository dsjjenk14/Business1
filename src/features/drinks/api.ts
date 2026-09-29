import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type DrinkItem = { key: string; name: string; cents: number; sort: number };
export type Wallet = {
  balance_cents: number;
  available_cents: number;
  lifetime_cents: number;
  host_share_pct: number;
  cashout_min_cents: number;
  payouts_ready: boolean;
  history: { id: number; drink: string; name: string; at: string; sent: boolean; cents: number; other: string | null }[];
};
/** Drink credit packs, in cents (the payments function accepts only these). */
export const DRINK_PACKS = [500, 1000, 2500, 5000, 10000];

export const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export async function fetchDrinkMenu(): Promise<DrinkItem[]> {
  const { data, error } = await supabase.from('drink_menu').select('key, name, cents, sort').order('sort');
  if (error) throw error;
  return data ?? [];
}

export async function fetchWallet(): Promise<Wallet> {
  const { data, error } = await supabase.rpc('my_wallet');
  if (error) throw error;
  return data as Wallet;
}

async function invoke<T>(fn: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = 'Something went wrong. Try again.';
    let code: string | null = null;
    try {
      const b = await (error as { context?: Response }).context?.json();
      if (b?.error) message = b.error;
      code = b?.code ?? null;
    } catch {
      // keep the default
    }
    throw Object.assign(new Error(message), { code });
  }
  return data as T;
}

/** Send a drink to whoever is live (a live video, or a virtual event's host). */
export const sendDrink = (drink: string, to: { liveId?: number; eventId?: number }) =>
  invoke<{ gift_id: number; drink: string; name: string; from_name: string; balance_cents: number }>('drinks', {
    drink,
    live_id: to.liveId,
    event_id: to.eventId,
  });

/** Pay for drink credit with a card (Stripe Checkout, in the browser). */
export async function buyDrinkCredit(cents: number) {
  const { url } = await invoke<{ url: string }>('payments', { action: 'drink_credit', cents });
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openAuthSessionAsync(url, 'imin://');
}
export const cashOutDrinks = () => invoke<{ cents: number }>('payments', { action: 'drink_cashout' });
