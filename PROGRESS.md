# I'm In: Progress

## Status
**Current phase:** Phase 0 (Plan), done and waiting for Dominique's review.

## Done
- **Phase 0: Plan.** Read the spec and the full prototype. Wrote `docs/PHASE-0-PLAN.md`, which has the schema, the folder structure, 19 open questions and conflicts with recommended answers, and a list of accounts and costs.

## Next
- Dominique answers the questions in `docs/PHASE-0-PLAN.md` section 1.
- **Phase 1: Foundation.** Expo + TypeScript + Expo Router, theme system (A/B/C/D), 4-tab navigation and header, auth (signup / login / forgot password), Supabase migrations, dev-only seed script.

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-09-27 | Default theme is A (Warm Editorial) | None was marked in the spec |
| 2026-09-27 | Prototype is kept in `reference/` and never imported | Spec: use it for UX and copy only |
| 2026-09-27 | Testing = web build + automated checks in the cloud, plus Dominique on Expo Go | iOS Simulator requires a Mac and isn't available in this environment |

## Spec vs. prototype conflicts (spec wins)
See `docs/PHASE-0-PLAN.md` section 1B.
