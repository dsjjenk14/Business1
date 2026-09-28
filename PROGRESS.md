# I'm In: Progress

## Status
**Current phase:** Phase 8 (polish) is done, except the TestFlight build itself, which needs your Apple Developer account (`docs/TESTFLIGHT.md`). Phase 7 (AI) was skipped for now, at your request; it needs your OK for the paid Claude API. See `docs/LAUNCH-CHECKLIST.md` for what's needed before launch.

---

## ✅ Payments: Premium and ticket sales (built; off until Stripe is connected)
**Circles stays Circles.** The tester round renamed it to "Friends"; that's undone everywhere (the tab, the menu, posts, I'm In, profiles, search, events). The other tester-round changes stay.

**Premium**
- The Premium screen has **Get Premium · $14.99/month**. It opens Stripe's secure checkout (card details never touch our app or servers).
- Subscribers see **Manage or cancel**, which opens Stripe's page to change the card or cancel.
- A Founding Member's free months are never shortened by paying.

**Selling tickets (I'm In keeps 12%)**
- **Settings → Payouts:** a host connects a payout account through Stripe (name, date of birth, bank account). Then they can sell tickets.
- **New event** and the **event page:** the host adds a ticket price (up to $500). The host sees "You get $22 per ticket" on a $25 ticket.
- Guests tap **Get ticket · $25**. Once paid, they're on the list and both sides get a notification. Paid events can't be joined for free.
- The host sees **who bought** and can **Refund** anyone in full (including the 12%). The guest is taken off the list and told.
- If an event fills up while someone is paying, they're **refunded automatically**.
- **Settings → My tickets** lists what you've bought. **Admin → Ticket fees** shows what I'm In earned each month.
- The 12% is one setting (`platform_fee_percent`), changeable without an app update.

**Costs:** Stripe charges about 2.9% + 30¢ per card payment, and nothing monthly. On tickets that comes out of I'm In's 12%.

**To turn it on:** create a Stripe account and follow `docs/PAYMENTS.md` (about 30 minutes). Until then, pay buttons say "Payments aren't turned on yet."

Migration 027, test file 015. **All 301 database tests pass.** Also checked:
- Stripe's messages to the app, sent signed on this computer. A forged one is rejected. A paid ticket is recorded and the guest added. Premium is extended. A sold-out ticket is sent for a refund.
- Browser tests: buying a ticket and Premium with payments off, the host's view with ticket holders and Refund, and the Payouts screen.

---

## ✅ Tester round: changes from 10 testers (ages 21–45)
**New members don't hit a wall anymore**
- A **welcome tour** runs once: 4 short cards (what I'm In is, Pins, Friends and vouches, I'm In), then **Pick your look** (Dark or Light).
- **Home for newcomers** (fewer than 3 friends): "Add friends" tips, **Popular on I'm In** (posts from everyone), **Groups to join** (one-tap Join), and **Events near you**. These disappear once you have friends.
- **Messaging unlocks after 3 back-and-forths** on pins (was 5). Intros still unlock it right away.

**Plain words** (undone at your request: it's Circles again)
- "Circles" was renamed **Friends** (the tab, the menu, the screen).
- "My Circle / Network" is now **Friends / Friends of friends** everywhere: posts, I'm In, profiles, search, events.
- "1st degree / 2nd degree" is now **Friend / Friend of a friend**.
- Profile stats are **Vouches · Friends · Followers**.

**Location, your call**
- When you post I'm In tonight, you pick **who sees that you're there**: Friends, Friends of friends, or **Only these people** (you choose from your friends). It's also on your night-out card on Tonight.
- Before the phone asks for **"Always" location**, the app explains in plain words why, and what happens if you say no.
- **Default distance is 25 miles** (the slider still goes to 75). The map uses 25 too.

**Hosts and groups**
- **Event waitlists:** when an event is full, tap **Join the waitlist**. If someone drops out, the next person in line gets the spot automatically and gets a notification. Full events on Home show a Waitlist button.
- **Group announcements:** the owner and co-hosts can pin a message to the group, and every member gets a notification. Only members can see it.
- **Co-hosts:** the owner can make any member a co-host (the "…" next to their name), or undo it.

**Everyday polish**
- **Reactions** with our own symbols: Love, Fire, Ha, Wow, Great. Tap the heart to like; tap the smile (or hold the heart) to pick a reaction. The top reactions show on each post.
- **Verified check** next to names on posts.
- **Tonight filters:** chips for Dinner, Drinks, Music, Brunch and more.
- **Quieter notifications for new members:** "people joining your plans" starts off (turn it on in Settings → Notifications).
- The **Privacy screen and Privacy Policy** now explain the usage counts, and the location section now covers "marked there automatically".

**Not done (needs your decision):**
- Shareable **web links** for profiles and events need a website domain (about $12/year) and hosting. Links only open in the app for now.
- **Video posts**.
- **Premium price** (3 testers said $14.99 is high; it's a pricing choice for you, and one setting: `premium_price_cents`).

Migration 026, test file 014. **All 274 database tests pass.** Browser tests passed for:
- signing up as a brand-new member, the tour, and the light look
- the new-member Home, and joining a group from it
- the Friends tab
- Tonight filters and "Only these people"
- reactions
- joining a waitlist
- posting an announcement, and making a co-host

The accessibility check is clean on 9 screens.

## ✅ Home, simplified (Dominique: "That's it")
Home now shows four things and nothing else:
1. **Your friends' pins.** Pins from your circle and people you follow; not yours, not strangers'. The first 5 show, then "Show more".
2. **Likes and replies** people sent you in the last 14 days. Likes are combined per pin ("Alex, Brianna and 7 others liked your pin"), and each reply shows its text. Tap one to open the pin.
3. **Your group events**, with I'm In.
4. **Hosted by friends:** events people in your circle are hosting, with I'm In ("Full" when there are no spots left).

Removed from Home: the people row, the Friends/Everyone switch, live cards, new-friend cards and the partner card. Home still loads in one request and opens from the last saved copy. Migration 025.

## ✅ Messages back at the top; I'm In on shared events
- The **Messages icon is back in the top bar** (with a dot for unread). The bottom bar is Home, Pins, Tonight, Circles again.
- When someone **shares an event as a post**, the post now shows the event (name, time, how many are going) with an **I'm In** button, or "You're in" once you've tapped it.
- Events everywhere else already had I'm In: the event page, Tonight, and the event cards on Home.
- You can't share the same event twice.
- Migration 024. **All 257 database tests pass.**

## ✅ New Home and the product review (Dominique: "make all the changes")
- **The new Home is "what's happening with my people right now."**
  - **People row at the top** (like stories):
    - **Post** comes first, then **I'm In tonight**.
    - Then friends who are **there now** (green ring), **going out** (red ring, shows where), or **posted today** (blue ring).
  - A **Friends | Everyone** switch.
    - Friends means your circle and network, plus the public posts of people you follow.
    - Everyone means the whole community.
  - **One mixed feed:**
    - live moments ("Aaliyah and Jordan are In at Bresca", with Join)
    - posts
    - upcoming events your circle is going to (**I'm In** and **Share to my circle**)
    - "New in your circle: Alex" cards
    - one labeled partner card
  - **Removed:** the greeting, the vouch card (it's on your profile), the going-out strip (it's the people row now), and the Tonight pick (events cover it). The date strip only shows when a date is active or a request is waiting.
  - **Brand-new members** see "Add your first friends" and can switch to Everyone, so Home is never empty.
  - Home loads in **one request** and **opens instantly** from the last saved copy, then refreshes.
- **Slim header:** logo, then Post (+), notifications, your photo, menu. Badges are now **small dots, not numbers**.
- **Messages is a tab** (Home, Pins, Tonight, Messages, Circles), with a dot for unread chats.
- **Posts look like a social app:**
  - Who posted and when sits at the top.
  - **Photos come first, edge to edge** (portrait size), and the text has no quote marks.
  - Like, reply and share sit on the left, bookmark on the right.
  - **Report moved into the "…" menu.**
- **Radius:** a small **"Within 75 mi"** button that opens the slider.
- **Profiles:**
  - At most **two badges** (what people vouch them for, and Founding Member or Premium).
  - Stats are **Vouches · Circle · Followers**.
  - **Follow / Following / Follow back** and **Share profile** buttons.
  - A **Photos grid**, next to "All posts".
- **Follow:**
  - Anyone can follow anyone's public ("Everyone") posts.
  - It never shows circle-only posts, and never unlocks messaging or vouching.
  - Blocking ends it.
  - The person gets a notification.
- **Share an event to your circle:** from Home or the event page. It posts a circle-only event pin.
- **Usage counts:**
  - The app records which features get used: Home opened, posts, messages, group chats made, codes made, connections, I'm In, events joined and shared, follows. It never stores any text.
  - **Admin → More → Usage** shows how many people used each one in the last 7 and 30 days.
  - Records are deleted after 180 days.
- Migration 023, test file 013. **All 255 database tests pass.** The browser test of the whole redesign passed, and the accessibility check is clean on 10 screens.

## ✅ Social app, adding people, group chats (Dominique's changes)
- **More than going out.**
  - Home now opens with **"What's on your mind?"** (post a pin in one tap).
  - Then come the latest 5 pins from your network, or from the whole community while your network is quiet.
  - Then **Your group chats**.
  - Going out, dates, vouches and the tonight pick come after that.
  - The welcome screen leads with "a social app for people you actually know".
- **Adding people** (Circles → **Add someone**, or the person+ icon at the top):
  - **Together right now:** one of you shows a QR code, the other scans it.
    - It counts as meeting in person, so you can vouch for each other straight away.
    - Each code works once, for 5 minutes.
    - Scanning with the phone's own camera also works: it opens I'm In and connects.
  - **Know each other outside the app:** one of you taps **Get a code**, which gives a 6-character code like `BAF-YFG`.
    - Send it however you like; the other person types it in, and you're connected.
    - Each code works once, for 24 hours.
    - A code connection doesn't count as meeting in person, so no vouching until you meet up.
  - Guessing is blocked (10 wrong tries an hour), you can't use your own code, and blocked people can't connect.
  - Meeting up (GPS check-in), intros and invite codes still work as before.
- **Group chats in Messages.**
  - **New group chat**: name it (optional) and pick at least two people from your circle or people you've chatted with (up to 50 in a chat).
  - Inside the chat, the people icon at the top opens the details: rename it, see who's in, add people, or leave.
  - Group chats get push notifications like any message.
- **Tonight:**
  - The **radius slider is back** on Tonight and Pins. It goes from 1 to 75 miles, the same for everyone.
  - The **Groups tab is removed** from Tonight; Groups now live only in Circles, along with "Coming up in your groups".
  - The **I'm Out** button now says **I'm In**.
- Migration 022, test file 012. **All 239 database tests pass**, and the browser test of the whole flow passed with two people.

## ✅ Phase 8: Polish
- **Push notifications.**
  - Your phone registers when you sign in (on iPhone this works in Expo Go too).
  - You get a push for everything that shows in the bell (vouches, intros, date requests, people joining you, safety alerts…) and for every new chat message. Tapping it opens the right screen.
  - The app icon badge shows unread notifications plus chats with new messages.
  - **Settings → Notifications** has six switches (Messages, Date requests, Plans, Pin replies, Meetups and vouches, Intros). Safety alerts always come through, and blocked people never reach you.
  - Only the live database actually sends. Test copies only record what they would have sent.
  - It uses Expo's free push service, so there's no new account and no key.
- **Loading and empty screens.**
  - Soft pulsing placeholder rows instead of "Loading…" text everywhere. They hold still if the phone's Reduce Motion setting is on.
  - Friendly empty states, for example "This event isn't available" and "Nothing here yet".
- **Accessibility.**
  - Checked 22 screens against the web accessibility standard (WCAG 2 AA). All pass, except one small web-only warning on Premium.
  - Fixes made:
    - Red text now uses a slightly lighter red that's easier to read (buttons keep the original red).
    - Avatar initials are brighter.
    - Screen readers now hear which option is selected.
    - Small chips are easier to tap.
- **Speed.**
  - Added 67 database indexes (one for every link between tables that didn't have one), so lookups and account deletion stay fast as the app grows.
  - The unread badges update when you come back to the app or a push arrives, without constant checking.
- **Ready for TestFlight.**
  - Arriving works even with the app closed. The phone watches the places you said I'm In to, and asks for "Always" location right after you tap I'm In.
  - Every permission message is specific to I'm In. Unused ones (microphone, Face ID, motion) are removed, since Apple rejects generic wording.
  - There's a one-button **Actions → TestFlight build** workflow, plus step-by-step instructions in `docs/TESTFLIGHT.md`.
- Migrations 019–021, test file 011. **All 219 database tests pass**, and typecheck, lint and the contrast check are clean.

## ✅ Arriving is automatic; radius is always 75 miles (Dominique's changes)
- **I'm In** is what you tap to say you're going to an event.
- **Arriving is automatic.** While the app is open, every 2 minutes it checks whether you have an event (or a night-out place) coming up. If you do, it reads your GPS, and when you're within about 150 meters (500 feet) the app marks you **there**. This works for events and for the place in your "I'm Out" post.
  - The event page shows "You're there".
  - The Tonight list shows "There now". Only your circle sees it (or your network, if you pick that).
  - If you have no plans, it never reads your GPS.
  - An "I'm here" button stays as a backup, for when GPS is off or the event has no place on the map.
  - **Still to do:** marking you there while the app is closed needs "background location". That works only in the App Store version, not in Expo Go. We'll turn it on with the TestFlight build.
- **Radius is always 75 miles** for everyone, on Pins, Tonight and the map. The sliders are gone, and it's no longer a Premium perk.
- Migration 018 and test file 010. All 207 database tests pass.

## ✅ Phase 6: Money and verification

### What works
Tested in the browser as an admin (Dominique) and as a member (Maya), with no errors and no sideways scrolling. The one browser error in the run came from a test-only fake selfie. Screenshots are in `docs/screenshots/phase-6`.
- **Premium:**
  - **Founding Members get 3 months of Premium free, automatically.** Everyone who already joined as a Founding Member got their 3 months counted from their join date.
  - **Premium screen:** $14.99/month, six cards showing what free limits and what Premium unlocks, and a comparison table. It pulls the numbers from the config table.
  - **Settings → Your plan** shows your status (for example "Founding Member #1: free until December 27").
  - The free-plan limits were already enforced by the server: radius, the messaging wait, Tonight priority, analytics and the badge.
- **Profile analytics (Premium):**
  - Views over 7 and 30 days, a 14-day chart, and who viewed (your circle / your network / others) as **counts only**. Nobody is ever named.
  - Likes, replies, vouches and intro requests over 30 days.
  - Free members see a Premium prompt.
- **Featured and Sponsored places:**
  - A **Featured Places** screen, and each partner's **member perk**. The venue page shows the perk.
  - One clearly labeled card in the Home feed (it takes one of the two "From your network" slots) and one in Pins → Nearby after the third pin.
  - "N from your network have met up here" is shown on the cards.
- **Become a Partner:** a form for venues. Admins get a notification, and one person can send at most 3 inquiries a day.
- **Admin view** (menu → Admin, only for admins; works on your phone or in a web browser):
  - **Reports:** see the reported content and reason, then Remove content / Restore / Resolved / Dismiss. Every open report about the same content closes together.
  - **Verify:** the selfie next to the profile photo, then Approve or Decline with a note.
  - **Places:** add venues (the address fills in the location on a phone, or tap "use my location"), and start Featured or Sponsored placements with a perk and length (7, 14, 30 or 90 days).
  - **More:** partner inquiries (email them, mark contacted / signed / closed), and give or remove Premium by email.
- **Photo verification:** you take a live selfie doing a random gesture ("Touch your chin"). It's stored privately, and only admins can see it. An admin compares it with your profile photo, and approval adds the verified check. That also lets you create groups without a verified phone.
- **ID verification and background check:** they show on the Verification screen as "Coming soon". They need a paid partner (see below).
- **Making you an admin on the live app:** in GitHub, go to **Actions → Make admin → Run workflow**, then type the email you signed up with.
- **RevenueCat, ready to connect:** the server piece that turns App Store purchases into Premium (`revenuecat-webhook`) is written and switched off until RevenueCat is set up. It never shortens a Founding Member's free months.

### Tests
**193 automated database tests** (22 new). They cover:
- founding Premium, and later members starting on free
- analytics being Premium-only, counting once per person per day, and never counting yourself
- only admins can create placements; ended placements disappear
- partner inquiries are private to admins
- the photo check and its review
- admin-only tools
- granting Premium by email

### Needs your accounts (I didn't connect anything paid)
- **In-app subscriptions (RevenueCat + App Store):** a free RevenueCat account, your Apple Developer account, and a $14.99 subscription product in App Store Connect. Buying also needs an App Store build of the app, not Expo Go. Until then, the Premium button explains that subscriptions come with the App Store version, and Founding Members already have Premium.
- **ID verification and background checks:** these need a paid partner. Examples: Persona or Stripe Identity for ID (about $1–2 per check), and Checkr for background checks (about $30 per check). Tell me if and when you want them.

---

## ✅ Phase 5: Messaging, dates and safety

### What works
Tested with two people (Dominique and DeShawn in separate browsers, with GPS placed apart and then together), with no errors and no sideways scrolling. Screenshots are in `docs/screenshots/phase-5`.

- **Messages:** one inbox with date requests waiting on you, chats and group chats, with unread markers and the last message.
  - **Message** on a profile opens the chat. You can message people you met through an intro right away, and anyone else in your circle after 5 back-and-forths.
  - If a chat isn't open to you yet, the profile shows your progress ("3 of 5 so far").
- **Ask on a Date:** every 1:1 chat has an **Ask on a Date** button above the keyboard.
  - **Asking:** pick when (tonight, this weekend, next week, or a day and time), a vibe, a spot (a listed venue or a typed place) and an optional note.
  - **Answering:** the other person can **Accept**, **Suggest a Different Time** (the spot carries over unless they change it), or **Pass**.
  - **Passing is graceful:** the sender only hears "Not this time. No explanation needed."
  - Date requests only go to people you can message, and only one can be waiting between two people.
- **I'm On a Date (Date Mode):** pick someone you connected with (an accepted date or someone in your circle) and tap **Activate**.
  - Your date confirms on their phone. It turns on only when both GPS readings are within **1 mile** and taken within 10 minutes of each other.
  - If it can't turn on, the screen says exactly why ("You're 3.1 mi apart", "DeShawn hasn't confirmed yet").
  - **While it's on:** a check-in timer (30 min to 2 hours), a big **I'm safe** button, one-tap help, and your trusted contacts on standby. Home shows a "On a date with…" strip.
  - A missed check-in is recorded and you get a reminder (the server checks every 5 minutes).
- **Safety:**
  - **Trusted contacts:** up to 5, who don't need the app. Numbers are checked and stored as +1…
  - **"I need help"** has three steps: I feel unsafe → I need to leave → Emergency.
    - Each step opens your phone's Messages app with your contacts and your location filled in, so you tap Send.
    - Emergency also calls 911.
    - "I'm safe" closes the alert and offers to text your contacts that you're okay.
  - Admins are notified of every emergency.
- **Reporting:** members can long-press a chat message to report it.

### Tests
**169 automated database tests** (31 new). They cover:
- who can message whom and the progress count
- the inbox
- date requests: only to people you can message, one waiting at a time, counter keeps or replaces the spot, accept, graceful pass
- Date Mode: only with connections, too far apart doesn't activate and says how far, close enough activates and starts the timer
- missed check-ins get flagged
- phone number format
- help alerts return who to text

### Waiting on Twilio
Right now, texting your trusted contacts works by opening your own Messages app, and you tap Send. That needs no service and works today. Once Twilio is set up, I'll add automatic texts, including texting your contacts when you miss a check-in.

---

## ✅ No emojis: I'm In's own symbols (at Dominique's request)
- **Symbols:** every emoji in the app is replaced with a custom symbol set drawn for I'm In (`src/components/ui/Glyph.tsx`). It covers categories, vibes, events, groups, tiers, trust, status and safety, all on one grid with one line weight. Avatars show initials or a photo.
- **Database:** tier symbols are seed, loop, link, bolt and crown. Groups, events and venues only accept symbol names, and notifications contain no emoji.

## ✅ I'm In at a place (Go Live, reworked at Dominique's request)
- Post that you're going out (the **I'm Out** button), then tap **I'm In** when you get there. People who can see it get "In now · since 9:10 PM".
- It turns off on its own after 3 hours. **Still in** keeps it on, and **Edit plans** removes it. There's no "heading out" or "heading home".
- **Privacy:** because "In now" says where you are right now, you choose who sees it:
  - **My Circle** (1st degree, the default) or **My Network** (1st and 2nd).
  - Strangers and blocked members never see it.
  - Only the place is shown, never your exact location.
- **Join:** people you know tap Join, and you see "Maya is joining you". You can turn joining off for the night.
- Screenshots are in `docs/screenshots/im-out`.

---

## ✅ Phase 4: Going out

### What works
Tested with **three people at once** (Dominique, Maya and Naomi in separate browsers) at iPhone Pro size, with zero errors and no sideways scrolling. Screenshots are in `docs/screenshots/phase-4`.

- **Tonight tab:** a search radius (10 mi free, up to 75 mi on Premium), then **Tonight / This Weekend / Groups**.
  - **Tonight / This Weekend:** who's going out (your circle first, then your network, then people nearby), with place, time, vibe, distance and 1st/2nd badges; hosts are marked. Then the events, with RSVP and "N from your network going."
  - **Groups:** what's coming up in your groups, your groups, groups from your circle, and discover.
- **I'm Going Out** (replaces Go Live; the Home button opens it too): tonight (now or a time), this weekend (a day, optional time), or any time in the next 2 weeks. Type a place, or pick a listed venue so people can see who's there. Vibe and a note. It drops a Going Out pin. You can end or remove your plans.
- **Map:** everyone on the Tonight feed and every event, placed around you. It zooms to fit and spreads out people at the same spot. Locations are the same quarter-mile approximations as everywhere else, and no map company is used (no cost, and no one else gets location data).
- **Events:** host one on your own or for a group you run. Pick a day and time, how long, where (a typed place works), and how many spots. The event page has RSVP (and "Can't make it"), capacity ("2 spots left", then "Full"), and who's going. Group events notify the group.
  - **At the event:** GPS check-in opens an hour before the start and stays open until 3 hours after the end. People who check in there count as a real-life meetup, so they can vouch for each other.
  - **After the event:** "Post a recap" (text, up to 6 photos, and tag people who went) and "Vouch."
- **Venues:** a venue page with the address, "N from your network have met up here", and what's happening there.
- **Groups:**
  - **Create:** needs a verified phone. Choose a name, category, description, when you meet, and request-only or open. Invite founding members from your circle.
  - **Join:** open groups and invitations join in one tap. Request-only groups use **Request to Join** (why you want to join, how you found it, and who you know there), followed by a "Request Sent" screen.
  - **Group page:** owners and admins approve or decline requests. Also on the page: the next event, the members (owner and admin badges, with your circle highlighted), and Leave.
- **Group chat:** every group has a chat, and joining or leaving adds or removes you automatically. New messages appear instantly for everyone in it. The Messages inbox now opens chats.

### Tests
**123 automated database tests** (28 new). They cover:
- tonight vs. weekend
- the radius cap on the free plan
- hiding your venue when you've turned that off
- one "tonight" post at a time
- event capacity and the check-in window
- only people who went can post a recap or be tagged
- only a verified phone can create a group
- only your circle can be invited
- join requests and approvals
- the group chat following membership
- events can't be created around the rules

### Fixed along the way
- Going-out posts could be read straight from the database, which would have shown someone's venue even with "show my venue" turned off. Now only the feed hands them out, and it respects the setting.
- The group-membership checks were callable from outside the app; they're now private, like the other trust-graph checks.
- Live chat could miss messages after the app was reopened (the live connection started before the login was restored). It now waits for the login and catches up on anything missed after a reconnect.

### Needed later
- **Venues list:** the live database starts with no venues, so people type places until you add a list of DC venues. I can load one when you're ready, but it should come from a source you're allowed to use.

---

## ✅ App Store requirements (done before Phase 4, at Dominique's request)
Tested in a browser: signing up without agreeing to the terms is blocked; the legal pages open (signed out too); reporting a pin and a reply works; blocking hides the member's profile and pins, and unblocking restores them; the privacy switches stay saved after a reload; deleting a new account removes everything (the profile, photos and login are gone, and signing in fails afterwards).
- **Delete account** (Settings → Delete account). A server function hands off groups the member owns, deletes their photos, then deletes the login; everything else cascades.
- **Report** members, pins and replies. Reports are confidential, and moderator notes are never shown. A pin or reply reported by **3 different members** is hidden automatically until reviewed (its author still sees it).
- **Block / unblock.** Blocking disconnects you, cancels intros, and hides you from each other everywhere.
- **Terms + Community Guidelines agreement** at signup, required by the database itself. **Terms, Privacy Policy, Community Guidelines** screens, drafted in plain English (need a lawyer's review).
- **Settings hub:** Account, Privacy (5 switches), Blocked members, My reports, About (legal and contact support), Sign out, Delete account.
- **95 automated database tests** (16 new).
- One expected, harmless message during account deletion: the server answers "403" to the sign-out call because the account no longer exists. The app still signs out on the device.

---

## ✅ Phase 3: Trust graph

### What works
Tested with **two people at once** (Dominique and Maya in two separate browsers, placed at the same spot in Tysons), at iPhone SE and iPhone 15 sizes, with zero errors and no sideways scrolling. The Phase 2 walkthrough was re-run too, with no regressions.

- **Check In & Vouch**
  - When you're with someone, you both tap **Check In**. The server compares the two private GPS readings: if you're within 150 m of each other within 30 minutes, it records a **meetup**, labeled with the nearest venue ("Founding Farmers").
  - The other person gets a notification. Then you pick them, pick **one word**, and vouch. They're notified: "Dominique J. vouched for you 🏅 · Word: Welcoming".
  - Rules enforced by the database:
    - vouch within **14 days** of the meetup
    - **2 vouches per month**
    - one vouch per meetup
    - a weak GPS signal is rejected
    - nobody can ever read anyone's raw GPS readings, and they're **deleted after 30 days** by a daily job
- **Request a Vouch:** only from people you actually met recently. They get a notification.
- **Intros**
  - **Make an Intro:** pick someone from your circle plus someone from your circle or network, and say why. Both people must accept.
  - When they do, they're **connected and can message right away**, and you're credited as the connector (your profile counts intros made).
  - Passing is graceful: only the connector hears "didn't happen this time", with no details.
- **Request an Intro** (2nd degree): "Ask Maya →" picks a mutual friend. That friend sees it in **Intros** and can make the intro in one tap, or decline. Members can turn off intro requests in their settings.
- **Circles tab**
  - **My Circle:** the ring diagram (you in the center, your circle on the inner ring, your network dimmed on the outer ring); 1st degree / 2nd degree / vouch counts; Check In & Vouch; Request a Vouch; vouches you've received (the word and where); your 1st-degree list; Make an Intro.
  - **Network:** a short explainer; "People you might click with" (ranked by mutual friends and shared groups, rule-based, no AI label); network activity (vouches, new connections, who's out tonight); the full 2nd-degree list with "Ask X →".
  - **Groups:** your groups, groups from your circle, and discover. (Request-to-join and create came in Phase 4.)
  - An "intros waiting on you" banner shows when something needs your answer.
- **Search Members:** from the Circles header or the menu. Your circle and network rank first, and members who turned off "discoverable" don't show up.
- **Profiles:** the + Vouch and Request Intro buttons now work.
- **Notifications:** tap one to go where it points; opening the list marks them read.

### Tests
**79 automated database tests** (22 new) cover: check-in meetups, the weak-GPS rejection, the 14-day window, notifications, vouch requests, intros (both must accept, no duplicates, strangers can't make intros), intro requests being switchable off, and search privacy. They also run on GitHub on every upload.

### Bugs caught by the tests and fixed before upload
- Check-in would have crashed on the second person's check-in, because a column name collided with the function's own result names.
- The same person could appear twice on the vouch screen when you'd met them twice. Now it's one row per person.

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

---

## Needed from Dominique
1. **Phone test.** The app is live: open it in Expo Go with the link from the chat, then go through `docs/PHASE-1-PHONE-CHECK.md`. Each merged pull request updates it automatically.
2. **Twilio account** for real texts: Account SID, Auth Token, and a phone number (about $1/month plus about $0.01 per text). Until then, phone codes run in demo mode, and safety texts open your own Messages app.

---

## Next
- **TestFlight**, as soon as you have the Apple Developer account (`docs/TESTFLIGHT.md`).
- **Phase 7 (AI)**, when you're ready. The seven AI features are icebreakers, Tonight for You, Trust Monitor, vibe match, momentum score, intro success prediction and AI badges. The Claude API is paid per use, so it waits for your OK.

---

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-28 | Plain names: Friends / Friends of friends (not Circle / Network / degrees) | Tester round: jargon confused new users |
| 2026-09-28 | Messaging unlocks after 3 back-and-forths (was 5); default radius 25 mi | Tester round |
| 2026-09-28 | Home = people row + Friends/Everyone + one mixed feed; Messages becomes a tab; badges are dots | Product review (PM, dev, UX, two creators); Dominique approved all changes |
| 2026-09-28 | Follow is public-posts-only: never unlocks messaging, vouches or circle posts | Keeps the circle meaningful while letting creators grow |
| 2026-09-28 | Radius slider back: 1 to 75 miles for everyone | Dominique |
| 2026-09-28 | Adding people: QR in person (counts as a meetup) and a shared code for people who know each other outside the app (doesn't unlock vouching) | Dominique; keeps vouches tied to real meetups |
| 2026-09-28 | I'm In is a social app, not only going out: Home leads with posting, pins and group chats | Dominique |
| 2026-09-28 | Phase 8 before Phase 7 (AI) | Dominique: "Skip AI, do Phase 8" |
| 2026-09-28 | Pushes go through Expo's free push service, sent by the database (pg_net) | No extra account or key; Settings switches and blocks are enforced on the server |
| 2026-09-28 | "I'm In" = tap to say you're going. The app marks you **there** automatically by GPS (within 150 m). | Dominique |
| 2026-09-28 | Search radius is always 75 miles for everyone (no slider, not a Premium perk) | Dominique |
| 2026-09-27 | ~~Theme E "Top 8"~~ removed, along with Top 8 friends and profile customization | Dominique: "No Top 8" |
| 2026-09-27 | Default theme is **Original** (the prototype's colors: #0C0C0C, red #D62828, green #4ADE80, gold #D4AF37, blue #64A0FF; Bebas Neue + Syne). A–D stay as alternates. | Dominique: "change to the original color scheme" |
| 2026-09-27 | In the Original theme, gray secondary text is 62% white (the prototype used 40%) | 40% was too faint to read comfortably (it failed the accessibility contrast check) |
| 2026-09-27 | AI features use the Original palette's blue (#64A0FF) with the ✦ marker | The spec wants AI visually distinct; the prototype used red, which is also the main button color |
| 2026-09-27 | **People connected through an accepted intro can message right away**, no back-and-forths needed | Dominique |
| 2026-09-28 | Nearby and They're In show "Everyone" pins; My Network and My Circle pins show on Home, in profiles, and in threads for the people allowed to see them | Keeps the community feeds public, as intended |
| 2026-09-28 | Posting "going out" (Go Live) also drops a Going Out pin, visible to Everyone unless you've turned off "Show in nearby feed" (then My Network) | Decision C15 |
| 2026-09-28 | Home's tonight pick is rule-based until Phase 7, with no ✦ AI label | Never show AI branding on something that isn't AI |
| 2026-09-28 | Event and going-out times show in DC time | The launch market is DC, and events happen in local time |
| 2026-09-29 | Check-in needs both people to tap Check In within 30 min and 150 m (both numbers are in config) | Mutual consent: nobody gets "detected" without choosing to check in |
| 2026-09-29 | Vouches must be given within 14 days of the meetup (config) | Keeps vouches tied to a real, recent experience |
| 2026-09-29 | Intro rules: the first person must be in your circle; the second can be your circle or network | Matches the prototype's Make an Intro screen |
| 2026-09-29 | Passing on an intro only tells the connector, with no details | "Passing is always graceful" |
| 2026-09-29 | "People you might click with" is rule-based (mutual friends plus shared groups) until the Phase 7 AI version, and carries no ✦ label | Never label something as AI when it isn't |
| 2026-10-06 | Founding Members' 3 free months start at signup (earlier founders: from their join date) | "Founding members get 3 months free" |
| 2026-10-06 | Profile analytics show counts only, never who viewed you | Privacy: nobody should feel watched |
| 2026-10-06 | Photo verification is reviewed by a person (a live selfie with a random gesture) | Automated face matching needs a paid partner; a person reviewing is free and reliable at launch scale |
| 2026-10-06 | A sponsored or featured card can take one of the two Home "From your network" slots, and one Pins slot (after the 3rd pin), always labeled | Decision B6 and "never disguised" |
| 2026-10-04 | **No emojis anywhere.** The app draws its own symbols. | Dominique |
| 2026-10-04 | Go Live became **I'm In at a place**: post your plans, tap I'm In when you arrive, and people can Join. No heading out or heading home. | Dominique |
| 2026-10-05 | "In now" is seen by **your circle by default**; you can widen it to your network. Never strangers, never an exact location. | Dominique flagged it may be a privacy issue |
| 2026-10-04 | Safety texts open the phone's own Messages app (you tap Send) until Twilio is set up | Decision C7: safety is not the place to fake an automatic text |
| 2026-10-04 | A counter-proposal keeps the original spot unless a new one is given | Suggesting a new time shouldn't silently drop the place |
| 2026-10-01 | Creating a group needs a **verified phone** (config `group_create_requires`: none / phone / photo) | Photo verification isn't built until Phase 6; a phone is a real barrier to fake groups in the meantime |
| 2026-10-01 | "This Weekend" = now through Sunday 11:59 PM (DC). Plans further out use "Pick a Time" | Matches how people talk about "this weekend" |
| 2026-10-01 | The map is drawn by the app (no map company) | No cost, no API key, and no third party gets members' locations. A street map can be added later if you want one. |
| 2026-10-01 | Events can be at a typed place, not just a listed venue | The live database starts with no venue list |
| 2026-10-01 | Recurring group events stay under Groups, not This Weekend | Decision B9 |
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
