# Getting I'm In onto TestFlight

TestFlight is Apple's way to install a test version of the app on real
iPhones before it's in the App Store. Everything on the app side is ready.
What's left needs your Apple account.

## What the App Store version adds over Expo Go
- **Arriving with the app closed.** The phone watches the places you said I'm In to (up to 20 at a time), and marks you there when you walk in, even if the app is closed. It asks for "Always" location right after you tap I'm In, and explains why. If you say no, arriving still works whenever the app is open.
- **Push notifications on Android** (Expo Go on iPhone already gets them).
- Your own app icon and name on the home screen.

## Steps (one time)
1. **Join the Apple Developer Program** ($99/year) at developer.apple.com/programs. Approval can take a day or two.
2. **Create the app in App Store Connect** (appstoreconnect.apple.com → Apps → +): name "I'm In", bundle ID `app.imin.ios`, SKU `imin`.
3. **Make an App Store Connect API key** (App Store Connect → Users and Access → Integrations → App Store Connect API → +, role "App Manager"). Download the `.p8` file (you can only download it once).
4. **Add four GitHub secrets** (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   - `ASC_API_KEY_P8`: open the `.p8` file in a text editor and paste all of it
   - `ASC_API_KEY_ID`: the Key ID shown next to the key
   - `ASC_API_ISSUER_ID`: the Issuer ID at the top of that page
   - `APPLE_TEAM_ID`: developer.apple.com → Account → Membership details → Team ID
5. Tell me it's done. I'll run **Actions → TestFlight build** with you the first time, since Apple sometimes asks one extra question on the first build.

Never paste these keys into chat.

## Before the first store build (I'll do this)
- Switch `runtimeVersion` in `app.json` from the Expo Go setting to the `appVersion` policy, so over-the-air updates only go to builds they fit.
- Fill in the App Store privacy "nutrition label" from the Privacy Policy.
