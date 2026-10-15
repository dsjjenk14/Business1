# Roadmap

Built in small vertical slices. Every milestone leaves the project playable and tested.
Status is kept honest: ✅ done and tested, ⚠️ partial, ⬜ not started.

## M0 — Foundation and headless founding slice ✅ (this milestone)

Covers spec Phase 0, plus the server-side halves of Phases 2–5 that the slice needs.

**Delivered**
- Architecture and docs (this folder), coding rules (`CLAUDE.md`), decision log.
- Engine-agnostic C++20 simulation core: clock and calendar, data-driven content with
  validation, needs, emotions, personality, values, directional relationships, memories,
  careers with promotion, ledger, rent, activities, construction and city stages.
- Dedicated authoritative server: accounts (PBKDF2), login takeover, one character per
  account, rate limiting, size limits, event routing, autosave, graceful shutdown.
- SQLite persistence with migrations and a ledger-balance guard.
- Headless client with a script mode; `scripts/demo_slice.sh`.
- 49 tests, including a two-player network test across a server restart; ASan/UBSan clean.

**Vertical slice (spec §33) status**

| # | Step | Status |
|---|---|---|
| 1 | Launch LIVÉRA | ⚠️ server + text client; no game client |
| 2 | Enter the founding town | ⚠️ logical town (places, distances, construction); not rendered |
| 3 | Create or select a character | ⚠️ select (Dominique, Jaxon); no creator |
| 4 | Walk around | ⚠️ server-authoritative movement; no 3D, camera or animation |
| 5 | Enter an apartment | ✅ |
| 6 | Use the phone | ⚠️ 9 apps as server views; no phone UI |
| 7 | Meet another player | ✅ |
| 8 | Talk to them | ✅ interactions + text messages (no voice or free in-world chat yet) |
| 9 | Build a relationship | ✅ |
| 10–13 | Go to work, earn, spend, return home | ✅ |
| 14 | See the world continue changing | ✅ construction, openings, city stats |
| 15–18 | Save, disconnect, reconnect, state preserved | ✅ including a full server restart |

Every ⚠️ is the same gap: **there is no 3D client yet.** That is M1.

## M1 — Unreal client shell (spec Phases 1 + 3) ⬜ — next

Needs: an Unreal Engine 5 install (Windows or Linux build machine) and a decision on the
UE version. **This can't be built in the cloud container this milestone was made in.**

- UE5 C++ project; `LiveraSim` module wrapping `livera_core`; dedicated server target.
- GameMode owns the `World`; server RPCs call `World` commands; replicated character
  state; client prediction for movement with server validation.
- Greybox founding town generated from `founding_town.json` (doors, footprints, roads,
  construction sites with placeholder crews), third-person camera, day/night from
  `daylightLevel`.
- Interact prompts at doors, offers and activities; save/load through `livera_persistence`.
- Exit criteria: two players on a UE dedicated server do the M0 slice in 3D.

## M2 — Dominique, complete (spec Phase 2) ⬜

- Character art pipeline: the approved artwork as reference, a first in-engine model
  for Dominique, her wardrobe and silhouette.
- Phone UI (UMG) over the existing phone views.
- Schedule-driven autonomy while she's not being played (her routine in `profile.schedule`).
- Her apartment interior with usable objects instead of abstract activities.

## M3 — Social simulation (spec Phase 4) ⬜

Conversations with choices, memory decay and recall, memory-driven reactions,
information and secrets (facts vs beliefs), first gossip propagation, the remaining
founding cast added one at a time with their ties.

## M4 — Economy (spec Phase 5) ⬜

Expenses (utilities, food, transport), debt and arrears consequences, credit, buying and
selling property, mortgages, roommates, transaction history UI.

## Later milestones (spec order)

| Milestone | Spec phase | Scope |
|---|---|---|
| M5 | 6 City | New neighbourhoods, roads, services, crews as Tier-2 agents, secondary effects |
| M6 | 7 Player characters | Character creator, origins ("Why Livéra?") |
| M7 | 8 Businesses | Ownership, hiring (including players), payroll, inventory |
| M8 | 9 AI citizens | Goals, schedules, jobs, relationships, autonomy (Tier 2) |
| M9 | 10 Social media | Posts, followers, virality, sponsorships |
| M10 | 11 City development | Player developers, permits, financing, property market |
| M11 | 12 Life events | Data-driven event engine |
| M12 | 13 Generations | Life stages, children, inheritance |
| M13 | 14 Polish | Animation, UI, audio, VFX, performance, accessibility, onboarding |

Before any server is reachable from outside a developer machine: transport encryption,
token sessions and login throttling (MULTIPLAYER.md).
