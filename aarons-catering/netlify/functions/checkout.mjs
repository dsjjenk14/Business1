// Starts a Stripe Checkout payment for a Thanksgiving order.
//
// The order page sends the picks; this prices them again from holiday.mjs (so a
// total can't be changed in the browser), creates a Checkout Session and returns
// its address. Stripe takes the card and sends the customer back to
// order.html?paid=... or order.html?canceled=1.
//
// Needs STRIPE_SECRET_KEY in Netlify: Site configuration > Environment variables.
// No packages to install: it talks to Stripe's API directly.

import { holiday } from '../../src/content/holiday.mjs';
import { priceOrder, OrderError } from '../../src/thanksgiving-order.mjs';

export const config = { path: '/api/checkout' };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const clip = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function todayEastern() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Stripe's API takes form fields, with brackets for nesting: line_items[0][quantity]=1
function encode(value, prefix = '', out = new URLSearchParams()) {
  if (value === undefined || value === null || value === '') return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

export default async function checkout(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!holiday.cardPayments || !key) return json({ error: 'Card payments aren’t set up yet.' }, 503);

  const T = holiday.thanksgiving;
  if (T.soldOut || todayEastern() > T.orderBy) return json({ error: `Thanksgiving orders are closed for ${holiday.year}.` }, 409);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'That order didn’t come through. Try again.' }, 400);
  }

  let priced;
  try {
    priced = priceOrder(body.order ?? {});
  } catch (err) {
    if (err instanceof OrderError) return json({ error: err.message }, 400);
    throw err;
  }

  const c = body.customer ?? {};
  const name = clip(c.name, 120);
  const email = clip(c.email, 200);
  const phone = clip(c.phone, 40);
  if (!name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Add your name, email and phone.' }, 400);

  const o = body.order;
  const delivery = o.fulfilment === 'Delivery';
  const pick = (kind) => priced.picks[kind].map((i) => i.name).join(', ');
  // Shown on the payment in the Stripe dashboard, so the order details travel with the money.
  const metadata = {
    name,
    phone,
    package: priced.package.name,
    meats: pick('meats'),
    sides: pick('sides'),
    dessert: pick('desserts'),
    bread: o.bread,
    pickup_or_delivery: delivery ? `Delivery, ${o.area}` : 'Pickup',
    address: delivery ? clip(c.address) : '',
    preferred_time: clip(c.time),
    allergies_and_notes: clip(c.notes),
    order: clip(priced.lines.map((l) => `${l.qty > 1 ? `${l.qty} x ` : ''}${l.name}: $${l.amount * l.qty}`).join('; ')),
    total: `$${priced.total}`,
  };
  if (delivery && !metadata.address) return json({ error: 'Add the delivery address.' }, 400);

  const origin = new URL(req.url).origin;
  const session = {
    mode: 'payment',
    customer_email: email,
    success_url: `${origin}/order.html?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/order.html?canceled=1`,
    line_items: priced.lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(l.amount * 100),
        product_data: { name: l.name, description: l.detail },
      },
    })),
    metadata,
    payment_intent_data: {
      description: `Thanksgiving ${holiday.year}: ${priced.package.name} for ${name}`,
      metadata,
    },
  };

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encode(session),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    console.error('Stripe said no:', data.error?.message ?? res.status);
    return json({ error: 'We couldn’t open the payment page.' }, 502);
  }
  return json({ url: data.url, id: data.id, total: priced.total });
}
