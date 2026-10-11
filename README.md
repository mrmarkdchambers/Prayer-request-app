# Prayer List

A free, private prayer request tracker. Add requests, pray through a few each day, post updates as things change, and keep a journal of answered prayers.

See [docs/RESEARCH.md](docs/RESEARCH.md) for the market research and feature plan behind it.

## Features (v1)

- **Quick capture**: type `Sarah: healing after surgery #family` and the name and tag are picked up automatically. Tags autocomplete.
- **Bulk add**: paste a whole list, one request per line.
- **Daily prayer session**: a focused, one-at-a-time view. Prayers set to a fixed day (daily, certain weekdays, or monthly) are always included. The rest rotate, least recently prayed first, taking turns across tags. Swipe or use the keyboard. Optional timer.
- **Request timeline**: post updates on a request ("surgery moved to Tuesday"), mark it answered with a note, archive it, or move it back to active.
- **Answered journal**: answered prayers grouped by month, with how long each one took and stats.
- **Follow-ups**: set a date to check in, and it shows on Today when due.
- **Search and filters**: by text, status, tag, or person.
- **Prayer counts**: how many times you've prayed for each request, and when you last did.
- **Backup and export**: JSON backup, CSV spreadsheet, and a printable list you can save as a PDF. Import a backup, or a CSV from another app.
- **Reminders**: download a daily calendar event (works when the app is closed), plus a browser notification while the app is open.
- **Installable and offline**: a PWA with dark mode, responsive layout, keyboard and screen-reader support.
- **Support page**: optional donation links. Everything is free, and no feature is ever locked.

All data is stored in the browser (`localStorage`). There is no account and no server yet.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run typecheck
npm run build      # production build in dist/
```

### Donation links

Copy `.env.example` to `.env` and fill in either link, then rebuild:

```
VITE_KOFI_URL=https://ko-fi.com/yourname
VITE_STRIPE_URL=https://donate.stripe.com/...
```

With no links set, the Support page says donations aren't set up yet, and the occasional prompt on the Answered page stays hidden.

### Deploying

`npm run build` produces a static site in `dist/`. It can be hosted anywhere static, such as Netlify, Vercel, Cloudflare Pages, or GitHub Pages. The app uses hash routing, so no rewrite rules are needed.

## Project layout

```
src/lib/        Pure logic: types, reducer, session rotation, tags, bulk parsing,
                stats, export/import. Covered by src/lib/logic.test.ts
src/lib/storage.ts  Repository interface. Swap in a synced backend here.
src/pages/      Today, Prayers, Prayer detail, Session, Answered, Settings, Support, Print
src/components/ Shared UI
public/sw.js    Offline service worker
```

## Roadmap

1. **Accounts and sync** (Supabase): sign in with an email link, sync across devices, real push reminders.
2. **Small groups**: invite by link or QR code, shared requests, per-request visibility (private, group, or public), an "I prayed" counter that notifies the requester, and a weekly group summary.
3. Voice entry, home-screen widgets, subscribing to church or ministry prayer feeds.
4. App store packaging with Capacitor.
