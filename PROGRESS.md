# I'm In: Progress

## Status
**Current phase:** Phase 1 (Foundation) is done and waiting for Dominique's go-ahead.

---

## ✅ Phase 1: Foundation

### What works (tested by running it, not assumed)
Tested in a real browser (Chromium) at iPhone SE (375 pt) and iPhone 15 (393 pt) widths, with zero errors and no sideways scrolling on any screen.

- **Five switchable themes** from one token file (`src/theme/`). **E "Top 8"** (MySpace-ish, modern) is the default, and A–D are alternates. All five pass readability contrast checks.
- **4-tab navigation** (Home, Pins, Tonight, Circles) with the header: logo, profile avatar, messages and notifications (with unread badges), and a menu. Detail screens use a back button.
- **Signup:** full name, phone, email, city, date of birth (**under 18 is blocked**), password, optional invite code (checked live: "Dominique J. invited you ✓"), and an optional photo.
  - An invite code auto-connects both people and gives each an invite vouch (the inviter's is capped).
  - The first 500 members are Founding Members (this number is in config).
- **Login** with email *or* phone number plus password. A wrong password and an unknown number get the exact same answer, so nobody can use it to find out who's a member. It's also rate-limited.
- **Forgot password:** the email is sent, the link opens a "choose a new password" screen, and the new password works. All of this was tested end to end.
- **Phone verification over Twilio:** it runs in *demo mode* until Twilio keys are added. In demo mode no text is sent and the code is shown on screen (never in production).
- **First-week checklist** popup after first login, calculated from real activity.
- **Home (Phase 1 version):** greeting, plus a live vouch card with tier progress.
- **Profile (basic):** badges, stats, bio, invite code with a Share button, and a "verify your phone" prompt.
- **Messages inbox (read-only)**, **Notifications** (AI items get the ✦ marker), **Menu**, and **Appearance** (theme picker, saved to your account).
- **Database:** all core tables with row-level security (the database's own lock on who can see what).
  - The key rules are enforced *in the database*, not just the app: no vouch without a GPS encounter, one vouch per person ever, pin audience, messaging limits, private data, and server-only timestamps and counters.
- **Demo data:** the full prototype cast with matching vouch counts (Jordan 61, Maya 42…), groups, venues, tonight's plans, pins, chats and notifications. It only runs against a local database.
- **29 automated database tests**, all passing.

### Not done in Phase 1 (on purpose)
- Pins, Tonight and Circles show "Coming in Phase N" placeholders.
- Home's Going Out strip, network pins and AI pick come in Phase 2.
- I haven't run it on a real iPhone yet (see "Needed from Dominique").

---

## Needed from Dominique
1. **Phone test (about 5 minutes).** To open the app on your iPhone, it needs to talk to an online database, not the one inside my cloud session. That means two free accounts:
   - a **Supabase** project (supabase.com, free tier)
   - an **Expo** account (expo.dev, free)

   Then I can publish a build you open in the Expo Go app. The test checklist is in `docs/PHASE-1-PHONE-CHECK.md`.
2. **Twilio account** for real texts: Account SID, Auth Token, and a phone number (about $1/month plus about $0.01 per text). Until then, texting runs in demo mode.

---

## Next: Phase 2 (Social core)
Profiles (full, with Top 8 and profile customization), Pins (Nearby + They're In, radius, categories, likes, replies, bookmarks, share, New Pin with photos), and the complete Home.

---

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-27 | Default theme is **E "Top 8"**, with A–D as alternates | Dominique: "MySpace-ish but modern" |
| 2026-09-27 | Tiers: New Face 0, In the Mix 5, Connector 20, Plugged In 50, Icon 100 | Dominique: keep the idea, modernize the names |
| 2026-09-27 | Pin audience: Everyone / My Network (1st + 2nd) / My Circle (1st) | Dominique: "fix this" |
| 2026-09-27 | GPS check-in never gives a vouch by itself; each person picks their own word | Dominique |
| 2026-09-27 | Premium skips the 5-interaction wait but never skips the intro | Dominique |
| 2026-09-27 | Date requests only go to people you can message | Dominique |
| 2026-09-27 | Date of birth required; under 18 blocked | Dominique |
| 2026-09-27 | First 500 members are Founding Members | Dominique |
| 2026-09-27 | Twilio for phone verification and safety texts (demo mode until keys exist) | Dominique |
| 2026-09-27 | **Each member can give 2 vouches per month** (resets on the 1st, DC time). You can vouch the same friend again after a new GPS meetup. The invite-code vouch doesn't count toward the 2. | Dominique. The number is in config (`vouches_per_month`). |
| 2026-09-27 | **"5 interactions" = 5 back-and-forths.** One back-and-forth = one person says something and the other replies. Before messaging unlocks, that happens on Pins (commenting on someone's pin, and the owner replying in the thread). Double-texting counts once. Likes, RSVPs and being at the same place don't count. | Dominique. The number is in config (`messaging_min_exchanges`). |
| 2026-09-27 | Phone login goes through a server function; accounts are keyed by email | Supabase's own phone login needs a text for every login |
| 2026-09-27 | Screens live in `src/app/` (not `app/`) | This is what current Expo expects |
| 2026-09-27 | Testing: web build + automated checks here, plus Dominique on her phone | No iPhone simulator in this environment (it needs a Mac) |

## Spec vs. prototype conflicts (the spec wins)
See `docs/PHASE-0-PLAN.md` section 1B.
- The Home vouch copy in the prototype says "17 more to Connector tier." With the new tier ladder, 3 vouches shows **"2 more to In the Mix."** The next tier is always the one shown.
