# PLAYRA — Deployment Roadmap

Single source of truth for "what's done, what's next, in what order."
Read top to bottom — phases are sequenced by priority, not by how
interesting they are. (Last rewritten July 2026 — Phases 0.5 and 1 are
now built and shipped; what's left needs either your Supabase dashboard
or a live two-person test, not more code.)

---

## Phase 2: Real-world readiness — SHIPPED

Everything below is built, and the SQL was executed and behaviour-tested
against a real PostgreSQL 16 instance (not just eyeballed).

**Integrity (was the biggest hole)**
- **XP/level is now server-owned.** `guard_profile_progression` rejects any
  client write to `level`/`xp`/`xp_need`/`achievements`/`is_admin`/
  `banned_until`; `award_xp()` is the only door, with a 500/award cap, a
  5000/24h cap, and `event_key` idempotency so replays can't double-pay.
  Previously anyone could set `level: 999` from devtools.
- **Endorsements now require a shared squad.** `squad_sessions` /
  `squad_members` record who actually played together, and a trigger rejects
  endorsements between accounts with no shared session. The Gamer Card's
  claim ("every badge was given by a real teammate") is now true.

**Content that was fake and is now real**
- **Missions** — real `missions` table with its own composer, rate limit
  (3/min), moderation trigger, realtime feed and accept tracking.
- **Tournaments** — real `tournaments` table. Creating one is admin-only,
  because tournaments advertise prize money.

**Safety**
- **Blocking** — self-serve, filters the blocked account out of every feed.
- **Bans have teeth** — `banned_until` is enforced in the RLS insert policies
  for LFG and endorsements, and inside `award_xp`. Previously a "banned" user
  could still post.
- **Report queue** — `admin_report_queue()` gives admins every report with a
  per-account report count, plus one-click 7-day ban / unban.

**Operations & compliance**
- **`purge_expired()`** on a daily pg_cron schedule — `lfg_posts` used to grow
  forever. Degrades to a notice if pg_cron isn't available rather than rolling
  back the script.
- **`export_my_data()` / `delete_my_account()`** — DPDP-style access and
  erasure, surfaced as buttons on the Gamer Card.
- **`client_errors`** + `window.onerror`/`unhandledrejection` reporting, so a
  broken production deploy is visible without waiting for a user to complain.

### Appointing the first admin

Admin is deliberately not settable from the client. In the Supabase SQL
editor (which connects as `postgres`, a trusted role the guard lets through):

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'you@example.com');
```

### Still open

- **Two-person live test** — still the single most valuable unverified thing.
- Rank verification (Riot/Steam) and real moderation (Perspective API) both
  need secrets, so they belong in a **Supabase Edge Function**, not the browser.
- Tournament brackets — consider integrating start.gg rather than building.
- No automated test suite in CI; the deploy workflow only deploys.

---

## Phase −1: Shipped

The app is **live** at GitHub Pages, deploying automatically on every push
to `main`. Full feature set:

- 7-view UI, XP/quest/achievement economy, PWA install + offline shell,
  hotkeys, XSS-hardened rendering throughout
- Supabase backend: Discord OAuth (**confirmed working against real
  infrastructure**), server-side profiles, real LFG posts with live
  realtime feed, atomic squad-join, real matchmaking scored from actual
  profiles, endorsements, presence badge
- **Real squad rooms** with Discord handle exchange on mutual ready
- **Discord sign-in is mandatory** whenever a backend is configured —
  no guest shortcut around it. Guest mode remains the only mode when no
  backend is configured at all.
- **Verified Discord handles** — pulled from the real OAuth identity,
  not self-typed, and re-derived on every sign-in so it can't go stale
  or be faked
- **Server-side rate limiting** (5 LFG posts/user/60s) and **server-side
  moderation** (Postgres-side twin of the client blocklist) — both
  independent of the client, so bypassing the UI doesn't bypass them
- **Report flow** — flag a teammate from Command Center or a squad room;
  captured in a `reports` table for manual review
- One-paragraph **privacy notice** on onboarding
- Sign-out is a visible red button, top right
- No real API keys committed to source; GitHub Actions injects them from
  encrypted repo secrets at build time
- Mobile: a real overflow bug (radar canvas pushing the dashboard 61px
  past the viewport edge) was found and fixed while checking the new
  sign-out button

---

## Phase 0: Verify & secure what's live

| Item | Status |
|---|---|
| Discord OAuth end-to-end on real infrastructure | ✅ **Confirmed** — fixed a missing repo-secrets step and a missing `email` OAuth scope to get here |
| Redirect URL allow-listed in Supabase | ✅ Implied working — auth completes and returns to the app |
| Server-side trust/safety (rate limit, moderation, reports) | ✅ **Shipped this session** — see Phase −1 |
| Re-run `schema.sql` on the live Supabase project | ✅ **Done** — first run hit a real bug (the realtime publication line wasn't idempotent and rolled back the whole script inside the SQL Editor's implicit transaction); fixed with a duplicate_object-swallowing DO block, re-run succeeded |
| RLS actually enabled on all 4 tables (`profiles`/`lfg_posts`/`endorsements`/`reports`) | ✅ **Confirmed in dashboard** |
| Rotate the old leaked anon key (from early git history) | ❓ **Still unconfirmed** — Settings → API Keys, confirm the *current* publishable key isn't the one that was ever committed |
| Game art URLs resolve on the live site | ❓ **Needs a look** — the build sandbox blocked every art CDN, so the hot-linked Steam/Riot URLs are unverified; broken ones fall back to the gradient tile by design, but check Game Hubs and report which show real art |
| Two-person live test (two different Discord accounts, same squad) | ❓ **Not yet done** — single-user sign-in is confirmed, but nobody has verified two strangers can see each other's posts, fill each other's slots, and land in the same room together on the live site. This is the whole point of the product and the one thing that's never been run for real. |

## Phase 1: Trust gaps — ✅ done (was the previous "next up")

Rate limiting, server-side moderation, report flow, and the privacy
notice all shipped this session (see Phase −1). Nothing left here except
verifying it actually works once `schema.sql` is re-run — the report
button, a deliberately-spammed post (should get rate-limited after 5),
and a slur posted via curl directly at the REST API (should get
rejected server-side even though it'd never reach the API from the UI)
are all worth trying once.

## Phase 2: Make matchmaking credible

1. **Rank verification** (HenrikDev API for Valorant first — no approval wait).
2. **Schedule-based matching** — `computeCompat()` doesn't use real
   availability data yet, only games/goals/langs/styles overlap.
3. **Reputation gated to real shared sessions**, not free-for-all
   endorsing (needs Phase 3.1 below first).

## Phase 3: Complete the product loop

1. **Persist squad room history** — a `sessions` table so there's a
   record after the fact, unlocking real reputation gating and a
   "recent squads" list.
2. **Voice** — cheapest credible version is a Discord bot posting a
   voice-channel invite alongside the handle reveal, not a custom
   WebRTC stack.
3. **Tournament brackets** via start.gg/Challonge API, not custom-built.
4. **Push notifications** via Web Push (already have the PWA shell).
5. **Report review UI or process** — reports currently land in a table
   only visible via the Supabase dashboard; no in-app moderation queue,
   no automated action (auto-hide, auto-ban) on repeat reports yet.

## Phase 4: Scale & polish (once there are real users to justify it)

1. Split `app.js` into ES modules.
2. Privacy-friendly analytics (Plausible/Umami) to see what people
   actually use before investing further.
3. SEO/OG tags, cron cleanup of expired `lfg_posts`.
4. Multi-game rank verification beyond Valorant.

---

## Immediate next 2 things, in order

1. **Re-run `supabase/schema.sql`** on your live project (SQL Editor →
   paste → run). Everything shipped this session is dead code against
   your live database until this happens — the reports table, the rate
   limit trigger, and the moderation trigger don't exist there yet.
2. **Run the two-person live test.** Grab your friend again, sign in as
   two different Discord accounts, post an LFG, join it, confirm you
   land in the same room and handles reveal on mutual ready. This is
   the one thing that's never been verified end-to-end for real, and
   it's the entire product.

RLS confirmation and the old key rotation are still open from before —
worth doing in the same sitting, but neither blocks the two items above.

### Sources (Phase 2/3 vendor research, unchanged from earlier)
- [HenrikDev unofficial Valorant API](https://github.com/Henrik-3/unofficial-valorant-api) · [Riot VALORANT API policies](https://www.riotgames.com/en/DevRel/valorant-api-launch) · [Tracker Network developers](https://tracker.gg/developers)
- [Supabase Realtime](https://github.com/supabase/realtime) · [Socket.IO vs Supabase Realtime (Ably)](https://ably.com/compare/socketio-vs-supabase)
- [LiveKit pricing](https://livekit.com/pricing) · [100ms vs LiveKit](https://www.videosdk.live/100ms-vs-livekit)
