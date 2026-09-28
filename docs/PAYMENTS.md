# Payments: Premium and event tickets

Everything is built. Payments stay **off** until you connect a Stripe account.
Until then, the pay buttons show "Payments aren't turned on yet."

## How the money works

| What | Who pays | Where the money goes |
|---|---|---|
| **Premium** ($14.99/month) | The member, by card | All to I'm In |
| **Event ticket** (price set by the host, up to $500) | The guest, by card | **8% to I'm In**; the host gets the rest, minus Stripe's card fee |

- **Stripe's own fee** is about **2.9% + 30¢** per card payment (US cards). There's no monthly fee.
  - On tickets, **the host pays Stripe's card fee**, so I'm In keeps its full 8%. Example: a $25 ticket: the guest pays $25.00, I'm In keeps $2.00, Stripe's card fee is about $1.03, and the host gets about $21.97.
  - On Premium, I'm In pays the card fee: about 73¢ of each $14.99.
  - Hosts get paid out by Stripe to their own bank account, usually in 2 business days.
- The 8% is one setting (`app_config.platform_fee_percent`), so you can change it later without an app update. Stripe's card fee is set in `card_fee_percent` (2.9) and `card_fee_fixed_cents` (30).
- If an event fills up while someone is paying, they're **refunded automatically** in full.
- Hosts can **refund** any guest from the event page (Ticket holders → Refund). The guest gets all their money back, including I'm In's fee, is taken off the list, and is notified.

## Turning it on (about 30 minutes, one time)

1. **Create a Stripe account** at stripe.com. Use your business details and bank account.
2. **Turn on Connect** (this is what lets hosts get paid): Stripe dashboard → **Connect** → Get started → choose **Express** accounts. The platform name is "I'm In".
3. **Customer portal** (lets members cancel Premium themselves): Settings → Billing → **Customer portal** → turn on "Cancel subscriptions" → Save.
4. **Webhook** (how Stripe tells the app that someone paid): Developers → **Webhooks** → Add endpoint.
   - URL: `https://yscrfhaedexogvegbvzm.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`
   - Save, then copy the **Signing secret** (starts with `whsec_`).
5. **Add two GitHub secrets** (GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret):
   - `STRIPE_SECRET_KEY`: Stripe → Developers → API keys → **Secret key** (starts with `sk_`)
   - `STRIPE_WEBHOOK_SECRET`: the signing secret from step 4
   - Never paste these into a chat, an email, or the app code.
6. **Run the deploy**: GitHub → Actions → **Deploy** → Run workflow. Payments are now on.

**Try it first in test mode:** Stripe has a "Test mode" switch. Do steps 2 to 6 with the test keys (`sk_test_…`) and pay with card `4242 4242 4242 4242`, any future date, any CVC. When it all works, repeat steps 4 and 5 with the live keys.

## Where it lives in the app

- **Premium** (Menu → Premium, or Settings → Premium): "Get Premium" opens Stripe's secure checkout. Members with free Premium (like Founding Members) see "Keep Premium": they add a card now and aren't charged until their free months end. Subscribers see "Manage or cancel".
- **Settings → Payouts**: hosts set up where their ticket money goes, and see their sales.
- **New event**: once payouts are set up, the host can add a ticket price.
- **Event page**: guests tap "Buy Tickets · $X". The host sees tickets sold, what they earn, and who bought (with Refund).
- **Settings → My tickets**: everything you've bought.
- **Menu → Admin → Ticket fees**: what I'm In earned each month.

## App Store note

Tickets to real-world events can be sold with Stripe; Apple allows that. Premium is a
digital subscription. In the US, apps can now link to their own web checkout, so this
works for a US launch. In other countries Apple still requires in-app purchase for
digital subscriptions. If you launch outside the US, we'd switch Premium to Apple's
in-app purchase there (Apple keeps 15–30%).

## For developers

- Database: `supabase/migrations/20261015000027_payments.sql` (tests: `015_payments.test.sql`).
- Edge Functions: `payments` (checkout, payout setup, portal) and `stripe-webhook` (verifies the Stripe signature on every call).
- Card details never touch our servers or the app; Stripe's hosted pages collect them.
