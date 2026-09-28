import { supabase } from '@/lib/supabase';

const unwrap = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/**
 * AI features. The app never talks to the AI directly: it asks our server
 * (the `ai` Edge Function), which uses the business's AI key. Members don't
 * need an AI account.
 */
export type AIQuota = { limit: number | null; used: number; left: number | null };
export type AIFeature = 'people_like_you' | 'icebreakers' | 'tonight' | 'intro_odds' | 'profile_read';
export type AIErrorCode = 'not_configured' | 'limit' | 'unavailable' | 'other';

export class AIError extends Error {
  constructor(
    message: string,
    public code: AIErrorCode,
    public quota: AIQuota | null = null,
  ) {
    super(message);
  }
}

export async function runAI<R>(feature: AIFeature, opts: { subject?: string; refresh?: boolean } = {}): Promise<{ result: R; cached: boolean; quota: AIQuota | null; created_at: string | null }> {
  const { data, error } = await supabase.functions.invoke('ai', { body: { feature, subject: opts.subject, refresh: opts.refresh } });
  if (error) {
    let message = 'AI isn’t available right now.';
    let code: AIErrorCode = 'other';
    let quota: AIQuota | null = null;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
      quota = body?.quota ?? null;
    } catch {
      // keep the defaults
    }
    throw new AIError(message, code, quota);
  }
  return { result: data.result as R, cached: !!data.cached, quota: data.quota ?? null, created_at: data.created_at ?? null };
}

/** Short, friendly text for an AI failure. */
export function aiErrorText(e: unknown): string {
  if (e instanceof AIError) {
    if (e.code === 'not_configured') return 'AI features are coming soon.';
    return e.message;
  }
  return 'AI isn’t available right now.';
}

export const quotaText = (q: AIQuota | null) =>
  !q || q.left == null ? null : q.left === 0 ? 'No free AI uses left' : `${q.left} free AI use${q.left === 1 ? '' : 's'} left`;

export const fetchMyAIQuota = async () => unwrap<AIQuota>(await supabase.rpc('my_ai_quota'));

// ── People like you ──────────────────────────────────────────────────────
export type Shared = {
  shared_interests: string[];
  shared_groups: string[];
  shared_spots: string[];
  shared_days: string[];
  mutual_count: number;
  mutuals: string[];
  same_neighborhood: boolean;
  same_city: boolean;
};
export type LikeYou = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  neighborhood: string | null;
  vouch_count: number;
  degree: 2 | null;
  via: { id: string; display_name: string } | null;
  intro_requested: boolean;
  shared: Shared;
  score: number;
  /** Set when the AI picked this person. */
  reason?: string;
};
export type PeoplePicks = { picks: { user_id: string; reason: string }[] };

export const fetchPeopleLikeYou = async (limit = 15) => unwrap<LikeYou[]>(await supabase.rpc('people_like_you', { p_limit: limit }));

/** AI picks first (with their reason), then everyone else in the database's order. */
export function mergePicks(list: LikeYou[], picks: PeoplePicks | null): LikeYou[] {
  if (!picks?.picks.length) return list;
  const byId = new Map(list.map((p) => [p.user_id, p]));
  const top = picks.picks.flatMap((p) => (byId.has(p.user_id) ? [{ ...byId.get(p.user_id)!, reason: p.reason }] : []));
  const topIds = new Set(top.map((p) => p.user_id));
  return [...top, ...list.filter((p) => !topIds.has(p.user_id))];
}

/** "Both into Brunch, Pickleball · 2 mutual friends" */
export function sharedLine(s: Shared): string {
  const bits: string[] = [];
  if (s.shared_interests.length) bits.push(`Both into ${s.shared_interests.slice(0, 2).join(', ')}`);
  if (s.shared_groups.length) bits.push(s.shared_groups[0]!);
  else if (s.shared_spots.length) bits.push(`Both go to ${s.shared_spots[0]}`);
  if (s.mutual_count) bits.push(`${s.mutual_count} mutual${s.mutual_count === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

// ── Interests ────────────────────────────────────────────────────────────
export type InterestOption = { key: string; label: string; category: string; sort: number };
export const fetchInterestOptions = async () =>
  unwrap<InterestOption[]>(await supabase.from('interest_options').select('key, label, category, sort').order('sort'));

// ── Intro odds ───────────────────────────────────────────────────────────
export type IntroOdds = { score: number; band: 'high' | 'medium' | 'low'; a: string; b: string; signals: { label: string; good: boolean }[] };
export const fetchIntroOdds = async (a: string, b: string) => unwrap<IntroOdds>(await supabase.rpc('intro_odds', { p_a: a, p_b: b }));

// ── Results ──────────────────────────────────────────────────────────────
export type ProfileRead = { badges: { label: string; why: string }[]; read: string | null; thin?: boolean; created_at?: string };
export type Icebreakers = { icebreakers: string[] };
export type TonightOption = {
  key: string;
  kind: 'event' | 'spot';
  id: number;
  title: string;
  where: string | null;
  area: string | null;
  starts: string | null;
  friends_going: string[];
  network_going: number;
};
export type TonightForYou = {
  pick: (TonightOption & { headline: string; reasons: string[] }) | null;
  alternatives: (TonightOption & { reason: string })[];
};
