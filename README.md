# Intercede

A free, private prayer request tracker. Add requests, pray through a few each day, post updates as things change, and keep a journal of answered prayers.

See [docs/RESEARCH.md](docs/RESEARCH.md) for the market research and feature plan behind it.

## Features (v1)

- **Quick capture**: type `Sarah: healing after surgery #family` and the name and tag are picked up automatically. Tags autocomplete.
- **Bulk add**: paste a whole list, one request per line.
- **Daily prayer session**: a focused, one-at-a-time view. Prayers set to a fixed day (daily, certain weekdays, or monthly) are always included. The rest rotate, least recently prayed first, taking turns across tags. Swipe or use the keyboard. Optional timer.
- **Request timeline**: post updates on a request ("surgery moved to Tuesday"), mark it answered with a note, archive it, or move it back to active.
- **Praise**: answered prayers and praise reports (things to give thanks for) in one timeline by month, with stats. Praise reports can be shared with a group, where members can respond with "Praise God".
- **Follow-ups**: set a date to check in, and it shows on Today when due.
- **Search and filters**: by text, status, tag, or person.
- **Prayer counts**: how many times you've prayed for each request, and when you last did.
- **Backup and export**: JSON backup, CSV spreadsheet, and a printable list you can save as a PDF. Import a backup, or a CSV from another app.
- **Reminders**: download a daily calendar event (works when the app is closed), plus a browser notification while the app is open.
- **Installable and offline**: a PWA with dark mode, responsive layout, keyboard and screen-reader support.
- **Support page**: optional donation links. Everything is free, and no feature is ever locked.

### Accounts, sync and groups (optional, needs Supabase)

- **Sign in with a one-time email code**: no password. Prayers made before signing in are added to the account.
- **Sync across devices**: works offline first. Changes upload a moment after you make them, and also when you come back online or return to the app. If the same prayer changed on two devices, the most recent change wins. Signing out removes your prayers from the device but not from your account.
- **Small groups**: create a group, invite people with a link or QR code, and choose for each request whether only you see it or a group does too. Members tap "I prayed" (once a day per request), and the person who asked sees "You've been prayed for" on Today. Group leaders can rename the group, remove members, reset the invite link, or delete the group.
- **Privacy**: enforced in the database (row-level security), not just the app. Only you can read your prayer rows. Group members see a shared request's title, details, updates and answer, never your follow-up dates, schedules or prayer counts. Members see your chosen display name, never your email. Leaving or deleting a group makes your shared requests private again. Signed-out visitors can read nothing.

### Notifications and the apps

- **Notifications:** "someone prayed for you", new and answered requests in your groups, and a daily reminder at your local time. They work in browsers and the installed web app (web push, end-to-end encrypted) and in the iPhone/Android apps (Apple/Google push). Each type can be turned off, and each device turned on or off.
- **iPhone and Android apps:** the same app, packaged with Capacitor (`ios/`, `android/`). The **Apps** workflow builds both on every push to `main`, and its Android run has an installable test APK under Artifacts. See [docs/APP_STORES.md](docs/APP_STORES.md) for publishing, including the one-time Supabase cron job that sends notifications.
- **Account deletion** in Settings, as both stores require, and a privacy policy at `/#/privacy`.

Without Supabase settings, the app runs entirely in the browser (`localStorage`), and Groups and account features are hidden.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run typecheck
npm run build      # production build in dist/
```

### Running the backend locally

Requires Docker.

```bash
npx supabase start            # starts Postgres, Auth and the API, and applies supabase/migrations
npx supabase status           # shows the local API URL and anon key
```

Put the local URL and anon key in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then run `npm run dev`. Sign-in emails go to the local mail viewer at http://127.0.0.1:54324.

**Updating the live database:** the Supabase GitHub integration hasn't been applying migrations to this project, so run `python3 scripts/make-db-update.py > database-update.sql` and paste the output into the dashboard's SQL Editor. It's safe to run any number of times.

`npm run test:integration` runs the backend tests (privacy rules, group permissions, two-device sync) against the local stack.

### Setting up Supabase for real use

1. Create a free project at [supabase.com](https://supabase.com).
2. Apply the database schema. Either:
   - run `npx supabase login`, `npx supabase link --project-ref <your-project-ref>`, then `npx supabase db push`, or
   - paste `supabase/migrations/20261011000000_init.sql` into the dashboard's SQL Editor and run it.
3. In **Authentication → URL Configuration**, set the Site URL to where the app is hosted, and add it to Redirect URLs.
4. In **Authentication → Email Templates**, edit both **Magic Link** and **Confirm signup** so they include the code. Copy the body from `supabase/templates/magic_link.html`, which uses `{{ .Token }}`. Without this step, emails contain only a link. The link doesn't open inside an installed app, so people need the code.
5. Supabase's built-in email service only sends a few emails per hour. Before inviting real users, set up your own email sender under **Project Settings → Authentication → SMTP**. Resend, Postmark and Amazon SES all work, and most have a free tier.
6. Copy the Project URL and the anon (publishable) key from **Project Settings → API** into `.env` (see `.env.example`), then rebuild.

### Renaming the app

The name lives in one place, `brand.json`:

```json
{
  "name": "Intercede",
  "shortName": "Intercede",
  "tagline": "Pray for one another",
  "description": "…",
  "themeColor": "#4f46e5"
}
```

Edit it and rebuild. The page title, home-screen name (`shortName`, keep it under about 12 characters), header, welcome text, support page, share messages and download file names all update. Sign-in emails don't mention the name, so they need no changes. Saved data isn't affected: the browser storage keys stay the same.

The app icon is `public/icon.svg`. Replace that file to change it.

### Donation links

Copy `.env.example` to `.env` and fill in either link, then rebuild:

```
VITE_KOFI_URL=https://ko-fi.com/yourname
VITE_STRIPE_URL=https://donate.stripe.com/...
```

With no links set, the Support page says donations aren't set up yet, and the occasional prompt on the Answered page stays hidden.

### Deploying

The app is set up for **Netlify** (`netlify.toml`): every push to `main` builds and publishes it. The Supabase project URL and publishable key are in `.env.production` (public by design), shared by the website and app builds. Optional donation links go under **Project configuration → Environment variables**.

Any static host works. `npm run build` produces a static site in `dist/`, and the app uses hash routing, so no rewrite rules are needed.

## Project layout

```
src/lib/        Pure logic: types, reducer, session rotation, tags, bulk parsing,
                stats, export/import. Covered by src/lib/logic.test.ts
src/lib/sync.ts Pure sync rules: what to upload, how to merge pulled changes
src/sync/       Supabase client, row mapping, API calls, account and sync provider.
                integration.test.ts checks the backend against a real database
supabase/       Database schema and row-level security (migrations/), the notify edge
                function (functions/notify), local config
ios/, android/  Native app projects (Capacitor). assets/ holds the icon and splash sources
src/pages/      Today, Prayers, Prayer detail, Session, Answered, Settings, Support, Print
src/components/ Shared UI
public/sw.js    Offline service worker
```

## Roadmap

- Done: accounts, sync, small groups, the "I prayed" counter, and the "you've been prayed for" view.
- Done: notifications (web and native push), iPhone and Android app projects, account deletion.
- Next: store submission (see docs/APP_STORES.md), a reviewer sign-in, a signed Android release build in CI, and a weekly email summary for each group.
- Later: voice entry, home-screen widgets, subscribing to church or ministry prayer feeds, a moderated public prayer wall.
