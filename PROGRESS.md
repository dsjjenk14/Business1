# I'm In: Progress

## Status
**Current phase:** Phase 2 (Social core) is done and waiting for Dominique's go-ahead. Next is Phase 3 (Trust graph).

---

## ✅ Phase 2: Social core

### What works (tested by clicking through it in a browser at iPhone SE and iPhone 15 sizes: zero errors, no sideways scrolling)
- **Pins tab**
  - **Nearby:** a radius slider from 1 to 50 mi. The free plan stops at 10 mi with a "⭐ Premium goes to 50 mi" note, and the server enforces the cap even if the app asks for more. Every pin shows its approximate distance.
  - **They're In:** the whole community at any distance, with city labels (NYC, Chicago, Atlanta…).
  - **Filters:** category chips (All, Thoughts, Q&A, Photos, Events, Going Out) and a 🔥 Trending banner.
  - **Every pin** can be liked, replied to (in a thread), bookmarked, and shared.
- **New Pin:** four types, text, up to 6 photos, and who sees it (Everyone / My Network / My Circle). Photos are private and load only for people allowed to see the pin.
- **Pin thread:** the replies, a reply box, and edit or delete for the pin's author.
- **Bookmarks:** reachable from the Pins header and your profile.
- **Profiles:** yours and everyone else's.
  - Photo, verified check, age · area · pronouns, and badges (top vouch word, tier, Founding Member, Premium, ID Verified).
  - Vouches / Circle / Groups counts, the "going out tonight" status, and About.
  - **Vouched by**, with each person's word and where the vouch was earned; groups; pins.
  - On other people's profiles: "In your circle" or "2nd degree · you both know Jordan T., Maya T."
  - Buttons: **+ Vouch** and **Message** (Message stays locked until you've had 5 back-and-forths), or **Request Intro** for 2nd degree. These show "coming in Phase 3/5" notes for now.
- **Edit profile:** photo, display name, headline, bio, pronouns, neighborhood, city, and whether your age shows.
- **Home (complete)**
  - Greeting.
  - **Going Out Tonight** strip: a working **Go Live** button first, then your circle (green ring) and network (blue ring).
  - Vouch card.
  - **From Your Network:** the 2 latest pins, with See All.
  - **Pick for tonight:** the event most of your network is going to, with a working RSVP.
- **Go Live:** where, vibe, and a note. It drops a "Going Out" pin and ends by itself at 4 AM. You can end it early.

### Privacy and security fixes made in this phase
- **Location:** pin, going-out and profile locations are rounded to a roughly quarter-mile grid *by the server*, whatever the phone sends. Exact locations are never stored for display.
- **Your network stays private:** some Phase 1 database helpers (like "who is this person connected to?") could be called by any signed-in member on anyone, which would let someone map out other people's networks. They're now private: tested, and they return "not found" when called directly.
- **Privacy settings are respected:** a hidden vouch count stays hidden on your profile, and a hidden venue stays hidden in "going out tonight."
- **Bug fixed:** creating a pin failed a permission check at the moment the app read back the new pin. It's fixed, and a test was added so it can't return.
- **Times** for events and going-out plans always show in DC time (a visitor from another timezone sees "7:30 PM", not their own local time).

### Tests
**57 automated database tests**, all passing. They run on GitHub on every upload (the Checks workflow), along with typecheck, lint and the color check.

### Not in Phase 2 (by design, per the build plan)
- Vouching, intros, and the Circles tab: Phase 3.
- The Tonight tab, map, and groups: Phase 4.
- Chats and dates: Phase 5.
- Sponsored cards in feeds: Phase 6.
- The **✦ AI** pick: Phase 7. Home currently shows a *rule-based* pick with no AI label, so it's never presented as AI.

---

## ✅ Phase 1: Foundation

### What works (tested by running it, not assumed)
Tested in a real browser (Chromium) at iPhone SE (375 pt) and iPhone 15 (393 pt) widths, with zero errors and no sideways scrolling on any screen.

- **Five switchable themes** from one token file (`src/theme/`). **Original** (the prototype's colors and fonts: Bebas Neue + Syne, red, green, gold) is the default, and A–D are alternates. All five pass readability contrast checks.
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
1. **Phone test.** Accounts are created and connected to GitHub. Remaining: add the secrets in GitHub (see `docs/DEPLOY.md`, about 15 minutes), then say the word and I'll open the pull request to `main`. Merging it deploys everything. After that, go through `docs/PHASE-1-PHONE-CHECK.md`.
2. **Twilio account** for real texts: Account SID, Auth Token, and a phone number (about $1/month plus about $0.01 per text). Until then, texting runs in demo mode.

---

## Next: Phase 3 (Trust graph)
Connections, 1st and 2nd degree, intros (which unlock messaging right away), vouching after GPS-confirmed meetups (2 per month), and the Circles tab (My Circle, Network, Groups).

---

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-27 | ~~Theme E "Top 8"~~ removed, along with Top 8 friends and profile customization | Dominique: "No Top 8" |
| 2026-09-27 | Default theme is **Original** (the prototype's colors: #0C0C0C, red #D62828, green #4ADE80, gold #D4AF37, blue #64A0FF; Bebas Neue + Syne). A–D stay as alternates. | Dominique: "change to the original color scheme" |
| 2026-09-27 | In the Original theme, gray secondary text is 62% white (the prototype used 40%) | 40% was too faint to read comfortably (it failed the accessibility contrast check) |
| 2026-09-27 | AI features use the Original palette's blue (#64A0FF) with the ✦ marker | The spec wants AI visually distinct; the prototype used red, which is also the main button color |
| 2026-09-27 | **People connected through an accepted intro can message right away**, no back-and-forths needed | Dominique |
| 2026-09-28 | Nearby and They're In show "Everyone" pins; My Network and My Circle pins show on Home, in profiles, and in threads for the people allowed to see them | Keeps the community feeds public, as intended |
| 2026-09-28 | Posting "going out" (Go Live) also drops a Going Out pin, visible to Everyone unless you've turned off "Show in nearby feed" (then My Network) | Decision C15 |
| 2026-09-28 | Home's tonight pick is rule-based until Phase 7, with no ✦ AI label | Never show AI branding on something that isn't AI |
| 2026-09-28 | Event and going-out times show in DC time | The launch market is DC, and events happen in local time |
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
