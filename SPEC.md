# Build Prompt: I'm In (for Claude Code)

Paste everything below into Claude Code, or save this file in your project folder as `SPEC.md` and tell Claude Code: "Read SPEC.md and start with Phase 0."

---

## Who you're building for

I'm Dominique, the founder of I'm In. I'm not an engineer, so explain decisions in plain language, show me progress after each phase, and ask me before any choice that's expensive to undo (switching frameworks, changing the database schema after data exists, paid services).

I have a working HTML prototype called `imin-final-v2.html`. I'll put it in the project folder. Use it as the UX and content reference for every screen, flow, and piece of copy. Do not copy its code. It was built in a single file with inline styles and has structural problems. Rebuild everything properly.

## What I'm In is

I'm In is a trust-based social app for going out and meeting real people. Your reputation comes from vouches: people who met you in person and confirmed it. It is a social media app first. Pins (posts) are the heart of the app, and going out, dating, groups, and safety are built on top of the social graph.

The core idea: trust is earned in real life, verified by GPS, and carried through your network. You can only reach people one intro away from you, and every intro puts the connector's reputation on the line.

Launch market: DC Metro (DC, Northern Virginia, Maryland). Build so new cities can be added later.

## Tech stack

Use this unless you have a strong reason not to. If you want to change something, tell me why first.

- **App:** Expo (React Native) with TypeScript, Expo Router for navigation. iOS first, Android should work too.
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions). Enable PostGIS for all radius and proximity logic.
- **AI:** Anthropic Claude API, called only from Supabase Edge Functions. Never put API keys in the app.
- **Payments:** RevenueCat for the Premium subscription.
- **Maps and location:** expo-location for GPS. Mapbox or Apple Maps for map views.
- **Push notifications:** Expo Notifications.
- **Verification (Phase 6):** Persona or Stripe Identity for ID verification, Checkr for background checks. Stub these with clear interfaces until I have accounts.

## Navigation (this is fixed, do not change it)

Bottom tab bar with exactly **4 tabs**:

1. **Home**
2. **Pins**
3. **Tonight**
4. **Circles**

Profile is NOT a tab. It opens from the user's avatar in the top header. The top header on main screens has: logo on the left, then avatar (profile), messages, notifications, and a menu icon on the right.

The tab bar must appear on all 4 main screens. Detail screens (profiles, chats, settings, etc.) use a back button instead.

## Design direction

I don't want this to look like every other dark-mode social app. Build the design system as theme tokens (colors, type, radius, spacing, shadows) in one file so the whole look can change in one place.

Build all four of these as switchable themes. Default to the one I mark with an X. If none is marked, default to A and I'll pick after seeing them on real screens.

- [ ] **A: Warm Editorial.** Warm charcoal background (not pure black), ivory text, deep burgundy/plum primary, serif display font for headlines. Feels like a premium magazine.
- [ ] **B: DC Night.** Navy-black base, amber-gold primary, electric blue reserved for AI features. Confident, cosmopolitan.
- [ ] **C: Blush and Gold.** Dark base with blush tones, gold as the trust/vouch color, frosted glass cards, soft marble texture used sparingly.
- [ ] **D: Trust as Design.** Verified green as a real primary color, lots of white space, monospaced type for numbers and scores, badges that look like credentials. Feels closer to fintech than social.

Rules for every theme:
- Home must stay simple. Five sections max. No crowding.
- One accent color per screen doing the heavy lifting. AI features get their own consistent marker (the ✦ symbol) so users always know when AI is involved.
- Sponsored content is always labeled "Sponsored" or "Featured." Never disguised.
- Works at iPhone SE width and up. Respects safe areas and Dynamic Type.

## Business rules (these matter more than visuals)

**Accounts**
- Anyone can sign up. I'm In is NOT invite-only.
- Invite code is optional. If someone uses one, they're auto-connected to the person who invited them and both get a vouch.
- Signup: full name, phone, email, city, password, optional invite code, optional photo.
- Login: email or phone plus password, forgot password, link to create account.

**Vouches**
- A vouch can only be given to someone you were GPS-confirmed to be with in person (same event or venue, overlapping time window).
- Each vouch includes one word (Welcoming, Authentic, Connector, Reliable, etc.).
- Tiers unlock at vouch counts. Current tier copy: "17 more to Connector tier" at 3 vouches. Define tiers in config so I can adjust.

**Connections**
- 1st degree: people you're directly connected with.
- 2nd degree: people your 1st degree knows. You cannot message them directly. You request an intro from the mutual connection.
- Intros: a user picks two people they know, writes why they should meet, and both must accept. The connector gets credit.

**Date Mode ("I'm On a Date")**
- Can only be activated for someone the user connected with through I'm In (accepted date request or existing connection).
- Both people must be GPS-verified within **1 mile** of each other to activate. If not, show why and don't activate.
- When active: safety check-ins on a timer, trusted contacts on standby, one-tap "I feel unsafe" flow.
- Date request flow: send request (when, vibe, spot) → recipient can Accept, Suggest a Different Time, or Pass → confirmation screens for each outcome. Passing is always graceful, no explanation required.

**Free vs Premium**
- Premium is $14.99/month. Founding members get 3 months free.

| Feature | Free | Premium |
|---|---|---|
| Search radius | 10 mi | 75 mi |
| Messaging | After 5 interactions | Immediately with 1st and 2nd degree intros |
| AI features | 3 uses total | Unlimited |
| Tonight feed placement | Standard | Priority |
| Profile analytics | No | Yes |
| Premium badge | No | Yes |

Put all limits in a config table, not hardcoded.

**Sponsors / Featured Places**
- Venues can be Featured or Sponsored. They appear as labeled cards in Home and Pins feeds, and on a dedicated Featured Places screen.
- Each venue has a member perk (discount, priority entry, etc.) and shows how many people in your network have been there.
- Include a "Become a Partner" inquiry form for venues.
- Build a simple admin view (web is fine) where I can add venues, perks, and placement dates.

**Privacy**
- Behavioral AI features use patterns only: timing, RSVPs, venue history, pin activity. Never message content.
- The one exception is AI profile badges, which can use chat content only if the user opts in. Default is off.
- Location is never shown precisely unless the user chooses precise sharing. Default is approximate.

## Screens and features

Use the prototype for layout and copy. Here's the full list so nothing gets missed.

**Auth:** Onboarding (Log In / Create Account), Login, Signup, first-week checklist modal after first login.

**Home (tab):** Greeting. Going Out Tonight avatar strip with a "Go Live" button first. Vouch count card. I'm On a Date strip (collapsed until active). "From Your Network" with 2 recent posts and a See All link to Pins. One AI pick card. That's it.

**Pins (tab, the heart of the app):**
- Two sub-tabs: **Nearby** and **They're In**.
- Nearby has a radius slider (1 to 50 mi) and shows distance on each pin.
- They're In shows the whole community, not limited by distance, with city labels.
- Category filters: All, Thoughts, Q&A, Photos, Events, Going Out.
- Trending pin banner.
- Every pin has like, comment/reply thread, bookmark, and share.
- New Pin: text, category, up to 6 photos, audience (Everyone, Circle, 1st degree only).
- Bookmarks screen reachable from the Pins header.

**Tonight (tab):** Radius control. Three sub-tabs: Tonight, This Weekend (people going out, not groups), Groups. Post that you're going out. Map view. After an event: GPS vouch flow where you pick who to vouch and their word, then an event recap post with photos and tagged people.

**Circles (tab):** Three sub-tabs.
- **My Circle:** ring diagram (you in the center, 1st degree on the inner ring, 2nd degree dimmed on the outer ring), stats (1st degree, 2nd degree, vouches), Vouches Received list with the word and where it was earned, Request a Vouch, 1st degree list, Make an Intro button.
- **Network:** short explainer of why this tab exists. AI "meet these people" suggestions with an Intro button. Network activity feed. Full 2nd degree list showing who to ask for each intro.
- **Groups:** your groups, groups from your circle (Request), discover more (Join or Request), Create a Group.

**Groups:** group detail, group chat, Create a Group (name, category, description, request-to-join vs open, invite founding members), Join Request (why you want to join, how you found it, shows who you know in the group), request-sent confirmation.

**Profile (from avatar):** your profile with vouches, badges, pins, and settings. Other people's profiles show AI badges and an AI Read summary, vouch count, status, and Vouch / Message buttons (or Icebreakers for 2nd degree).

**Messaging:** inbox, 1:1 chats, group chats. Every 1:1 chat has an "Ask on a Date" button above the keyboard.

**Safety:** check-in, safety report, unsafe flow (multiple steps), report a user, trusted contacts.

**Settings:** notifications, privacy, location and radius, billing, ID verification, photo verification, background check, Trust Monitor.

**Premium screen:** hero with price and trial, six feature cards explaining what free limits and what premium removes, comparison table, Start Free Trial button.

## AI features

Each one lives in its own Edge Function with its own documented module and a plain-English README explaining the method. I may pursue patents on some of these, so keep the logic isolated, clearly named, and well commented.

1. **Icebreaker Generator.** Three conversation starters for a new connection, based on their vouches, groups, recent pins, and mutual connections. Regenerate button. Tap to copy.
2. **Going Out Recommendation.** "Tonight for You": one top pick with reasoning (who'll be there, how it grows your network, vouch opportunity), plus two alternatives. Refresh button.
3. **Vouch Anomaly Detection (Trust Monitor).** Flags vouch velocity spikes, clusters of new accounts vouching each other, GPS mismatches, and reciprocal vouch rings. Shows the user their network health score and anything flagged in their extended network. Runs on a schedule, not on demand.
4. **Behavioral Vibe Match.** Builds a behavioral fingerprint (going-out days and times, chat style by length and response timing only, initiator vs responder, venue size preference) and ranks top matches with scores across schedule overlap, venue match, and behavioral complement. Explain each match in one sentence.
5. **Real-Time Social Momentum Score.** Detects when several people in your network are independently heading to the same area, using going-out posts, RSVPs, and venue proximity clustering. Score from 0 to 100, updates every 30 minutes from 5 PM to 2 AM. Shows the convergence area, who's converging, and a one-tap way to join.
6. **Intro Success Prediction.** When making an intro, shows the likelihood of a real meetup within 30 days, a color-coded bar, reasoning, and signal chips. Updates live as the user changes who's selected.
7. **AI Profile Badges and AI Read.** Descriptive badges (e.g., "Natural connector," "Never cancels," "Night owl") and a short behavioral summary on each profile, generated from vouch words, pin activity, and event history. Chat content only with opt-in.

For every AI feature: count usage against the free-tier limit, cache results sensibly, and show a friendly fallback if the API fails.

## Seed data

Seed the database with the cast from the prototype so the app feels alive during demos: Dominique J. (the user, 3 vouches, Founding Member, Fairfax VA), Maya T., Jordan T., Naomi R. (1st degree), Simone Carter, DeShawn L., Priya Nair, Aaliyah Brooks, Reina Vasquez, Darius Cole, Marcus Bell, Ari M., and others. Groups: OTF Tysons Crew, DC Pickleball Crew, DC Morning Runners. Venues: Bresca, Songbyrd, Tail Up Goat, Founding Farmers. Pull names, vouch counts, badges, and relationships from the prototype. Keep seed data in its own script so it never runs in production.

## Build phases

Work one phase at a time. At the end of each phase, run the app, fix errors, give me a short summary of what works, and wait for my go-ahead.

- **Phase 0: Plan.** Read the prototype and this spec. Give me the database schema, folder structure, and anything in this spec that's unclear or contradicts itself. Don't write app code yet.
- **Phase 1: Foundation.** Expo project, theme system with all four themes, 4-tab navigation, header, auth (signup, login, forgot password), Supabase setup, seed script.
- **Phase 2: Social core.** Profiles, Pins (both sub-tabs, radius, categories, likes, replies, bookmarks, share, new pin with photos), Home.
- **Phase 3: Trust graph.** Connections, 1st and 2nd degree logic, intros, vouches with GPS confirmation, Circles (all 3 sub-tabs).
- **Phase 4: Going out.** Tonight tab, going-out posts, map, groups (create, join, request, group chat), event recap.
- **Phase 5: Messaging and dates.** Inbox, chats, date request flow with all outcomes, Date Mode with 1-mile verification, safety check-ins and unsafe flows.
- **Phase 6: Money and verification.** Premium with RevenueCat and the free-tier limits, sponsors and Featured Places, admin view, ID and photo verification, background check stubs.
- **Phase 7: AI.** All seven AI features as Edge Functions, wired into the screens where the prototype puts them.
- **Phase 8: Polish.** Push notifications, empty and loading states, accessibility pass, performance, and a TestFlight build.

## How I want you to work

- Explain things simply. I'll ask if I want more detail.
- Test on a real iOS simulator after every phase. Don't tell me something works unless you ran it.
- Keep a running `PROGRESS.md` with what's done, what's next, and any decisions we made.
- Ask before adding paid services or anything that needs my accounts or credit card.
- If something in the prototype conflicts with this spec, this spec wins. Tell me when that happens.

Start with Phase 0.
