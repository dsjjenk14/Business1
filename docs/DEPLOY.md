# Putting I'm In online (Supabase + Expo via GitHub)

Once this is set up, **GitHub deploys everything automatically** whenever `main` changes:

1. **Supabase** gets the latest database changes and server functions.
2. **Expo** publishes a new version of the app that you open on your phone.

Your keys live in GitHub's secret storage. You never paste them into a chat.

About 15 minutes, one time.

---

## Step 1: Supabase project

1. Go to **supabase.com/dashboard** → **New project**.
   - Name: `imin`.
   - Database password: click **Generate**, then **save it somewhere** (you need it in Step 3).
   - Region: **East US (North Virginia)**, closest to DC.
2. Wait about 2 minutes for it to finish setting up.
3. Go to **Authentication → URL Configuration** and set:
   - Site URL: `imin://`
   - Redirect URLs: add `imin://**` and `exp://**`

## Step 2: Expo

Nothing to create. The first deploy creates the Expo project for you.

## Step 3: Add the secrets to GitHub

In GitHub, open **dsjjenk14/Business1 → Settings → Secrets and variables → Actions → New repository secret**, and add each of these:

| Name | Where to find it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → your avatar (top right) → **Account preferences → Access Tokens → Generate new token** |
| `SUPABASE_PROJECT_ID` | Your project → **Project Settings → General → Project ID** (looks like `abcdefghijklmnop`) |
| `SUPABASE_DB_PASSWORD` | The password you saved in Step 1 |
| `SUPABASE_URL` | Project → **Project Settings → API** (or **Data API**) → Project URL (`https://….supabase.co`) |
| `SUPABASE_ANON_KEY` | Project → **Project Settings → API Keys** → the **anon** or **publishable** key (safe to put in the app) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** or **secret** key. ⚠️ Powerful: only ever goes in GitHub secrets. Used to mark the database as production. |
| `EXPO_TOKEN` | expo.dev → your avatar → **Account settings → Access tokens → Create token** |

## Step 4: Deploy

1. Tell me you're ready, and I'll open a pull request that moves this work onto `main`.
2. You click **Merge** on GitHub. That starts the **Deploy** workflow (see the **Actions** tab). It takes about 5 minutes.
3. The live database starts **empty**. No demo people are ever loaded, and the deploy marks the database as production so demo data can't be added by accident.

## Step 5: Open it on your iPhone

1. Install **Expo Go** from the App Store and sign in with your Expo account.
2. On expo.dev, open the **imin** project → **Updates** → the latest update on the `production` branch → **Preview** → scan the QR code with your iPhone camera.
3. Create your account. You'll be member #1 and a Founding Member.
4. Go through `docs/PHASE-1-PHONE-CHECK.md`.

## Before real members: Twilio (texts) and email

- **Twilio:** in Supabase → **Edge Functions → Secrets**, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. In production there's no demo mode, so phone verification shows "We couldn't send a text right now" until these are set.
- **Email:** Supabase's built-in email is capped at a handful of messages per hour, which isn't enough for signup confirmations and password resets at launch. Add a sending service (e.g. Resend or SendGrid, both have free tiers) under **Authentication → Emails → SMTP settings**.

## If something fails

Open the failed run in the **Actions** tab and tell me which step is red. I can read the logs from here.

## Or: let Claude deploy

Add `SUPABASE_ACCESS_TOKEN` and `EXPO_TOKEN` as environment variables in the Claude session settings, allow network access to `supabase.com`, `api.supabase.com`, `*.supabase.co`, `expo.dev`, `api.expo.dev` and `u.expo.dev`, then start a new session and say "deploy I'm In". It runs `npm run deploy`.
