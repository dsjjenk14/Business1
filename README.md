# The HR Blueprint

A paid career platform that walks people into HR, recruiting, and talent acquisition.
Migrated from the single-file prototype `hr-blueprint-platform.html`, which is the source of truth for content, copy, and design.

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Phase 3) · Stripe (Phase 4) · Resend (Phase 5) · Vercel · PWA (Phase 6)

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (uses webpack; see note below)
npm run lint
npx tsc --noEmit
```

Builds use `--webpack` because the Turbopack font loader fails behind some proxies. Output is identical.

## Where things live

| Path | What it is |
|---|---|
| `src/config/site.ts` | Prices, Calendly link, contact details, ad slots. Change prices here only. |
| `src/lib/journey.ts` | The 21 steps, the 5 acts, the badges |
| `src/lib/content.ts` | Quiz, games, interview questions, 90 day plan data (word for word from the prototype) |
| `src/lib/state.ts` | The progress blob (the prototype's `S`), streak, badge rules |
| `src/components/views/` | One component per screen, grouped by act |
| `src/app/globals.css` | The prototype's CSS, unchanged apart from font variables |

## Build status

- [x] Phase 0: inventory
- [x] Phase 1: scaffold and design tokens
- [x] Phase 2: full journey and every interaction as React (localStorage, like the prototype)
- [ ] Phase 3: Supabase auth and cross device sync
- [ ] Phase 4: Stripe, entitlements, server side access
- [ ] Phase 5: coaching hub, messaging, email, ads, admin
- [ ] Phase 6: PWA
