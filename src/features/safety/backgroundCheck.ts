import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type BackgroundCheckStatus = {
  /** Off until a background-check company is connected. */
  enabled: boolean;
  price_cents: number;
  premium_days: number;
  is_premium: boolean;
  /** Free because they've had Premium long enough. */
  free: boolean;
  /** When it becomes free for a newer Premium member. */
  free_on: string | null;
  /** Has the Background checked tag right now. */
  checked: boolean;
  checked_at: string | null;
  latest_status: 'awaiting_payment' | 'pending' | 'clear' | 'not_clear' | 'cancelled' | null;
  latest_at: string | null;
};

export async function fetchBackgroundCheck(): Promise<BackgroundCheckStatus> {
  const { data, error } = await supabase.rpc('background_check_status');
  if (error) throw error;
  return data as unknown as BackgroundCheckStatus;
}

/** Start a check after the member agrees. If it isn't free, opens Stripe for the fee. */
export async function startBackgroundCheck(): Promise<{ paid: boolean }> {
  const { data, error } = await supabase.rpc('start_background_check', { p_consent: true });
  if (error) throw error;
  const res = data as unknown as { check_id: number; needs_payment: boolean };
  if (!res.needs_payment) return { paid: false };
  const pay = await supabase.functions.invoke('payments', { body: { action: 'background_check' } });
  if (pay.error) {
    let message = 'Payments aren’t available right now.';
    try {
      const body = await (pay.error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  const url = (pay.data as { url?: string })?.url;
  if (!url) throw new Error('Payments aren’t available right now.');
  if (Platform.OS === 'web') window.location.assign(url);
  else await WebBrowser.openAuthSessionAsync(url, 'imin://');
  return { paid: true };
}
