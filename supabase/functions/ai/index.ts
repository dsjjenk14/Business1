/**
 * AI features. One entry point; each feature lives in its own module in
 * ./features with its method explained at the top (and in README.md).
 *
 * POST { feature, subject?, refresh? }
 *   feature: people_like_you | icebreakers | tonight | intro_odds
 *   subject: the person's id (icebreakers) or "a:b" (intro_odds)
 *   refresh: true to make a new one instead of returning the saved one
 * → { result, cached, quota: { limit, used, left } }
 *
 * Errors come back with a `code` the app turns into a friendly message:
 *   not_configured (no AI key yet), limit (free uses spent), unavailable (AI
 *   didn't answer; the app shows its non-AI version).
 */
import { aiConfigured, askJson } from '../_shared/claude.ts';
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';
import { icebreakers } from './features/icebreakers.ts';
import { introOdds } from './features/intro_odds.ts';
import { peopleLikeYou } from './features/people_like_you.ts';
import { tonight } from './features/tonight.ts';
import type { Ctx, Feature } from './features/types.ts';

const FEATURES: Record<string, Feature> = {
  people_like_you: peopleLikeYou,
  icebreakers,
  tonight,
  intro_odds: introOdds,
};

type Quota = { limit: number | null; used: number; left: number | null };

const rpc = <T>(fn: string, body: Record<string, unknown>) => adminRest<T>(`rpc/${fn}`, { method: 'POST', body });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  let body: { feature?: string; subject?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const name = String(body.feature ?? '');
  const feature = FEATURES[name];
  if (!feature) return json({ error: 'Unknown feature' }, 400);
  const ctx: Ctx = { req, userId: caller.id, subject: String(body.subject ?? '').slice(0, 80), refresh: body.refresh === true };
  const scope = feature.scope(ctx);

  // 1. A saved result is free.
  if (!ctx.refresh) {
    const { data } = await rpc<{ result: unknown; created_at: string } | null>('ai_cache_get', { p_scope: scope, p_feature: name, p_subject: ctx.subject });
    if (data?.result) {
      const { data: quota } = await rpc<Quota>('ai_quota_for', { p_user: caller.id });
      return json({ result: data.result, created_at: data.created_at, cached: true, quota });
    }
  }

  // 2. Gather the facts as the member.
  const gathered = await feature.gather(ctx);
  if ('error' in gathered) return json({ error: gathered.error }, gathered.status);
  const { data: quota } = await rpc<Quota>('ai_quota_for', { p_user: caller.id });
  if ('empty' in gathered) return json({ result: gathered.empty, cached: false, quota });

  // 3. Check the free-use limit, then ask.
  if (!aiConfigured()) return json({ error: 'AI isn’t set up yet.', code: 'not_configured' }, 503);
  const counts = feature.counts(ctx);
  if (counts && quota && quota.left !== null && quota.left <= 0) {
    return json({ error: `You’ve used your ${quota.limit} free AI picks. Premium makes them unlimited.`, code: 'limit', quota }, 402);
  }

  let result: unknown = null;
  try {
    const out = await askJson(feature.ask(gathered.facts));
    result = out ? feature.finish(gathered.facts, out) : null;
  } catch (e) {
    console.error(`ai ${name} failed`, e instanceof Error ? e.message : e);
  }
  if (!result) return json({ error: 'The AI didn’t answer this time. Try again in a bit.', code: 'unavailable', quota }, 502);

  // 4. Save it (and count the use).
  const saved = await rpc<Quota>('ai_save', {
    p_user: caller.id, p_scope: scope, p_feature: name, p_subject: ctx.subject,
    p_person: feature.person?.(ctx) ?? null, p_result: result, p_ttl_minutes: feature.ttlMinutes, p_count: counts,
  });
  return json({ result, created_at: new Date().toISOString(), cached: false, quota: saved.data ?? quota });
});
