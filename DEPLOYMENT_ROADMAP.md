# PLAYRA — Deployment Roadmap

Single source of truth for "what's done, what's next, in what order."
Read top to bottom — phases are sequenced by priority, not by how
interesting they are. (Last rewritten July 2026 — Discord auth is now
live and working on the real deployment, not just against a mock.)

---

## Phase −1: Shipped

The app is **live** at GitHub Pages, deploying automatically on every push
to `main`. Full feature set:

- 7-view UI, XP/quest/achievement economy, PWA install + offline shell,
  hotkeys, moderation blocklist, XSS-hardened rendering throughout
- Supabase backend: Discord OAuth (**confirmed working against real
  infrastructure**, not just a mock — see Phase 0), server-side profiles,
  real LFG posts with live realtime feed, atomic squad-join, real
  matchmaking scored from actual profiles, endorsements, presence badge
- **Real squad rooms** with Discord handle exchange on mutual ready —
  the actual product loop
- **Discord sign-in is now mandatory** whenever a backend is configured —
  the old "continue as guest" path (which let anyone build a Gamer Card
  with zero real identity behind it) is gone. Guest mode still exists as
  the *only* mode when no backend is configured at all, unchanged.
- Sign-out is a visible red button, top right, not buried in a menu
- Secrets handling: no real API keys committed to source; GitHub Actions
  injects them from encrypted repo secrets at build time

---

## Phase 0: Verify & secure what's live

| Item | Status |
|---|---|
| Discord OAuth end-to-end on real infrastructure | ✅ **Confirmed** — hit and fixed two real bugs to get here: a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` repo-secrets step, and a missing `email` OAuth scope that produced `Error getting user email from external provider` for at least one real user |
| Redirect URL allow-listed in Supabase | ✅ Implied working — auth completes and returns to the app |
| Rotate the old leaked anon key (from early git history) | ❓ **Still unconfirmed** — you were shown how; worth 30 seconds to check Settings → API Keys that the *current* publishable key isn't the one that was ever committed |
| RLS actually enabled on all three tables | ❓ **Still unconfirmed** — check Table Editor for the RLS indicator on `profiles`/`lfg_posts`/`endorsements` |
| Two-person live test (two different Discord accounts, same squad) | ❓ **Not yet done** — single-user sign-in is confirmed, but nobody has verified two strangers can see each other's posts, fill each other's slots, and land in the same room together on the live site |

Do the three ❓ items before treating this as production-ready for
strangers. They're each under 5 minutes.

## Phase 0.5: Two things this session's fixes exposed (new)

1. **Self-reported Discord handle is now redundant, possibly harmful.**
   Onboarding still asks users to *type* their Discord handle for the
   squad-reveal feature — but they just proved their real Discord
   identity via OAuth. A typed handle can be wrong, outdated, or
   someone else's, which undermines the exact trust the mandatory
   sign-in was supposed to buy. Fix: pull the real username from
   `user.user_metadata` (Discord's OAuth payload includes it) and either
   auto-fill the field read-only, or drop the manual field entirely and
   use the verified one.
2. **Mobile check on the new topbar button.** The red "SIGN OUT" text
   button was verified on desktop; the topbar already reflows on mobile
   (`@media max-width:920px` hides several elements) — worth a quick
   check that it doesn't collide with the XP bar or overflow on a phone
   screen now that it's a text button instead of a small icon.

## Phase 1: Close the trust gaps (before inviting strangers beyond your friend)

Your friend already hit one real bug on first contact (the OAuth scope
issue) — that's exactly what this phase is for: things that only surface
once someone who isn't you is using it.

1. **Rate limiting** — nothing stops scripted LFG-post or join spam yet.
2. **Server-side moderation** — the blocklist is client-side only,
   trivially bypassed by hitting the Supabase REST API directly.
3. **Report/block flow** — no way to flag a bad actor yet.
4. **One-paragraph privacy notice** — now more important than before:
   sign-in is mandatory, so *every* user's Discord identity and handle
   are stored, not just opt-in guests.

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

## Phase 4: Scale & polish (once there are real users to justify it)

1. Split `app.js` into ES modules.
2. Privacy-friendly analytics (Plausible/Umami) to see what people
   actually use before investing further.
3. SEO/OG tags, cron cleanup of expired `lfg_posts`.
4. Multi-game rank verification beyond Valorant.

---

## Immediate next 3 things, in order

Given everything above, if you want a single "what do I do right now"
answer:

1. **Run the two-person live test** (Phase 0) — get your friend (or
   anyone else with a Discord account) to sign in alongside you, post an
   LFG, join it, and confirm you land in the same room together. This is
   the one thing that's never actually been verified end-to-end on real
   infrastructure, and it's the entire point of the product.
2. **Fix the self-reported Discord handle** (Phase 0.5.1) — quick,
   closes a trust gap the mandatory-auth change just opened, and I can
   do this one now if you want.
3. **Confirm RLS + rotate the old key** (Phase 0) — two dashboard checks,
   5 minutes total, then Phase 0 is genuinely closed out.

### Sources (Phase 2/3 vendor research, unchanged from earlier)
- [HenrikDev unofficial Valorant API](https://github.com/Henrik-3/unofficial-valorant-api) · [Riot VALORANT API policies](https://www.riotgames.com/en/DevRel/valorant-api-launch) · [Tracker Network developers](https://tracker.gg/developers)
- [Supabase Realtime](https://github.com/supabase/realtime) · [Socket.IO vs Supabase Realtime (Ably)](https://ably.com/compare/socketio-vs-supabase)
- [LiveKit pricing](https://livekit.com/pricing) · [100ms vs LiveKit](https://www.videosdk.live/100ms-vs-livekit)
