# bide for iOS and Android

The apps are the bide web app in a native shell (Capacitor 8). Editing still runs on the device. Accounts, the trial and the licence come from the same licence server as the website (`cloud/`).

## Payments: subscribe on the website, sign in in the app

People subscribe on the website (Stripe Checkout: Apple Pay, Google Pay, cards). The apps only sign in to an existing account. They show no price, no Subscribe button and no link or wording pointing to a purchase. A new account still gets its 7 free days in the app, and after that the app says the account has no active plan.

This relies on two store rules:

- **App Store, guideline 3.1.3(f):** a free app that is a companion to a paid web tool need not use in-app purchase, provided there is no purchasing inside the app and no call to action for purchase outside it.
- **Google Play:** consumption-only apps may give access to content or services bought elsewhere, as long as they don't take payment in the app or steer users to other payment methods.

Apple and Google interpret these rules at review time, and Apple may decide bide should offer in-app purchase instead. If a review is refused, the fallback is to add App Store and Play subscriptions next to Stripe (Apple and Google take 15% under their small-business programmes). In the US storefront, Apple now also allows a link to the website's checkout. Check the current guidelines before each submission, because these rules have changed several times since 2024.

**Account deletion** is in the app (account menu → Delete account), as both stores require for apps that create accounts. It cancels the Stripe subscription by deleting the customer, then removes the account and its sessions. The server keeps only a hash of the email and its trial end date, so deleting and signing up again does not give a second trial. Mention this in the privacy policy. Google Play also asks for a web address where deletion can be requested: the website's account menu has the same button.

## What is different in the apps

- **Files:** saving or exporting opens the system share sheet (Save to Files, Drive, Mail…), because web download links do nothing in an app.
- **Camera:** "Open an invoice" and image import can take a photo. iOS shows the reason given in `Info.plist`, and Android asks for the camera permission.
- **AI models:** the app ships the models every scan uses (text detection and recognition, page orientation, click-to-select, sharpening: about 41 MB). Object removal, background removal, high-accuracy OCR, page flattening and other alphabets are downloaded from your server the first time they are used, with the user's licence, and then kept in the app's cache.
- **Office files** (Word, Excel, PowerPoint) cannot be opened in the apps: the conversion engine needs browser isolation, which app WebViews do not provide. PDFs and images work.
- **AI speed:** ONNX Runtime runs on one thread in the apps for the same reason, and WebGPU where the WebView offers it. Expect slower AI tools than in a desktop browser.

## Build

1. **Server:**
   - Deploy the licence server as for the website (`cloud/README.md`).
   - Run the new `used_trials` table from `cloud/schema.sql` on the D1 database.
   - The server accepts the app origins `capacitor://localhost` (iOS) and `https://localhost` (Android) by default. Override them with `APP_ORIGINS` if needed.
2. **App settings:** create `.env.app.local` (git ignores it):
   ```
   VITE_LICENCE_PUBLIC_KEY={"kty":"EC",...}   # the same public key as the website
   VITE_LICENCE_API=https://your-bide-site.example
   VITE_MODEL_BASE=https://your-bide-site.example/
   ```
3. **Build:** `npm run build:app`. It builds `dist-app/` (sign-in only, smaller model set) and copies it into `android/` and `ios/`.
4. **Android:**
   - `npx cap open android` opens Android Studio.
   - Set the application id (`appId` in `capacitor.config.ts`, then `npx cap sync`), app icon, version and signing key.
   - Build an App Bundle for Play Console.
5. **iOS:**
   - On a Mac with Xcode, run `npx cap open ios`.
   - Set the bundle id, team, icon and version.
   - Archive and upload to App Store Connect.

Store listings need:
- a privacy policy (the account email and Stripe data only; documents and invoices stay on the device);
- the account deletion address;
- the Data safety and App Privacy forms: email address, used for account management; no tracking.

## Tested so far

- The app build itself (`tests/e2e/paywall.e2e.mjs`, "the app build…") was tested in Chromium. It covers the sign-in screen without prices, the no-plan screen without a purchase, account deletion, and a model fetched from the server with the licence across origins.
- The apps have not yet been run on a phone or simulator in this repository's CI. Check share-sheet saving, camera capture, model downloads and memory use on real devices before submitting. Large images and the object-removal model need a recent phone.
- `npm audit` reports a moderate issue in `xcode` and `uuid`, which come from Capacitor's command-line tool. That tool only runs on the build machine and is not shipped in the apps.
