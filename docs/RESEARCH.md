# Prayer Request App: Market Research & Feature Plan

_Compiled 2026-10-11 from web search results: app store listings, third-party reviews, and privacy audits. Direct App Store pages could not be fetched from the research environment, so review quotes come from search-result summaries._

## 1. Apps surveyed

| App | Model | What it does best | What users complain about |
|---|---|---|---|
| **PrayerMate** | Free, donations, optional ~$2.99/mo patron | Daily **rotation**: picks a few items from each category as swipeable cards. Scheduling by date, weekday, month, or "not prayed for in a while". Subscribes to 500+ ministry prayer feeds (Open Doors, Operation World). Answered-prayer history is kept. Private small-group sharing. | Functional but plain UI with a steep learning curve. Limited customisation. Cross-device sync is limited (one reviewer couldn't sync iPad ↔ Android). |
| **Echo Prayer** | Free; Pro ~$4.99/mo or $39.99/yr | Clean, simple UI with no ads. Reminders, answered tracking, scripture attachments, #hashtag organisation. Public prayer feeds. | Groups and sync are **paywalled**, and users want a one-time purchase. Poor iPad/tablet experience. Accessibility issues. Bugs with viewing prayers and clearing notifications. No **bulk add**. Tagging is clunky, so users want a hashtag button and tag suggestions. Public feed quality varies. |
| **PrayerList Pro** (iOS) | One-time IAP, no account | iCloud sync. PDF "prayer bulletin" and plain-text export. | Apple only. Bug: leaving the screen before tapping "answered" resets the prayer timer. |
| **PrayerLife** (iOS) | — | Counts **how many times** you've prayed for each request. Tag categories. Answered archive. | Small user base. |
| **Prayerify / PrayerCircle** | Freemium | Per-request visibility (public, group-only, private). Active/Answered/Archived states. Reordering. Daily reminders. | — |
| **ClockPrayer**, **Prayer Tracker App**, **GroupPrayer** | Mostly new | Reminders per category, PDF export, invite to a group by link or **QR code**, privacy-first with no ads. | Very few ratings. PrayMore users reported requests "disappearing" in small groups. |
| **Prayer Notes Pro**, **Faithful** | Paid ($19.99) / freemium | Home-screen widget. Share via AirDrop or SMS. **Voice transcription**. Answered timeline. | Price. No export or Watch support mentioned. |
| **Apple Watch–focused journal** (id1483009713) | — | Watch app with iCloud sync. | No search and no widget. |
| **My Prayer Room**, **Prayminder** | Free, local-only | Private and uncapped. | No sync, no backup, no export, no restore guarantee. Long text gets truncated. |
| **Pray First** (Church of the Highlands) | Free | Sync after sign-in. | Inconsistent privacy disclosures. |
| **Pray.com** | Freemium content | Large content library. | **Privacy**: Mozilla rated its practices "absolutely terrible". Its policy allowed supplementing data from data brokers. A 2020 leak exposed data on ~10M users. Instapray shut down. |
| **Church tools** (Seedling, PrayerPop, TouchPoint Prayer Digest, Text-Em-All) | B2B | Intake → assignment → **follow-up** workflow. Daily or weekly digest emails. SMS prayer chains. Spam controls. | Fragmented: churches stitch together 2–3 tools. |

## 2. Table-stakes features (every good app has these)

1. Fast capture: a title, optional details, a person, and a category or tag.
2. Status lifecycle: **Active → Answered → Archived**, with the date answered and an "how it was answered" note.
3. Answered-prayer history and timeline, so testimonies are never deleted.
4. Categories and tags, with a hashtag button and tag suggestions.
5. Daily reminders, configurable per category.
6. Search and filter by person, tag, status, or date.
7. Scripture attached to a request.

## 3. Best-in-class features to adopt

- **PrayerMate-style daily session**: auto-select N items per category using schedules and "least recently prayed", then let the user swipe through cards.
- **Prayer count and last-prayed date** per request (from PrayerLife).
- **Per-request visibility**: private, a specific group, or public (from Prayerify).
- **Groups by invite link or QR code**, with shared request feeds.
- **"I prayed" taps** that notify the requester ("3 people prayed for this today").
- **Export**: PDF bulletin, plain text, and JSON/CSV backup (from PrayerList Pro and ClockPrayer).
- **Subscribe to external feeds** such as a church's or ministry's prayer list.
- **Widget** for the home screen, plus voice-to-text entry.

## 4. Gaps users ask for that nobody does well

| Pain point from reviews | Our answer |
|---|---|
| Groups and sync locked behind subscriptions | Sync and basic groups **free**. Any paid tier is a one-time unlock or optional supporter tier. |
| Data loss, no backup, local-only apps | Cloud sync and one-tap full export/import from day one. Offline-first with conflict-safe sync. |
| Privacy scandals (Pray.com) | No ads, no trackers, no data brokers, private by default. Plain-language privacy page. End-to-end encryption for private requests is a stretch goal. |
| Poor tablet / iPad layout, accessibility | Responsive layout. Screen-reader labels, dynamic type, high contrast, keyboard navigation. |
| No bulk add | Paste a list, and each line becomes a request. |
| Clunky tagging | Inline #tag autocomplete and a tag picker. |
| Notification bugs, timer reset if you leave before saving | Autosave everything, with robust notification state. |
| Requests "disappearing" in groups | Server-authoritative group data with an activity log ("Mark archived this"). |
| Truncated long text | Full-text display and expandable cards. |
| No follow-up loop (church tools) | **Follow-up reminders** ("check in with Sarah on Friday") and **updates** on a request (a mini timeline). |
| Learning curve (PrayerMate) | Two-tap capture, a guided first run, and sensible defaults. |
| Public-feed quality and spam | Groups are invite-only. Any public wall gets moderation, reporting, and rate limits. |

## 5. Our differentiators

1. **Request timeline**: every request gets updates ("surgery moved to Tuesday", "answered!") instead of being a static note.
2. **Answered-prayer journal / testimony view**: a reflective "Ebenezer stones" screen with stats ("47 answered this year").
3. **Prayer session mode**: a focused, distraction-free swipe-through with an optional timer.
4. **Prayer-partner nudges**: the requester sees who prayed. Groups get a weekly digest.
5. **Honest pricing and privacy** as a headline feature.

## 6. Proposed MVP scope (v1)

**In**
- Accounts (email magic link), personal prayer list, statuses, categories and tags, people.
- Request updates timeline and the answered journal.
- Daily prayer session using the rotation algorithm.
- Reminders (web push), search and filter, bulk add, export/import (JSON, CSV, printable PDF).
- Groups: invite link, shared requests, an "I prayed" counter, per-request visibility.
- Responsive PWA (installable on phone, tablet, and desktop), accessible, dark mode, works offline.

**Later**
- Native widgets and Apple Watch app, voice entry, external ministry feeds (RSS/JSON).
- Church admin tools: intake form, assignment, email/SMS digest.
- End-to-end encryption, public prayer wall with moderation.

## 7. Suggested tech stack

- **Frontend**: React + TypeScript + Vite as an installable PWA (one codebase for iOS, Android, and desktop). It can be wrapped later with Capacitor for app-store distribution and native widgets.
- **Backend**: Supabase (Postgres, auth, row-level security for private and group data, realtime for groups), or a self-hosted Node + Postgres API.
- **Offline**: IndexedDB cache with a sync queue.
- **Notifications**: Web Push (VAPID), with native push after the Capacitor wrap.

## Sources
- https://learnofchrist.com/directory/prayer-apps
- https://learnofchrist.com/resources/prayermate
- https://learnofchrist.com/resources/echo-prayer
- https://learnofchrist.com/resources/my-prayer-room
- https://biblequestions.info/reviews/review-echo-prayer-app/
- https://marlvel.ai/apps/echo-prayer
- https://faith.tools/app/prayermate
- https://www.challies.com/resources/prayermate/
- https://appshunter.io/ios/app/prayerlist-pro/id6758590684
- https://apps.apple.com/pl/app/prayerify/id6754110031
- https://apps.apple.com/us/app/-/id1211563107 (PrayerLife)
- https://apps.apple.com/us/app/prayer-notes-pro-ask-receive/id463170063
- https://play.google.com/store/apps/details?id=net.geero.prayermate
- https://foundation.mozilla.org/privacynotincluded/praycom/
- https://news.yahoo.com/nothing-sacred-apps-sell-prayers-153708345.html
- https://faith.tools/app/seedling-prayer-platform
- https://www.text-em-all.com/prayer-requests

## 8. Decisions (2026-10-11)
- **Platform:** start as a web app so we can tweak things, then package for the app stores later.
- **Audience:** personal use and small groups. Church admin tools are out of scope for now.
- **Pricing:** every feature is free. Funding comes from optional donations (see below).

### Donation model
- A web app can link to any payment provider with no app-store rules or fees. Options: Stripe Payment Links (~2.9% + 30¢), Ko-fi (0% on one-off tips), Buy Me a Coffee, GitHub Sponsors, Open Collective.
- Offer one-off and monthly giving. Monthly donors get a "Supporter" badge but no extra features.
- Ask gently. Keep a support page in Settings, plus at most one occasional prompt at a happy moment (for example after a prayer is marked answered). Never ask on app open, which reviewers called a "cash grab" in Echo.
- Running costs are near zero at small-group scale (Supabase and Vercel/Netlify free tiers), so donations only need to cover growth.
- **Later, for app stores:** Apple and Google only allow external donation links from registered nonprofits. Otherwise donations must be in-app "tips" with a 15–30% store cut. Donations are tax-deductible only if made through a 501(c)(3) or a fiscal sponsor.
