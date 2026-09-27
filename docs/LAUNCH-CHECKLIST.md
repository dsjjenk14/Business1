# Launch checklist (App Store)

## ✅ Built into the app
- [x] **Delete account in the app:** Settings → Delete account (type DELETE). Removes the profile, photos, pins, replies, vouches, connections and messages; hands owned groups to another member.
- [x] **Report:** members (profile → Report), pins (🏳 flag on each pin), replies (Report under each reply), chat messages (long-press a message). Reports are confidential, and reporters see status only (Settings → My reports).
- [x] **Block:** profile → Block. It disconnects you, cancels pending intros, and hides each of you from the other everywhere. Unblock in Settings → Blocked members.
- [x] **Filtering objectionable content:** anything reported by 3 different members is hidden automatically until reviewed (the number is in config: `report_hide_threshold`). Blocking hides a person's content. Moderators get an in-app notification for every report.
- [x] **Terms agreement at signup:** a required checkbox for the Terms of Service and Community Guidelines, stating there's zero tolerance for abusive behavior. The time it was accepted is stored.
- [x] **Terms, Privacy Policy, Community Guidelines** in the app (Settings → About, plus links at signup and on the welcome screen). They can be read signed out.
- [x] **18+ only:** date of birth is required at signup and under-18s are blocked.
- [x] **Location and photo permission messages** explain why the app asks.
- [x] **Privacy controls:** Settings → Privacy (show me when I go out, show my venue, show my vouch count, allow intro requests, show me in search).
- [x] **Live database starts empty**, with no demo people (see `docs/DEPLOY.md`).

## ⬜ Needed from Dominique
- [ ] **DC venues list** (optional). The live database starts with no venues, so people type places. A list makes "who's been here" and venue pages work. It should come from a source we're allowed to use.
- [ ] **Support email.** The app shows `support@imin.app` as a placeholder. Tell me the real address; it's one setting (`app_config.support_email`).
- [ ] **Lawyer review** of the Terms, Privacy Policy and Community Guidelines (`src/features/legal/content.ts`). They're plain-English drafts written from how the app actually works.
- [ ] **Public web pages** for the Privacy Policy and Terms. The App Store listing needs a Privacy Policy URL. I can publish them as simple pages once the text is final.
- [ ] **Moderation owner:** Apple expects reports to be acted on within about 24 hours. Until the admin view (Phase 6), reports can be reviewed in Supabase → Table editor → `reports`. Make your account an admin (`profiles.role = 'admin'`) to get a notification for each report.
- [ ] **Twilio** (texts) and an **email-sending service** (Resend or SendGrid free tier). See `docs/DEPLOY.md`.
- [ ] **Apple Developer account** ($99/year), for TestFlight and the App Store.
- [ ] **App Store privacy "nutrition label":** I'll fill in a draft from the Privacy Policy when we submit.

## Still to build before a public launch (build plan)
- Phase 4: Tonight tab, map, groups (join requests, group chat), event recap
- Phase 5: chats, date requests, Date Mode, safety check-ins and the "I feel unsafe" flow. **Recommended before strangers start meeting up.**
- Phase 6: Premium, Featured Places, the admin view, ID and photo verification
- Phase 7: AI features
- Phase 8: push notifications, polish, TestFlight build
