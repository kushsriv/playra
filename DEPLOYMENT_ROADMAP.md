# PLAYRA — Deployment Roadmap

Single source of truth for "what's done, what's next, in what order."
Read top to bottom — phases are sequenced by priority, not by how
interesting they are. (Last rewritten July 2026, post-launch.)

---

## Phase −1: Shipped

The app is **live** at GitHub Pages, deploying automatically on every push
to `main` via `.github/workflows/deploy.yml`. Full feature set:

- 7-view UI (Command Center, LFG Radar, Missions, Discover swipe deck,
  Game Hubs with an autoplay carousel, Tournaments, Gamer Card), XP/quest/
  achievement economy, PWA install + offline shell, hotkeys, moderation
  blocklist, XSS-hardened rendering throughout
- Supabase backend, code-complete: Discord OAuth, server-side profiles,
  real LFG posts with live realtime feed, atomic squad-join (slots fill
  live on every client), real matchmaking scored from actual profiles,
  endorsements, presence badge
- **Real squad rooms** — the actual product loop: players who join the
  same post see each other live, ready checks sync in realtime, and once
  the whole squad is ready, Discord handles reveal so people can actually
  connect. This was the single biggest gap in earlier versions and it's closed.
- Secrets handling: no real API keys committed to source; GitHub Actions
  injects them from encrypted repo secrets at build time

Everything above is real code, verified against a **mocked** Supabase
client (no live project existed while it was built). It has since been
connected to a real project — Phase 0 is making sure that connection is
actually solid and safe.

---

## Phase 0: Verify & secure what's already live (do this now, before anything else)

Nothing below this line matters if the live deployment is misconfigured
or leaking credentials. This phase is entirely checking/fixing, no new features.

1. **Rotate the Supabase anon key.** An earlier version of this repo had
   it committed in plaintext on `main`. The key is *designed* to be public
   (RLS is the real protection), but git history exposure is still worth
   closing — Settings → API Keys → revoke the current publishable key,
   issue a new one, update the `SUPABASE_ANON_KEY` repo secret.
2. **Confirm RLS is actually enabled** on all three tables — Supabase
   Table Editor → `profiles` / `lfg_posts` / `endorsements` should each
   show a "RLS enabled" indicator. `schema.sql` turns this on, but verify
   it took effect rather than assuming.
3. **Run the two-browser live test** end to end (checklist is in
   `SETUP.md` step 6): sign in with two different Discord accounts in two
   browsers, post an LFG, join it from the other browser, confirm both
   land in the same live squad room and the Discord handles reveal on
   mutual ready. This has never been run against real infrastructure —
   only against a mock. It needs to happen before calling this "done."
4. **Add the GitHub Pages URL to Supabase's redirect allow-list**
   (Authentication → URL Configuration) if not already there — sign-in
   silently fails without this.
5. **Spend 10 minutes trying to break it**: post an empty LFG, post one
   with a slur (should be blocked client-side — confirm it's *also*
   blocked if you bypass the UI and hit the API directly, since
   client-side blocklists are trivially bypassed — see Phase 1.3), open
   two tabs and join the same post twice, sign out mid-session.

## Phase 1: Close the trust gaps (do this before inviting real strangers)

The app works. These are the things that go wrong the first time someone
who isn't you uses it.

1. **Rate limiting.** Nothing stops a script from posting 500 LFG entries
   a second or spamming join requests. Cheapest fix: a Postgres trigger
   or check in `join_lfg`/insert policies that rejects more than N posts
   per user per minute. Supabase also has built-in rate limits you can
   tighten (Settings → Rate Limits).
2. **Server-side moderation.** The current blocklist runs in the
   browser — anyone can open dev tools and post whatever they want
   straight to the Supabase REST API, bypassing it entirely. Move the
   check server-side: either a Postgres check constraint against a
   blocklist, or (better, catches more than exact words) call the
   **Google Perspective API** or OpenAI's moderation endpoint from a
   Supabase Edge Function on insert.
3. **Report/block flow.** No way for a user to report a bad actor or
   block someone from matching with them again. Minimum viable version:
   a `reports` table + a "report" button on rec cards and squad rooms.
4. **Terms of service / privacy note.** You're now storing Discord
   handles and profile data on real people. Even a one-paragraph notice
   on the onboarding screen ("your Discord handle is only shown to
   squadmates who ready up with you") is worth adding before this gets
   real traffic.

## Phase 2: Make matchmaking credible (the actual differentiator)

Right now "Immortal+" and playstyle tags are self-reported — anyone can
claim anything. This is the gap between "a nice UI" and "a tool people
trust."

1. **Rank verification.** Pick one game to start (Valorant is the
   obvious first target given the current data):
   - **HenrikDev API** (`docs.henrikdev.xyz`) — unofficial but the
     community standard, no approval wait
   - **Riot Games API** — official, but needs production-app approval;
     apply now since approval takes time, migrate later
   - Store a `verified_rank` field on `profiles`, separate from the
     self-reported `styles`/`goals` tags, and show a distinct badge for it
2. **Schedule-based matching.** `computeCompat()` currently scores
   games/goals/langs/styles overlap only — "schedule overlap" is still
   decorative. Add an availability bitmask (weekday × hour-block) to
   onboarding, fold `popcount(a & b)` into the score.
3. **Reputation from real sessions, not just endorsements.** Endorsements
   exist but anyone can endorse anyone with no session history check.
   Tie endorsement eligibility to "you were both members of the same
   squad room" once that's tracked server-side (see Phase 3.1).

## Phase 3: Complete the product loop

1. **Persist squad room history.** Realtime presence is ephemeral —
   there's no record afterward of who played with whom. A `sessions`
   table (post_id, members, started_at, completed_at) unlocks: real
   reputation gating (3.3 above), a "recent squads" list, and analytics
   on whether matches actually convert to games played.
2. **Voice.** Cheapest credible version: a Discord bot that auto-creates
   an invite to a voice channel when a squad locks, posted alongside the
   handle reveal. Skip building a WebRTC voice stack until there's
   evidence people want in-app voice over just using Discord (which they
   already have installed).
3. **Tournament brackets.** Don't build this — integrate **start.gg** or
   **Challonge**'s API for bracket management, keep PLAYRA as the
   roster-formation layer feeding into it.
4. **Push notifications.** Web Push (works with the existing PWA, no
   extra vendor) for "your LFG post filled" / "a squadmate is ready."

## Phase 4: Scale & polish (once there are real users to justify it)

1. Split `app.js` into ES modules — it's grown past the point a single
   file stays comfortable to navigate.
2. Analytics (Plausible/Umami — privacy-friendly, self-hostable) to see
   which views/features people actually use before investing further.
3. SEO/OG tags for link previews when someone shares the site.
4. Cron cleanup of expired `lfg_posts` rows (query is already commented
   at the bottom of `schema.sql`) so the table doesn't grow unbounded.
5. Multi-game rank verification beyond Valorant (Tracker Network API
   covers Apex/CS2/Fortnite in one key), Steam/Bungie/Faceit for others.

---

## Why this order

Security and verification (Phase 0) come before trust/safety (Phase 1)
come before making the core feature *credible* (Phase 2) come before
*completing* the loop (Phase 3) come before anything that only matters
at scale (Phase 4). Building rank verification or voice chat while the
live deployment's RLS status is unverified, or while a client-side-only
blocklist is the entire moderation story, would be solving interesting
problems in the wrong order. Each phase assumes the ones above it are
actually done, not just built.

### Sources (Phase 2/3 vendor research)
- [HenrikDev unofficial Valorant API](https://github.com/Henrik-3/unofficial-valorant-api) · [Riot VALORANT API policies](https://www.riotgames.com/en/DevRel/valorant-api-launch) · [Tracker Network developers](https://tracker.gg/developers)
- [Supabase Realtime](https://github.com/supabase/realtime) · [Socket.IO vs Supabase Realtime (Ably)](https://ably.com/compare/socketio-vs-supabase)
- [LiveKit pricing](https://livekit.com/pricing) · [100ms vs LiveKit](https://www.videosdk.live/100ms-vs-livekit)
