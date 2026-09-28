/**
 * Stripe → I'm In. Stripe calls this when money moves; we record it.
 *  - checkout.session.completed: a ticket was paid (or a Premium customer created).
 *    If the event filled up while they paid, the ticket is refunded in full.
 *  - invoice.paid: Premium paid or renewed → Premium until the end of the period
 *  - customer.subscription.deleted: Premium cancelled (runs to the end of what was paid)
 *  - charge.refunded: a ticket was refunded → no longer going
 *  - account.updated: a host finished (or lost) payout setup (a Connect event;
 *    the app also asks Stripe directly when the host returns from setup)
 *
 * Every call must carry a valid Stripe-Signature for STRIPE_WEBHOOK_SECRET.
 */
import { adminRest, json } from '../_shared/http.ts';
import { stripe, verifyStripeSignature } from '../_shared/stripe.ts';

type Obj = Record<string, any>; // Stripe payloads are large; we read a few fields.

// A failed database write throws, so we answer 500 and Stripe retries later.
async function rpc(fn: string, body: Record<string, unknown>) {
  const res = await adminRest(`rpc/${fn}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`${fn} failed`);
  return res.data;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get('Stripe-Signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '');
  if (!ok) return json({ error: 'bad signature' }, 400);

  const event = JSON.parse(raw) as { type: string; data: { object: Obj } };
  const o = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const meta = o.metadata ?? {};
        if (o.customer && UUID.test(o.client_reference_id ?? '')) await rpc('stripe_set_customer', { p_user: o.client_reference_id, p_customer: o.customer });
        if (meta.kind === 'ticket' && o.payment_status === 'paid' && UUID.test(meta.user_id ?? '')) {
          const result = await rpc('stripe_ticket_paid', {
            p_session: o.id,
            p_event: Number(meta.event_id),
            p_user: meta.user_id,
            p_amount: o.amount_total,
            p_fee: Number(meta.fee_cents ?? 0),
            p_payment_intent: o.payment_intent,
          });
          if (result === 'overflow' && o.payment_intent) {
            // Give back everything: the host's share and our fee.
            await stripe('/refunds', { payment_intent: o.payment_intent, reverse_transfer: true, refund_application_fee: true }, `overflow-${o.id}`).catch((e: Error) => {
              if (!/already been refunded/i.test(e.message)) throw e; // a retry after it went through is fine
            });
          }
        }
        break;
      }
      case 'invoice.paid': {
        // The subscription's user id lives on its metadata (shape differs across API versions).
        const userId = o.subscription_details?.metadata?.user_id ?? o.parent?.subscription_details?.metadata?.user_id ?? o.lines?.data?.[0]?.metadata?.user_id;
        const periodEnd = o.lines?.data?.[0]?.period?.end ?? o.period_end;
        if (UUID.test(userId ?? '') && periodEnd) {
          // One day of grace so a renewal a few hours late never locks anyone out.
          await rpc('stripe_premium_paid', { p_user: userId, p_until: new Date((periodEnd + 86400) * 1000).toISOString() });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        if (UUID.test(o.metadata?.user_id ?? '')) await rpc('stripe_premium_ended', { p_user: o.metadata.user_id });
        break;
      }
      case 'charge.refunded': {
        if (o.payment_intent) await rpc('stripe_ticket_refunded', { p_payment_intent: o.payment_intent });
        break;
      }
      case 'account.updated': {
        await rpc('stripe_account_updated', { p_account: o.id, p_charges: !!o.charges_enabled, p_payouts: !!o.payouts_enabled });
        break;
      }
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
  return json({ received: true });
});
