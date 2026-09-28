/**
 * RevenueCat → Premium.
 *
 * RevenueCat calls this after App Store / Play purchases, renewals,
 * cancellations and expirations. We store the new expiry on the member's
 * entitlement. The app sets RevenueCat's "app user id" to the member's I'm In
 * user id, so events map straight to a profile.
 *
 * Security: RevenueCat sends the Authorization header we configure in its
 * dashboard; it must equal the REVENUECAT_WEBHOOK_SECRET function secret.
 * Until that secret exists, every call is rejected (nothing to connect yet).
 */
import { adminRest, json } from '../_shared/http.ts';

type RcEvent = {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || given !== secret) return json({ error: 'unauthorized' }, 401);

  let event: RcEvent;
  try {
    event = (await req.json()).event as RcEvent;
  } catch {
    return json({ error: 'bad body' }, 400);
  }
  if (!event?.type) return json({ error: 'no event' }, 400);

  // Find the I'm In member this event belongs to.
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter((x): x is string => !!x && UUID.test(x));
  const userId = candidates[0];
  if (!userId) return json({ ok: true, ignored: 'no member id' }); // e.g. anonymous RevenueCat ids

  const expires = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  const grants = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED'];
  const ends = ['EXPIRATION'];

  if (grants.includes(event.type) && expires) {
    // Never shorten a longer entitlement (e.g. a Founding Member's free months).
    const { data } = await adminRest<{ premium_until: string | null }[]>(`entitlements?select=premium_until&user_id=eq.${userId}`);
    const current = data?.[0]?.premium_until ?? null;
    const until = current && current > expires ? current : expires;
    await adminRest('entitlements?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { user_id: userId, premium_until: until, source: until === expires ? 'revenuecat' : undefined, updated_at: new Date().toISOString() },
    });
    return json({ ok: true, premium_until: until });
  }
  if (ends.includes(event.type)) {
    // The subscription ended. Keep any founding / admin time that's still left.
    await adminRest(`entitlements?user_id=eq.${userId}&source=eq.revenuecat`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { premium_until: expires ?? new Date().toISOString(), updated_at: new Date().toISOString() },
    });
    return json({ ok: true });
  }
  // CANCELLATION (auto-renew turned off) keeps Premium until it expires; nothing to do.
  return json({ ok: true, ignored: event.type });
});
