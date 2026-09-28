import { supabase } from '@/lib/supabase';

export type MyPlan = {
  is_premium: boolean;
  premium_until: string | null;
  source: string | null;
  is_founding_member: boolean;
  member_number: number | null;
  /** Paying monthly through Stripe (including a trial that bills later). */
  subscribed?: boolean;
};

export async function fetchMyPlan() {
  const { data, error } = await supabase.rpc('my_plan');
  if (error) throw error;
  return data as unknown as MyPlan;
}

export type Analytics =
  | { locked: true }
  | {
      locked: false;
      views_7d: number;
      views_30d: number;
      viewers_circle_30d: number;
      viewers_network_30d: number;
      viewers_other_30d: number;
      daily: { day: string; views: number }[];
      pin_likes_30d: number;
      pin_replies_30d: number;
      vouches_30d: number;
      intro_requests_30d: number;
    };

export async function fetchAnalytics() {
  const { data, error } = await supabase.rpc('profile_analytics');
  if (error) throw error;
  return data as unknown as Analytics;
}

/** Counts a profile view (once per person per day; never shown by name). */
export function recordProfileView(userId: string) {
  supabase.rpc('record_profile_view', { p_user: userId }).then(
    () => undefined,
    () => undefined,
  );
}

/** Premium's monthly price (the charge itself is set by config.premium_price_cents on the server). */
export const PREMIUM_PRICE = '$14.99';
