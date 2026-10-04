# The In Crowd: VIP Passes and packs (in-app purchases)

Everything is built. Real purchases stay **off** until the products exist in
the App Store and Google Play, RevenueCat is connected, and a **new app build**
goes out. Until then:

- On a phone, the pack buttons say "Purchases aren't turned on yet." Everything
  else works, including buying a VIP Pass with coins.
- In development builds (and the dev web version), packs are **test purchases**:
  nothing is charged and the passes or coins are added, so the whole flow can
  be tried.

## How VIP Passes work

- Every night costs a **VIP Pass** to start (the "lives" of this game).
- **Win the night (1 star or more) and you get it back.** Lose (no stars) or
  quit partway and it's gone.
- You hold up to **3** free ones. Below 3, a new one arrives every **20 minutes**
  (a countdown shows on the game's home screen and in the Shop).
- Out of passes? The "Out of VIP Passes" screen shows the countdown and the
  packs. Bought passes stack above 3 (for example, 3 + a pack of 8 = 11).
- **No money needed:** 1 VIP Pass also costs 300 coins, which players earn by
  playing. So nobody is ever stuck behind a payment.
- "Watch Zara play it" (demo nights) never uses a pass.

## What's for sale

All six are **consumable** in-app purchases (used up, can be bought again).
The product IDs must be typed **exactly** like this in the App Store, Google
Play, and RevenueCat.

| Product ID | Name in the app | Gives | Price |
|---|---|---|---|
| `incrowd_passes_3` | 3 VIP Passes | 3 passes | $0.99 |
| `incrowd_passes_8` | 8 VIP Passes ("Most popular") | 8 passes | $1.99 |
| `incrowd_passes_20` | 20 VIP Passes ("Best value") | 20 passes | $3.99 |
| `incrowd_coins_1500` | Pouch of coins | 1,500 coins | $0.99 |
| `incrowd_coins_5000` | Bag of coins ("Most popular") | 5,000 coins | $2.99 |
| `incrowd_coins_15000` | Vault of coins ("Best value") | 15,000 coins | $6.99 |

- Prices are set in App Store Connect and Google Play, not in the app. The app
  shows whatever the store says, in the player's own currency. The prices
  above are only shown until the store answers.
- To change what a pack gives, or add one, edit `src/features/in-crowd/packs.ts`.

**Who takes what:** Apple and Google keep **15%** of each purchase for
businesses earning under $1 million a year from the store (Apple's Small
Business Program, which you apply for once; Google applies it
automatically), otherwise 30%. RevenueCat is free until about $2,500 a month
in purchases, then about 1%. Check their current pricing when you sign up.

## Turning it on (about 1 to 2 hours, one time)

You need the Apple Developer account first (the same one TestFlight needs,
see `docs/TESTFLIGHT.md`), and a Google Play Console account for Android.

### 1. Apple (App Store Connect)
1. **Agreements, Tax, and Banking:** sign the **Paid Apps** agreement and add
   your bank and tax details. No in-app purchase works without it.
2. **(Recommended) Small Business Program:** apply at
   developer.apple.com/app-store/small-business-program to pay 15% instead of 30%.
3. Your app → **Monetization → In-App Purchases** → **+** → type **Consumable**.
   Create all six from the table: Reference Name (anything), Product ID
   (exactly as above), price, a display name and description, and a review
   screenshot (a screenshot of the Shop's VIP Passes tab is fine).
4. The first in-app purchases go to Apple for review together with the next
   app version you submit. Tick them on that version's page before submitting.
5. **Users and Access → Integrations → In-App Purchase** → generate a key and
   download the `.p8` file. RevenueCat needs it (step 3).

### 2. Google Play Console
1. **Set up a payments profile** (Settings → Payments profile) so you can sell.
2. Google only lets you create products after a build with purchases in it has
   been uploaded once. Upload the new build (step 5) to the **Internal testing**
   track first, then come back.
3. Your app → **Monetize with Play → Products → In-app products** → create all
   six with the same Product IDs and prices. Make each one **Active**.
4. Create a **service account** for RevenueCat (RevenueCat's setup screen links
   to a step-by-step guide) and download its JSON key.

### 3. RevenueCat
1. Sign up at revenuecat.com (free) and create a project called "I'm In".
2. **Add an Apple App Store app:** bundle ID `app.imin.ios`, then upload the
   In-App Purchase key (`.p8`) from Apple step 5.
3. **Add a Google Play app:** package `app.imin.android`, then upload the
   service account JSON from Google step 4.
4. **Product catalog → Products → Import** all six products from each store.
   You don't need entitlements or offerings: the game buys products directly.
5. **API keys:** copy the two **public** SDK keys (the Apple one starts with
   `appl_`, the Google one with `goog_`). These are safe to ship inside the app.

### 4. Put the keys where the app is built
The app reads `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Add them in **two** places:

1. **Expo** (for new app builds): expo.dev → the I'm In project → **Environment
   variables** → add both, for the **production** and **preview** environments,
   visibility "Plain text".
2. **GitHub** (for the over-the-air updates the Deploy workflow sends): the
   repo → Settings → Secrets and variables → Actions → New repository secret:
   - `REVENUECAT_IOS_KEY`: the `appl_…` key
   - `REVENUECAT_ANDROID_KEY`: the `goog_…` key

For local development, put them in `.env` (see `.env.example`).

### 5. Build a new version of the app
The store code is native code, so **a new build is required**: an
over-the-air update can't add it to the version people already have. Run
GitHub → Actions → **TestFlight build** for iPhone (and an Android build with
`npx eas-cli@latest build --platform android --profile production`).

Older app versions keep working after the update: the game simply shows that
purchases aren't on yet, and VIP Passes for coins still work.

## Testing before it's live
- **iPhone:** App Store Connect → Users and Access → **Sandbox** → add a tester
  with an email that isn't a real Apple ID. Sign in with it on the test iPhone
  (Settings → App Store → Sandbox Account) and buy from a TestFlight build.
  Nothing is charged.
- **Android:** Play Console → Settings → **License testing** → add the tester's
  Gmail. Their purchases from the internal testing track aren't charged.
- RevenueCat's dashboard shows every test and real purchase as it happens.

## Good to know
- Each purchase is added **once**: the app remembers each receipt, so a
  double tap or a slow network can't add a pack twice. Cancelling the
  purchase sheet adds nothing and charges nothing.
- Like the rest of the game, passes and coins are **saved on the phone**. If
  someone deletes the app, their unused passes and coins go with it. That is
  normal for consumable purchases (Apple and Google don't restore them), but
  Support may hear about it.
- The products are named after the game ("VIP Passes", "coins"). The closet
  items use generic names ("Pro Phone", "Smartwatch", "Quilted Chain Bag"), not
  real brands, so there are no trademark problems in App Review.
- Code: `src/features/in-crowd/purchases.native.ts` (phones),
  `src/features/in-crowd/purchases.ts` (web), `src/features/in-crowd/packs.ts`
  (what's for sale), `src/features/in-crowd/progress.ts` (passes and coins).
