# Sharing I'm In with testers

## The web link (anyone, nothing to install)

**https://imin-dc.expo.app**

Send testers this link. It opens I'm In in their phone's browser (Safari or
Chrome). It updates by itself every time a change is merged, the same as Expo Go.

Tip for testers: on iPhone, tap **Share → Add to Home Screen** so it opens like an app.

**What works on the web:** almost everything, including:
- signing up, pins, photos, filters and music
- Outs (with the camera), messages and group chats
- events, tickets (once payments are on), What's In and ratings

**What doesn't:**
- push notifications (the in-app bell and chime still work while the page is open)
- noticing arrival at an event while the page is closed: testers tap "I'm here" instead
- live video (it isn't turned on anywhere yet)

## One-time setup in Supabase (5 minutes)

So sign-up and password-reset emails work from the web link:

1. Supabase → your project → **Authentication → URL Configuration**.
2. Under **Redirect URLs**, add `https://imin-dc.expo.app/**` and save.
3. **Authentication → Sign In / Providers → Email**:
   - Easiest for a small test: turn **Confirm email** off. Testers can sign up and start right away.
   - Or keep it on and set up an email service (Resend has a free plan) under **Authentication → Emails → SMTP Settings**. Supabase's built-in email only sends a few messages an hour and may only deliver to your own team's addresses.

## Phones with the real app

- **Expo Go:** invite testers to your Expo account (expo.dev → Members). They install Expo Go, sign in and open the project.
- **iPhone (TestFlight):** needs an Apple Developer account ($99/year). See `docs/TESTFLIGHT.md`.
- **Android:** an install link can be made with Expo's build service (free plan, a limited number of builds a month). Ask for it when you want it.

## What to ask testers

Send them to the checklist in `docs/PHASE-1-PHONE-CHECK.md`, or just ask:
1. Could you sign up and find people you know?
2. Did anything look broken or confusing?
3. What would make you open it on a Friday night?
