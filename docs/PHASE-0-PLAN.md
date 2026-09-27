# I'm In: Phase 0 Plan

This is the plan before any app code is written. It has four parts:

1. **Questions I need you to answer.** These are the things in the spec that are unclear or contradict each other. There's a recommended answer for each.
2. **Database schema.** Every table we'll need through Phase 8.
3. **Folder structure.**
4. **Accounts and costs** you'll need, and when you'll need them.

Sources: `SPEC.md` and `reference/imin-final-v2.html`. I read all ~90 screens and modals in the prototype and its script logic. Where the two disagree, the spec wins, and I say so below.

---

## 1. Questions and conflicts

Each item has a **recommendation** in bold. If you're happy with a recommendation, just say "agree with all" and point out the ones you want changed.

### A. Something you need to know first (this changes how testing works)

**A1. I can't run an iOS simulator from here.** The spec asks me to test on a real iOS simulator after every phase. This session runs in a Linux cloud container, and Apple only lets the iOS simulator run on a Mac. What I *can* do after each phase:
- run the TypeScript checks, linting, and automated tests
- run the app's **web build** in a real browser (Chromium), click through the flows, and send you screenshots at iPhone SE and iPhone 15 sizes
- run the database migrations and seed script against a local Supabase

What I can't do: confirm native-only features like GPS, push notifications, camera, and payments on an actual iPhone.
**Recommendation: after each phase you open the app on your own iPhone with Expo Go (a free app, you scan a QR code) and spend about 5 minutes on a short checklist I'll give you. For Phase 8 (TestFlight), either you run the build from a Mac, or we use Expo's cloud build service (EAS), which doesn't need a Mac.** I won't say something "works on iOS" unless one of us has actually run it there.

### B. Rules that contradict each other

**B1. Invite codes give a vouch without GPS.** The spec says a vouch can *only* be given after a GPS-confirmed in-person meeting. It also says using an invite code gives both people a vouch.
**Recommendation: keep the invite vouch, but store it as a separate type (`invite`) and show it as "Invited by Maya" instead of a word badge. It counts toward the vouch total, but Trust Monitor watches it (invite chains are the easiest way to farm fake vouches). Cap it at 1 invite vouch per person received.**

**B2. Automatic two-way vouches vs. "each vouch has one word."** The prototype's GPS Vouch and Date Check-In screens say "Confirm you met up and you *both earn a vouch*." But the spec says every vouch comes with a word, chosen by the person giving it. Automatic two-way vouches also look exactly like the "reciprocal vouch rings" Trust Monitor is supposed to catch.
**Recommendation: GPS confirmation only *unlocks* the ability to vouch. Each person then separately picks whether to vouch and which word to use. The prototype copy changes to "Confirm you met up. You can both vouch for each other."**

**B3. Messaging 2nd-degree people.** The spec says you *can't* message 2nd-degree people directly, you have to ask for an intro. But the Premium row says "Immediately with 1st and 2nd degree intros," and the prototype's Premium screen says "reach out to 1st and 2nd degree connections immediately."
**Recommendation: Premium never lets you message 2nd degree without an intro. What Premium does is skip the 5-interaction wait: once an intro is accepted (or you're 1st degree), you can message right away. The Premium screen copy changes to match.**

**B4. Date requests to 2nd-degree people.** In the prototype, you send a date request to DeShawn, who is 2nd degree ("via Jordan"). Date requests are also sent from the "Ask on a Date" button in a chat, and you can't chat with 2nd degree.
**Recommendation: you can only send a date request to someone you're allowed to message (1st degree, or an accepted intro). In the seed data, DeShawn becomes an accepted Jordan intro so the demo still works.**

**B5. Date Mode eligibility.** The spec says Date Mode works with "an accepted date request or an existing connection." The prototype's Date Mode list includes Marcus with "Date request pending."
**Recommendation: follow the spec. A pending request doesn't count by itself. Marcus still appears because he's a 1st-degree connection (Maya introduced you).**

**B6. Home has more than five sections.** The spec lists: greeting, Going Out Tonight strip, vouch card, I'm On a Date strip, From Your Network, and AI pick. That's six if the greeting counts. Sponsored cards also have to "appear in Home feeds," which would make seven.
**Recommendation: the greeting is a header, not a section, so there are five sections. The Date strip is hidden entirely until Date Mode is active (not shown collapsed). Sponsored content takes one of the two slots inside From Your Network, clearly labeled, no more than one at a time.**

**B7. Pin audience options don't match.** The spec says audience is "Everyone, Circle, 1st degree only." The prototype says "Nearby, They're In, My Circle only." It's also unclear how "Circle" is different from "1st degree only."
**Recommendation: three options: Everyone (shows in Nearby *and* They're In), Circle (your 1st and 2nd degree), and 1st degree only.** Please confirm, since this is a database rule that's annoying to change later.

**B8. Radius ranges don't agree anywhere.**
- The Pins Nearby slider goes 1 to 50 mi (spec)
- The Tonight slider goes 1 to 75 mi (prototype)
- The Location settings slider goes 1 to 75 mi with **15 mi** as the default, which is more than the free limit
- The free limit is 10 mi and Premium is 75 mi

**Recommendation: every slider runs from 1 mi to your plan's limit. Free users see the rest of the track as locked with a small "Premium" tag. The default is 5 mi. Pins Nearby goes up to 50 mi even for Premium. They're In has no radius at all (spec).** All of these numbers live in the config table.

**B9. "This Weekend" shows group events.** The spec says This Weekend is "people going out, not groups," but the prototype's This Weekend section includes group events (OTF class, Morning Runners, Pickleball).
**Recommendation: This Weekend shows people's going-out posts plus one-off events. Recurring group events only show in the Groups sub-tab.**

**B10. AI labels mention chat.** Every AI Profile card in the prototype says "Generated from vouches, chat & pins." By default, chat isn't allowed.
**Recommendation: the label says "Generated from vouches, pins & events" and only adds "& chat" for users who opted in.**

**B11. "Chat style: avg 3.2 sentences."** Vibe Match counts sentences. Counting sentences means reading the message text.
**Recommendation: when a message is sent, the server records only its character length and reply time. AI features see those numbers and never see the text. The UI shows "Short / Medium / Long messages" instead of sentence counts.**

### C. Things the spec doesn't define (please decide)

**C1. Tiers.** The only known point is Connector at 20 vouches. The prototype also shows words like "Connector · DC," "Leader · DC," "Welcoming · DC," "Foodie," and "Adventurer" as profile titles, which look like a person's most common vouch word, not a tier. The AI screen also says Connector tier "unlocks full search," and the checklist says steps "unlock Full Access." Neither is in the spec.
**Recommendation: tiers are Newcomer (0), Regular (5), Connector (20), Leader (50), Anchor (100). For now tiers are just a badge and don't unlock features, so nothing competes with Premium. The profile title is the person's most-received vouch word plus their city ("Connector · DC"). I'll remove the "unlocks full search" and "Full Access" copy.** All the numbers go in a config table.

**C2. What counts as an "interaction"** for the free 5-interactions-before-messaging rule?
**Recommendation: any of these between two specific people, counted both ways: a reply on the other person's pin, a like on their pin, an RSVP to the same event, a GPS co-presence, or an accepted intro. Five total unlocks messaging.**

**C3. What counts as "3 AI uses total"?** Some AI features run on their own (Trust Monitor, Momentum, profile badges). Intro Prediction updates every time you change the selection, so it would use up 3 credits in seconds.
**Recommendation: only actions *you* start count: generating icebreakers, refreshing Tonight for You, opening Vibe Match, and sending an intro that used Prediction (counted once when it's sent, not on every tap). Trust Monitor, Momentum, and profile badges are always free, because they're what make the network feel trustworthy.**

**C4. Who is a Founding Member?**
**Recommendation: anyone who signs up before a launch date you choose (stored in config), or the first N members, whichever comes first.** Tell me the date or number.

**C5. Age and 18+.** Profiles show ages (Maya, 28), and the app includes dating features, but signup doesn't ask for a date of birth. The App Store requires dating and meetup apps to block minors.
**Recommendation: add date of birth to signup, block anyone under 18, and show age on profiles only if the user chooses to. Pronouns are optional and set on your profile after signup.**

**C6. Phone number verification.** Signup collects a phone number. Checking that it's real means sending a text code, which costs money (Twilio, about $0.01 per text, set up through Supabase).
**Recommendation: in Phase 1, save the phone number without checking it. Turn on text-code verification before launch, once you're OK with the Twilio cost.**

**C7. Texting trusted contacts.** The safety flow says "Your trusted contacts have been texted." Trusted contacts (Mom, Kira) aren't app users, so this also needs Twilio. Safety is not the place to fake things.
**Recommendation: until Twilio is set up, the app opens your phone's own Messages app with the message and your location already filled in, and you tap send. That works with no service. "Call 911" opens your phone's dialer. Automatic texting comes once Twilio is approved.**

**C8. GPS vs. "approximate by default."** Vouches and Date Mode need a real GPS reading, but the spec says location is approximate by default.
**Recommendation: "approximate" describes what *other people see*. The server can still check an exact reading for a vouch or Date Mode, but that exact point is never shown to anyone, is deleted after 30 days, and is collected only while the app is open (no background tracking). Distances shown on pins are rounded ("~0.5 mi") and pin locations are snapped to a roughly quarter-mile grid, so nobody can work out someone's home from distances.**

**C9. Date Mode needs both people's location.** To check that two people are within 1 mile, *both* phones have to share a location reading at about the same time.
**Recommendation: tapping "Activate" pings your date's phone ("Dominique wants to start Date Mode. Confirm you're here"). It activates only when both readings are within 1 mile and taken within 10 minutes of each other. If it doesn't activate, the screen says exactly why ("DeShawn hasn't confirmed yet," "You're 2.4 mi apart").**

**C10. Who can create a group?** The prototype says "Verified members only."
**Recommendation: photo-verified members can create groups.**

**C11. Paying for background checks.** Apple takes a cut of digital purchases (Premium), and that has to go through App Store billing, which is why we use RevenueCat. A background check is a real-world service, so it can be paid by card through Stripe. The prototype's Billing screen shows a Visa card for Premium, which isn't how App Store subscriptions work.
**Recommendation: the Billing screen shows your plan and a "Manage in App Store" button. The background check is paid by card through Stripe in Phase 6.**

**C12. Reports shown to users.** One prototype screen says a report is "likely dismissed based on prior false report history from reporter." If users can see that, it leaks moderation details.
**Recommendation: users only see "Under review / Resolved." Moderation notes are admin-only.**

**C13. Trust Monitor shows 3rd-degree accounts.** The spec's network stops at 2nd degree, but the prototype flags a 3rd-degree user.
**Recommendation: flagged accounts outside your 2nd degree are anonymous ("an account 3 steps from you"). You can't see who they are, only that the network caught them.**

**C14. The "Feed" screen.** The prototype has a separate Feed screen (sponsored cards, vouch posts). The spec doesn't list it, and Pins covers it.
**Recommendation: drop Feed. Its useful parts move elsewhere: sponsored cards go into Pins, "Naomi vouched for Aaliyah" posts go into the Network activity feed, and "Join her" buttons go onto going-out pins.**

**C15. Going Out pins.** "Going Out" is a pin category, but the New Pin screen has no Going Out option.
**Recommendation: posting "I'm going out" on the Tonight tab automatically creates a Going Out pin. The New Pin screen keeps four types: Thought, Question, Photos, Event.**

**C16. Maps: Mapbox or Apple Maps?**
**Recommendation: `react-native-maps`, which uses Apple Maps on iPhone. It's free and needs no account. Android would need a free Google Maps key later. We'd switch to Mapbox only if we want a custom-styled map.**

**C17. Where the admin view lives.**
**Recommendation: a small, separate web app in `admin/`, open only to admin accounts. It won't be in the phone app. Built in Phase 6.**

**C18. The prototype's red accent** (`#D62828`) and Syne font don't match any of the four themes. As the spec says, none are marked, so **Theme A (Warm Editorial) is the default** and all four can be switched from Settings (and a dev menu).

**C19. Premium claims.** "Premium badges get 2× more inbound vouch requests" is a number we can't back up yet. **Recommendation: remove it until we have real data.** "Profile analytics: see who viewed your profile" also has a privacy cost. **Recommendation: show view *counts* and trends, not names.**

### D. Small prototype inconsistencies I'll resolve quietly
- Circles says "12" 2nd-degree people but only lists 6. The seed data will include 12.
- Some names are shortened differently in different places ("Simone C." / "Simone Carter"). The seed data uses one canonical name for each person.
- Tonight and Circles both have a Groups tab. That's what the spec says, so both stay, and they share the same component.

---

## ✅ Dominique's answers (2026-09-27), these are now final

| # | Question | Decision |
|---|---|---|
| A1 | Testing without an iOS simulator | **Agreed.** Web build + screenshots from me, a 5-minute Expo Go checklist for Dominique after each phase. |
| B1/B2 | GPS and vouches | **GPS check-in never gives a vouch by itself.** It only *unlocks* the option. Each person decides whether to vouch and picks their own word. The invite-code vouch stays as a separate `invite` type (capped at 1, watched by Trust Monitor). |
| B3 | Premium and 2nd degree | **Agreed.** Premium skips the 5-interaction wait. It never skips the intro. |
| B4 | Date requests | **Agreed.** Only to people you're allowed to message. |
| C1 | Tier names | Same idea, modern names (see below). |
| C2 | Interactions | **Updated:** an interaction is a back-and-forth (one person says something, the other replies). Messaging unlocks after 5. See PROGRESS.md. |
| C3 | AI uses | **Use the definition proposed in C3.** |
| — | Vouch limit | **Each member can give 2 vouches per month.** Repeat vouches for the same friend are allowed after a new meetup. |
| C5 | Age | **Date of birth is required at signup. Under 18 is blocked.** |
| C6/C7 | Twilio | **Add Twilio** for phone verification codes and safety texts. Built behind an interface so it works in "demo mode" until the Twilio account keys are added. |
| B7 | Pin audience | **Fixed** (see below). |
| C4 | Founding members | **The first 500 members.** |
| C18 | Look | **New default theme: "MySpace-ish, but modern"** (see below). |

Everything else in section 1 goes with the recommendation.

### Tier ladder (all numbers and names live in the `vouch_tiers` config table)
| Vouches | Tier |
|---|---|
| 0 | **New Face** |
| 5 | **In the Mix** |
| 20 | **Connector** (kept, since the Home copy "17 more to Connector" depends on it) |
| 50 | **Plugged In** |
| 100 | **Icon** |

### Pin audience (fixed)
Three options, using words the app already uses elsewhere:
| Option | Who sees it |
|---|---|
| **Everyone** | Anyone nearby (Nearby tab) and the whole community (They're In tab) |
| **My Network** | Your 1st and 2nd degree |
| **My Circle** | Your 1st degree only |

This matches the Circles tab, where "My Circle" is your 1st degree and "Network" is your 2nd degree.

### Look (updated)
~~Theme E "Top 8"~~ was dropped. The default is now **Original**: the prototype's own colors and fonts. Themes A–D stay as switchable alternates.

### Messaging (updated)
People connected through an accepted intro can message each other right away. Everyone else on the free plan needs 5 back-and-forths first.

---

## 2. Database schema

Everything runs on Supabase Postgres with PostGIS turned on. Here's what the terms mean:
- **Tables** store data.
- **Views/functions** calculate things (like "who is 2nd degree to me") so the app never stores anything that can get out of date.
- **RLS** (Row Level Security) is the database's own lock: every table gets rules about who can read and write each row, so the phone app can never see data it shouldn't, even if the app had a bug.
- `geography(Point)` is a PostGIS map point.

### Config (you can change these without new code)
| Table | Purpose |
|---|---|
| `cities` | id, name, slug, region (DC / NoVA / MD), center point, active. New cities are just new rows. |
| `app_config` | key → JSON value. Founding-member cutoff, check-in timer defaults, momentum hours (5 PM to 2 AM), and similar. |
| `plan_limits` | key, free_value, premium_value: `search_radius_mi` (10/75), `pins_radius_max_mi` (50/50), `messaging_min_interactions` (5/0), `ai_uses` (3/unlimited), `tonight_priority`, `profile_analytics`, `premium_badge`. |
| `vouch_tiers` | name, min_vouches, sort order. |
| `vouch_words` | word, active. Welcoming, Authentic, Connector, Thoughtful, Reliable, Adventurous, Community, Generous… |

### People
| Table | Purpose |
|---|---|
| `profiles` | One row per user, linked to the Supabase login. Holds full_name, display_name ("Maya T."), date of birth, show_age, pronouns, bio, avatar_url, city_id, approx_location (snapped point), location_precision (`approximate` default / `precise`), invite_code, invited_by, is_founding_member, role (`user`/`admin`), id/photo verified dates, ai_chat_opt_in (default **false**), theme. |
| `user_settings` | Notification toggles, privacy toggles (show in nearby, allow intro requests, show vouch count, show venue, discoverable), and preferred radius. |
| `push_tokens` | Device tokens for notifications. |
| `blocks` | blocker, blocked. Blocked users disappear from each other everywhere. |

### Trust graph
| Table | Purpose |
|---|---|
| `connections` | 1st-degree links. One row per pair, plus a source (`invite` / `intro` / `event` / `group` / `manual`) and a date. **2nd degree is calculated** by a database function that also returns "who to ask" (the mutual connection). |
| `intros` | connector_id, person_a, person_b, message, a_status, b_status, predicted_score. When both accept, a connection is created with source=`intro` and the connector gets credit. |
| `intro_requests` | "Ask Maya → intro me to Simone": requester, target, via_user, status. |
| `location_pings` | **Private.** user_id, point, accuracy, time, venue/event. The phone sends these only during a check-in, a vouch, or Date Mode. Nobody can read them, not even the users themselves. They're deleted after 30 days. |
| `encounters` | Created by the server when two people's pings overlap (same venue or event, or within about 150 m, at overlapping times). This is the proof that makes a vouch possible. |
| `vouches` | voucher, vouchee, word_id, encounter_id, type (`gps` / `invite` / `date`), status (`active` / `flagged` / `revoked`). The database **rejects** a `gps` vouch that doesn't have a matching encounter, so the rule is enforced even if the app has a bug. |
| `vouch_requests` | "Request a vouch": requester, target, encounter_id, status. |
| `interactions` | Per-pair back-and-forth count for the free messaging unlock (5). Updated automatically when people reply to each other on Pins. |

### Social (Pins)
| Table | Purpose |
|---|---|
| `pins` | author, category (`thought` / `question` / `photos` / `event` / `going_out` / `recap`), body, audience (`everyone` / `network` / `circle`), snapped location, city_id, optional event / venue / going-out link, trending score, deleted_at. |
| `pin_photos` | Up to 6 per pin (enforced). Stored in Supabase Storage. |
| `pin_likes`, `pin_replies`, `pin_bookmarks` | Likes, reply thread, and saved pins. |
| `pin_tags` | People tagged in an event recap. |

### Going out
| Table | Purpose |
|---|---|
| `venues` | name, address, neighborhood, city, point, category, price, description. |
| `going_out_posts` | user, when (`tonight` / `weekend` / specific time), venue or free text, vibe tags (solo, small group, drinks, dinner, music), expires_at, priority flag (Premium). |
| `events` | host, optional group, venue, title, start/end, capacity, visibility. |
| `event_rsvps` | Who's going. |

### Groups
| Table | Purpose |
|---|---|
| `groups` | name, category, description, join_type (`request` / `open`), owner, city, icon. |
| `group_members` | role: owner / admin / member. |
| `group_join_requests` | why, how_found, status, reviewed_by. |

### Messaging
| Table | Purpose |
|---|---|
| `conversations` | type (`direct` / `group`), group_id. |
| `conversation_members` | Who's in it, last read time. |
| `messages` | sender, body, **char_length**, **reply_seconds**, created_at. Only those two number columns are ever passed to AI. The text itself is available to AI only for users who opted in. Delivered live via Supabase Realtime. |

### Dates and safety
| Table | Purpose |
|---|---|
| `date_requests` | from, to, when option + time, vibe, venue or spot text, status (`pending` / `accepted` / `countered` / `passed` / `cancelled`), parent_id (a counter-proposal points to the request it's answering). |
| `date_sessions` | Date Mode: the two people, both GPS readings, verified distance, activated/ended times, check-in interval, next check-in due. |
| `safety_checkins` | Each "I'm safe" tap and each missed check-in. |
| `trusted_contacts` | name, phone (not app users). |
| `safety_alerts` | The level reached in the unsafe flow (unsafe → leaving → emergency), whether location sharing is on, when it was resolved. |
| `date_reviews` | The private "How did it go?" answer. |
| `reports` | reporter, reported user, reason, details, status. `admin_notes` is visible to admins only. |

### Money and verification
| Table | Purpose |
|---|---|
| `subscriptions` | A copy of each user's RevenueCat status (kept current by a webhook). The app reads "is this user Premium?" from here. |
| `verifications` | kind (`id` / `photo` / `background`), provider (`persona` / `stripe_identity` / `checkr` / `stub`), status, provider reference. No ID images are stored by us. |
| `venue_placements` | venue, kind (`featured` / `sponsored` / `top_pick`), member perk, starts/ends, where it shows (home, pins, featured). |
| `partner_inquiries` | The "Become a Partner" form. |

### AI
| Table | Purpose |
|---|---|
| `ai_usage` | user, feature, time. Counted against `plan_limits.ai_uses`. |
| `ai_cache` | feature + subject → result, expiry. For example, icebreakers for the same pair are cached for 24 hours unless you tap Regenerate. |
| `ai_profiles` | badges, AI Read summary, what data was used, when it was generated. |
| `behavior_fingerprints` | Weekly Vibe Match fingerprint for each user. |
| `trust_flags` | kind (velocity / new-account cluster / GPS mismatch / reciprocal ring), accounts involved, severity, status. |
| `network_health` | Per-user score (0 to 100) and when it was calculated. |
| `momentum_snapshots` | Per-user score, area, who's converging, calculated every 30 minutes from 5 PM to 2 AM. |

### Other
| Table | Purpose |
|---|---|
| `notifications` | In-app notification list, read state. |
| `checklist_progress` | Not a table: the first-week checklist is **calculated** from real data (used an invite? got a vouch? posted a pin? made an intro?). |

---

## 3. Folder structure

> **Update (Phase 1):** screens live in `src/app/` instead of `app/`, which is what current Expo expects. Everything else is as shown below.

```
Business1/
├── SPEC.md                      your spec
├── PROGRESS.md                  running log: done / next / decisions
├── reference/imin-final-v2.html the prototype (reference only, never imported)
├── docs/                        plans like this one
│
├── app/                         SCREENS (Expo Router: each file is a screen)
│   ├── (auth)/                  onboarding, login, signup, forgot-password
│   ├── (tabs)/                  the 4 tabs: home, pins, tonight, circles
│   ├── profile/                 me, [userId], edit
│   ├── pins/                    [pinId], new, bookmarks
│   ├── tonight/                 going-out, map, recap, gps-vouch
│   ├── circles/                 make-intro, request-vouch, search
│   ├── groups/                  [groupId], new, join, discover
│   ├── messages/                inbox, [conversationId]
│   ├── dates/                   request, received, counter, confirmed, passed, date-mode
│   ├── safety/                  check-in, unsafe (steps), report, contacts
│   ├── settings/                notifications, privacy, location, billing, verification…
│   ├── ai/                      tonight-for-you, icebreakers, vibe-match, momentum, trust-monitor
│   ├── premium.tsx
│   └── places/                  featured places, venue detail, become a partner
│
├── src/
│   ├── theme/                   ONE place for the look: tokens + themes A, B, C, D
│   ├── components/              shared building blocks (Header, Avatar, PinCard, Chip, AIMarker ✦, SponsoredLabel…)
│   ├── features/                logic grouped by area (pins, vouches, dates, safety…)
│   ├── lib/                     Supabase client, location helpers, RevenueCat wrapper
│   ├── config/                  reads plan limits / tiers from the database
│   └── types/                   generated database types
│
├── supabase/
│   ├── migrations/              database schema, one numbered file per change
│   ├── functions/               Edge Functions (server code)
│   │   ├── ai-icebreakers/          index.ts + README.md (plain-English method)
│   │   ├── ai-tonight-for-you/
│   │   ├── ai-trust-monitor/        (scheduled)
│   │   ├── ai-vibe-match/
│   │   ├── ai-momentum/             (scheduled, every 30 min, 5 PM–2 AM)
│   │   ├── ai-intro-prediction/
│   │   ├── ai-profile-badges/
│   │   ├── _shared/                 Claude client, usage counting, caching, fallbacks
│   │   ├── gps-encounters/          turns location pings into encounters
│   │   ├── date-mode-verify/        1-mile check
│   │   ├── revenuecat-webhook/
│   │   └── verification-stubs/      Persona / Stripe Identity / Checkr interfaces
│   └── seed/                    seed script (dev only, refuses to run against production)
│
└── admin/                       small web admin (Phase 6)
```

The seven AI features each get their own folder with a README that explains the method in plain English. That keeps the logic separate and easy to document if you pursue patents.

---

## 4. Accounts and costs

I'll ask before using any of these. Here's what's coming so there are no surprises:

| What | When | Cost |
|---|---|---|
| Supabase | Phase 1 (I'll use a local copy until you create a project) | Free tier is fine for building. About $25/mo at launch. |
| Expo / EAS | Phase 1 (free), Phase 8 for cloud builds | Free tier covers what we need |
| Apple Developer Program | Phase 8 (TestFlight) | $99/year, **needs your account** |
| Anthropic API | Phase 7 | Pay per use, probably a few dollars a month while testing |
| RevenueCat | Phase 6 | Free up to $2.5k/mo in revenue |
| Twilio (text codes and safety texts) | Before launch | About $0.01 per text plus a phone number (about $1/mo) |
| Stripe Identity or Persona | Phase 6, stubbed until then | About $1.50 per verification |
| Checkr | Phase 6, stubbed until then | Per check; users pay $9.99 |
| Google Maps key (Android only) | Later | Free at our volume |

---

## What happens next

Once you answer section 1 (or say "agree with all"), I start **Phase 1**: Expo project, the four themes, the 4-tab navigation with header, signup/login/forgot password, Supabase setup, and the seed script.
