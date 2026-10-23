# Publishing Intercede to the App Store and Google Play

The iPhone and Android apps are the same app as the website, packaged with
[Capacitor](https://capacitorjs.com). The native projects live in `ios/` and `android/`.
Every push to `main` builds both on GitHub (see the **Apps** workflow). The Android run
produces a test APK you can install on a phone today.

## 0. Turn on notifications delivery (needed for the website too)

Notifications are queued by the database and sent by the `notify` edge function, which the
Supabase GitHub integration deploys from `main`. Something has to run it every minute:

1. In Supabase, open **Integrations → Cron**, and enable it if asked.
2. Click **Create job**:
   - **Name:** `send-notifications`
   - **Schedule:** every minute (`* * * * *`)
   - **Type:** Supabase Edge Function, function `notify`, method **POST**
   - **Body:** `{"action":"send"}`
3. Save. Check **Edge Functions → notify → Logs** after a minute: each run logs its result.

Web push (browsers, installed web app) works with just this step. The apps need steps 3 and 4 below.

## 1. Accounts you need

| | Cost | Notes |
|---|---|---|
| [Apple Developer Program](https://developer.apple.com/programs/) | $99 / year | Needed to publish on the App Store and to send iPhone notifications. |
| [Google Play Console](https://play.google.com/console/signup) | $25 once | **New personal accounts must run a closed test with at least 12 testers for 14 days** before the app can go public. Start this early. |
| [Firebase](https://console.firebase.google.com) | Free | Delivers Android notifications. |

Building for iPhone needs a Mac with Xcode, **or** a cloud build service. If you don't have a
Mac, [Codemagic](https://codemagic.io) has a free tier that builds and uploads Capacitor apps
using an App Store Connect API key.

## 2. Settle the app ID first

`brand.json` → `appId` is `com.intercede.prayer`. It becomes permanent the moment the app is
created in either store. Change it now if you'd like something else (reverse-domain style),
then run `npx cap sync`.

Also fill in `contactEmail` in `brand.json`. It appears in the privacy policy, and both
stores require a contact address.

## 3. Android notifications (Firebase)

1. In the Firebase console, **Add project** → name it Intercede (Analytics can be off).
2. **Add app → Android**, package name `com.intercede.prayer`. Download `google-services.json`.
   - Put it at `android/app/google-services.json` and commit it. It isn't secret.
   - Or add its contents as a GitHub repository secret named `GOOGLE_SERVICES_JSON`.
3. **Project settings → Service accounts → Generate new private key.** This JSON file **is secret**.
   In Supabase, open **Edge Functions → Secrets** and add `FCM_SERVICE_ACCOUNT` with the whole file's contents.
   Never commit it or paste it anywhere else.

## 4. iPhone notifications (Apple Push Notification service)

1. In the [Apple Developer account](https://developer.apple.com/account), open **Certificates, IDs & Profiles**:
   - **Identifiers → +** → App IDs → App, Bundle ID `com.intercede.prayer`, and tick **Push Notifications**.
   - **Keys → +** → name it "Intercede push", tick **Apple Push Notifications service (APNs)**, then download the `.p8` file (you can only download it once).
2. In Supabase **Edge Functions → Secrets**, add:
   - `APNS_KEY`: the full contents of the `.p8` file (secret)
   - `APNS_KEY_ID`: the key's 10-character ID
   - `APNS_TEAM_ID`: your Team ID (top right of the developer account)
   - `APNS_BUNDLE_ID`: `com.intercede.prayer`
   - `APNS_PRODUCTION`: `true` for TestFlight and App Store builds; `false` only when running from Xcode during development
3. The Xcode project already has the Push Notifications entitlement (`ios/App/App/App.entitlements`).

## 5. Sign-in for the apps

The app signs people in with a one-time email code (6–10 digits, set in Supabase). Tapping a sign-in **link** opens the
website, not the app, so app users must be able to see the code:

- Set up a custom email sender (SMTP) in Supabase, then edit the **Magic Link** and
  **Confirm signup** templates to include `{{ .Token }}` (see `supabase/templates/magic_link.html`).

**App review account:** reviewers can't receive codes sent to your inbox, so they sign in
with a password (Settings → Account → "Sign in with a password instead"). Only accounts you
give a password can use it; everyone else keeps using email codes.

1. Supabase → **Authentication → Users → Add user → Create new user**: an email you control
   (e.g. a "+review" address on your sender Gmail), a strong password, and tick **Auto Confirm User**.
2. Sign in to the app with it, set the name to "App Review", create a group called
   "Review group" and add two or three sample requests and a praise report, so reviewers see real content.
3. Put the email and password in the review notes (see `docs/STORE_LISTING.md`). Change the
   password after review if you like.

## 6. Building releases

### Android (Google Play)
The **Android release** workflow builds the signed `.aab` on GitHub; no Android Studio needed.

1. **Create an upload key once** and keep it, and its passwords, somewhere safe (a password
   manager). With Play App Signing, Google holds the real signing key; if this upload key is
   ever lost, Google can reset it, but that takes a few days.
   `keytool -genkey -v -keystore intercede-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
   (`keytool` comes with Java. Claude can also generate one for you.)
2. Add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   - `ANDROID_KEYSTORE_BASE64`: the keystore file in base64 (`base64 -w0 intercede-upload.jks` on Linux, `base64 -i intercede-upload.jks` on Mac)
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`
   - `GOOGLE_SERVICES_JSON`: the Firebase file's contents, for notifications
3. GitHub → **Actions → Android release → Run workflow**, enter a version like `1.0.0`.
   Download the `.aab` from the run's **Artifacts**. Each run gets a higher version code automatically.
4. In Play Console: create the app, choose **Play App Signing** (default), then
   **Testing → Closed testing**: upload the `.aab` and invite 12+ testers.

### iPhone (App Store)
1. `npm run build && npx cap sync ios`, then open `ios/App/App.xcodeproj` in Xcode.
2. **Signing & Capabilities:** choose your team (automatic signing).
3. **Product → Archive → Distribute App → App Store Connect.** Then test with **TestFlight** and submit for review.

## 7. Store listings

Both stores ask for:

- **Privacy policy URL:** `https://prayerrequestapp.netlify.app/#/privacy`
- **Support URL:** `https://prayerrequestapp.netlify.app`
- **Screenshots:** iPhone 6.9" and 6.5", iPad if supported; Android phone.
- **Description:** start from `brand.json` → `description`.
- **Age rating:** no objectionable content. Groups let invited users share text, so answer "yes" to user-generated content where asked. Content is only shared within invite-only groups, and members can leave and leaders can remove people.

**Privacy answers** (Apple "App Privacy" / Google "Data safety"):

| Data | Collected | Linked to the person | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes (only with an account) | Yes | No | Account sign-in |
| Name (display name) | Yes (only with an account) | Yes | No | App functionality (shown to their groups) |
| User content (prayer requests, updates) | Yes (only with an account) | Yes | No | App functionality (sync and groups) |
| Device ID (push token) | Yes, if notifications are on | Yes | No | App functionality (notifications) |

No analytics, no ads, no data sold or shared with third parties for their own use. Data is
encrypted in transit. People can delete their account in the app (Settings → Account →
Delete my account).

## What the apps do differently from the website

- **No donation links.** Apple and Google only allow links to outside payments from registered charities, so the Support page shows a thank-you instead.
- **Notifications** use Apple/Google push instead of web push.
- **Invite links and sign-in emails** point to the website (`brand.json` → `webUrl`).
