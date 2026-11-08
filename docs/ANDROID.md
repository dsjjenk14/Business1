# Android

The app already runs on Android: it's one codebase for iPhone, Android and the web.

## Right now, with no Play Store

- **In Chrome:** Android friends can open **https://imin-dc.expo.app** and tap **⋮ → Add to Home screen**. It opens like an app.
- **In Expo Go:** install **Expo Go** from the Play Store, then scan the preview QR code from expo.dev (the same steps as on iPhone).

## Getting into the Google Play Store

1. **Make a Google Play developer account** at play.google.com/console. It's a one-time **$25** fee. Google checks your ID, which can take a few days.
2. **Create the app** in Play Console: name **I'm In**, type **App**, **Free**. Fill in the store listing, content rating, data safety form and privacy policy link (use the one in the app).
3. **Build it once by hand.** Google requires the first upload to be done in Play Console:
   - On expo.dev, open the **imin** project and start a build: **Android**, profile **production**. Or ask me to start it.
   - Download the `.aab` file, then in Play Console go to **Testing → Internal testing → Create release** and upload it.
4. **Let GitHub send future builds.** In Google Cloud, create a service account with access to your Play Console app, download its JSON key, and save the whole file's contents as the GitHub secret `PLAY_SERVICE_ACCOUNT_JSON`. Then run **Actions → Google Play build**.
5. **Testing before launch:** new personal developer accounts must run a closed test with at least 12 testers for 14 days before Google allows a public release. Organization accounts skip this. Check Play Console for the current rule.

Updates after that work like iPhone: merging a pull request sends an over-the-air update to both.
