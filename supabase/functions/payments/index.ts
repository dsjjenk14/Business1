/**
 * Payments: the app asks here to start paying (Stripe Checkout), set up host
 * payouts (Stripe Connect), or manage a Premium subscription. Returns a
 * Stripe URL the app opens in the browser. Card details only ever go to Stripe.
 *
 * POST { action: 'premium' | 'manage_premium' | 'ticket' | 'payouts_setup' | 'payouts_dashboard', event_id? }
 *   → { url }
 * POST { action: 'payouts_refresh' } → { charges_enabled } (asks Stripe if setup is done)
 * POST { action: 'refund_ticket', ticket_id } → { refunded: true } (host only; full refund)
 * GET  ?done=… : where Stripe sends people back; redirects into the app.
 *
 * Off until the STRIPE_SECRET_KEY function secret is set (docs/PAYMENTS.md).
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';
import { paymentsOn, stripe } from '../_shared/stripe.ts';

const SELF = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments`;
const back = (done: string, extra = '') => `${SELF()}?done=${done}${extra}`;

async function rpc<T>(fn: string, body: Record<string, unknown>) {
  const { data, ok } = await adminRest<T>(`rpc/${fn}`, { method: 'POST', body });
  if (!ok) throw new Error(`Database error (${fn})`);
  return data as T;
}

async function customerFor(userId: string, email: string | null): Promise<string> {
  const { data } = await adminRest<{ stripe_customer_id: string }[]>(`payment_customers?select=stripe_customer_id&user_id=eq.${userId}`);
  const existing = data?.[0]?.stripe_customer_id;
  if (existing) return existing;
  const c = await stripe<{ id: string }>('/customers', { email: email ?? undefined, metadata: { user_id: userId } }, `cust-${userId}`);
  await rpc('stripe_set_customer', { p_user: userId, p_customer: c.id });
  return c.id;
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await adminRest<{ email: string | null }[]>(`profile_private?select=email&id=eq.${userId}`);
  return data?.[0]?.email ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Back from Stripe: hand over to the app.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const done = url.searchParams.get('done') ?? 'cancel';
    const event = url.searchParams.get('event');
    const target =
      done === 'ticket' && event ? `imin://events/${event}?paid=1` : done === 'premium' ? 'imin://premium?paid=1' : done === 'payouts' ? 'imin://settings/payouts' : 'imin://';
    return new Response(null, { status: 302, headers: { Location: target } });
  }
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);
  if (!paymentsOn()) return json({ error: 'Payments aren’t turned on yet.' }, 503);

  let body: { action?: string; event_id?: number; ticket_id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  try {
    switch (body.action) {
      case 'premium': {
        const email = await emailOf(caller.id);
        const customer = await customerFor(caller.id, email);
        const { data: cfg } = await adminRest<{ value: unknown }[]>(`app_config?select=value&key=eq.premium_price_cents`);
        const cents = Number(cfg?.[0]?.value ?? 1499);
        const session = await stripe<{ url: string }>('/checkout/sessions', {
          mode: 'subscription',
          customer,
          client_reference_id: caller.id,
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, recurring: { interval: 'month' }, product_data: { name: 'I’m In Premium' } } }],
          subscription_data: { metadata: { user_id: caller.id } },
          metadata: { kind: 'premium', user_id: caller.id },
          allow_promotion_codes: true,
          success_url: back('premium'),
          cancel_url: back('cancel'),
        });
        return json({ url: session.url });
      }
      case 'manage_premium': {
        const customer = await customerFor(caller.id, await emailOf(caller.id));
        const portal = await stripe<{ url: string }>('/billing_portal/sessions', { customer, return_url: back('premium') });
        return json({ url: portal.url });
      }
      case 'ticket': {
        if (!body.event_id) return json({ error: 'Which event?' }, 400);
        const check = await rpc<{ error?: string; title: string; price_cents: number; fee_cents: number; destination: string }>('stripe_checkout_check', {
          p_event: body.event_id,
          p_user: caller.id,
        });
        if (check.error) return json({ error: check.error }, 409);
        const session = await stripe<{ url: string }>('/checkout/sessions', {
          mode: 'payment',
          client_reference_id: caller.id,
          customer_email: (await emailOf(caller.id)) ?? undefined,
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: check.price_cents, product_data: { name: `Ticket: ${check.title}` } } }],
          payment_intent_data: {
            application_fee_amount: check.fee_cents,
            transfer_data: { destination: check.destination },
            metadata: { kind: 'ticket', event_id: String(body.event_id), user_id: caller.id },
          },
          metadata: { kind: 'ticket', event_id: String(body.event_id), user_id: caller.id, fee_cents: String(check.fee_cents) },
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          success_url: back('ticket', `&event=${body.event_id}`),
          cancel_url: back('cancel'),
        });
        return json({ url: session.url });
      }
      case 'payouts_setup': {
        const { data } = await adminRest<{ stripe_account_id: string }[]>(`payout_accounts?select=stripe_account_id&user_id=eq.${caller.id}`);
        let account = data?.[0]?.stripe_account_id;
        if (!account) {
          const acct = await stripe<{ id: string }>(
            '/accounts',
            {
              type: 'express',
              country: 'US',
              email: (await emailOf(caller.id)) ?? undefined,
              capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
              business_type: 'individual',
              metadata: { user_id: caller.id },
            },
            `acct-${caller.id}`,
          );
          account = acct.id;
          await rpc('stripe_payout_account_set', { p_user: caller.id, p_account: account });
        }
        const link = await stripe<{ url: string }>('/account_links', {
          account,
          type: 'account_onboarding',
          refresh_url: back('payouts'),
          return_url: back('payouts'),
        });
        return json({ url: link.url });
      }
      case 'payouts_dashboard': {
        const { data } = await adminRest<{ stripe_account_id: string }[]>(`payout_accounts?select=stripe_account_id&user_id=eq.${caller.id}`);
        const account = data?.[0]?.stripe_account_id;
        if (!account) return json({ error: 'Set up payouts first.' }, 409);
        const link = await stripe<{ url: string }>(`/accounts/${account}/login_links`, {});
        return json({ url: link.url });
      }
      case 'payouts_refresh': {
        // Stripe tells us through a Connect webhook too; this makes the Payouts
        // screen right the moment the host comes back from setup.
        const { data } = await adminRest<{ stripe_account_id: string }[]>(`payout_accounts?select=stripe_account_id&user_id=eq.${caller.id}`);
        const account = data?.[0]?.stripe_account_id;
        if (!account) return json({ charges_enabled: false });
        const acct = await stripe<{ charges_enabled: boolean; payouts_enabled: boolean }>(`/accounts/${account}`);
        await rpc('stripe_account_updated', { p_account: account, p_charges: !!acct.charges_enabled, p_payouts: !!acct.payouts_enabled });
        return json({ charges_enabled: !!acct.charges_enabled });
      }
      case 'refund_ticket': {
        if (!Number.isInteger(body.ticket_id)) return json({ error: 'Bad request' }, 400);
        const check = await rpc<{ payment_intent?: string; error?: string }>('stripe_refund_check', { p_ticket: body.ticket_id, p_host: caller.id });
        if (check.error || !check.payment_intent) return json({ error: check.error ?? 'Ticket not found.' }, 409);
        // Everything back to the guest: the host's share and our fee.
        await stripe('/refunds', { payment_intent: check.payment_intent, reverse_transfer: true, refund_application_fee: true }, `refund-${body.ticket_id}`).catch(
          (e: Error) => {
            if (!/already been refunded/i.test(e.message)) throw e;
          },
        );
        await rpc('stripe_ticket_refunded', { p_payment_intent: check.payment_intent });
        return json({ refunded: true });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Payment error' }, 502);
  }
});
