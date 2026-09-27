# I'm In

A trust-based social app for going out and meeting real people. Launch market: DC Metro.

- **Spec:** [`SPEC.md`](SPEC.md)
- **Plan and decisions:** [`docs/PHASE-0-PLAN.md`](docs/PHASE-0-PLAN.md)
- **Progress log:** [`PROGRESS.md`](PROGRESS.md)
- **Prototype (reference only):** [`reference/imin-final-v2.html`](reference/imin-final-v2.html)

## Stack

Expo (React Native, TypeScript, Expo Router) · Supabase (Postgres + PostGIS, Auth, Storage, Edge Functions) · Twilio (SMS) · Claude API (Phase 7) · RevenueCat (Phase 6)

## Run it locally

You need Node 20+ and Docker.

```bash
npm install
cp .env.example .env              # then paste the anon key from `npx supabase status`
npx supabase start                # local database, auth, storage (first run downloads ~2 GB)
npm run db:fresh                  # rebuild the database and load the demo cast
npx supabase functions serve      # Edge Functions (phone login, phone verification)
npm run web                       # open http://localhost:8081
```

Demo login: `dom@imin.test` / `ImIn-demo-2026`, or phone `(202) 555-1000` with the same password.
Every demo member uses the same password (`maya@imin.test`, `jordan@imin.test`, …).

On a phone: `npx expo start`, then scan the QR code with the Expo Go app (phone and computer on the same Wi-Fi).

## Checks

```bash
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm run db:test          # database business-rule tests (pgTAP)
npm run check:contrast   # readability contrast for every theme
```

## Where things live

| Folder | What's in it |
|---|---|
| `src/app/` | Screens. Every file is a route (Expo Router). `(auth)` = logged out, `(app)` = logged in, `(app)/(tabs)` = the 4 tabs. |
| `src/theme/` | **The whole look.** Tokens + five themes (E "Top 8" default, A–D alternates). |
| `src/components/` | Shared building blocks (`ui/`) and navigation (`nav/`). |
| `src/features/` | Logic grouped by feature (auth, onboarding, notifications…). |
| `src/config/` | Loads founder-editable config (tiers, plan limits, cities) from the database. |
| `supabase/migrations/` | Database schema, one numbered file per change. |
| `supabase/functions/` | Server code. See its README for secrets (Twilio). |
| `supabase/seed/` | Demo data. **Development only**; refuses to run against a non-local database. |
| `supabase/tests/` | Database tests for the business rules. |

## Changing things without code

These live in database tables. Edit them in Supabase Studio (local: http://127.0.0.1:54323):

- `vouch_tiers`: tier names and vouch counts
- `plan_limits`: Free vs Premium limits
- `vouch_words`: the words people can vouch with
- `app_config`: founding member limit (500), minimum age, Date Mode distance, and more
- `cities`: launch cities
