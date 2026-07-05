# PLAYRA — Deployment Readiness & Component Research

Status assessment of the current prototype, the gaps between it and a real product, and researched component/vendor picks for each gap. (July 2026)

---

## 1. What is already done

The repo is a complete, self-contained front-end prototype — ~1,500 lines total, zero dependencies:

| Area | Status | Where |
|---|---|---|
| Landing page (particles, neon rain, parallax, synth SFX) | ✅ Done | `js/app.js` (IIFE at ~line 145), `index.html` |
| Sound engine (Web Audio, no files, mute toggle) | ✅ Done | `Sfx` module, `js/app.js:1-25` |
| 3-step onboarding (callsign, avatar, games, langs, playstyle, goals) | ✅ Done | `onboardOpen()` |
| Command Center dashboard (canvas radar, recs, quests, friends) | ✅ Done | `renderRecs/renderFriends/renderQuests` |
| LFG Radar (filters, live countdowns, slot fills, post composer) | ✅ Done | `renderLfg()`, countdown interval |
| Mission Marketplace (9 cards, difficulty, reputation) | ✅ Done | `renderMissions()` |
| Discover swipe deck (pointer-event drag physics, compat bars) | ✅ Done | `renderDeck()/bindDrag()` |
| Game Hubs (9 games, accent-color retheme) | ✅ Done | `renderHubs()/selectHub()` |
| Tournament Hub (register flow) | ✅ Done | `renderTours()` |
| XP economy (levels, quests, achievements, toasts) | ✅ Done | `addXP()/completeQuest()/unlockAch()` |
| Squad room (ready check, countdown, simulated handoff) | ✅ Done | `openRoom()` |
| Responsive layout + `prefers-reduced-motion` | ✅ Done | `css/styles.css` |

**Everything is simulated.** All data (`GAMES`, `LFG`, `MISSIONS`, `RECS`, `SWIPES`, `TOURS`, `FRIENDS`) is hardcoded in `js/app.js`; state lives in a single in-memory object `S` and vanishes on refresh. There is no backend, auth, persistence, or networking of any kind.

---

## 2. Gaps to "deployable"

The static site itself is deployable **today** (Cloudflare Pages / Vercel / Netlify / GitHub Pages — no build step). What's missing to make it a *product*:

### Tier 0 — quick wins, no backend needed
1. **`localStorage` persistence** of `S` (profile, XP, quests, achievements) — the single highest-value/lowest-effort change; right now a refresh wipes the user.
2. **Skip-onboarding on return visit** (follows from #1).
3. **PWA manifest + service worker** — installable on phones, offline shell. Gamers live on mobile.
4. **XSS hardening** — user input (`postGoal`, `obName`) is interpolated straight into `innerHTML` (`js/app.js:473`, `renderProfile`). Fine for a demo, a real vuln the moment content is shared between users. Escape or switch to `textContent`.
5. **SEO/meta/OG tags + analytics** (Plausible/Umami for privacy-friendly, self-hostable).
6. **Split `app.js`** into ES modules (state/data/render/audio) before it grows further — still no build step required.

### Tier 1 — minimum real product (accounts + real LFG)
1. **Auth — Discord OAuth first.** The entire target audience has Discord; it also gives you username, avatar, and guild membership for free. Supabase Auth or Clerk both ship a Discord provider in minutes.
2. **Database** — Postgres via **Supabase** (fits perfectly: auth + Postgres + realtime + storage in one free tier) or Neon if you want just the DB.
3. **Real LFG posts** — CRUD on posts with expiry (`mins` becomes a real `expires_at`), the existing countdown UI already handles the rendering.
4. **Realtime presence & live post feed** — Supabase Realtime (Presence + Postgres Changes) covers "who's online" and "new LFG appeared" with no extra server. Socket.IO on a small VPS is the alternative if you outgrow it; PartyKit/Durable Objects if you go Cloudflare-edge.
5. **Squad room state sync** — ready checks become a shared realtime channel instead of `setTimeout` fakes.

### Tier 2 — the moat (verified identity + matchmaking)
1. **Rank verification** — the killer credibility feature for LFG ("Immortal+" tags mean nothing unverified):
   - **Riot Games API** (official; Valorant + LoL match history & rank; requires production app approval)
   - **HenrikDev unofficial Valorant API** (`docs.henrikdev.xyz`) — the de-facto community standard while waiting for Riot prod keys
   - **Tracker Network Developer API** (`tracker.gg/developers`) — multi-title (Apex, CS2, Fortnite…)
   - **Bungie.net API** (Destiny 2), **Steam Web API** (CS2 hours/inventory), **Faceit Data API** (CS2 ELO)
2. **Real matchmaking scoring** — the compat % in `SWIPES` becomes a computed score: schedule overlap (stored availability windows), language intersection, goal alignment, endorsement history. Start with a plain SQL/TypeScript scoring function; Google **Open Match** only if you ever need engine-grade scale.
3. **Endorsement flow** — post-session mutual endorsements feed the reputation numbers that `MISSIONS`/`ENDORSE` currently fake. This is the anti-toxicity moat.

### Tier 3 — voice, tournaments, safety
1. **Voice in squad rooms** — **LiveKit** (open-source, self-hostable, free Build tier, downstream now $0.12/GB) for control/cost; **100ms** (Indian company — matches the ₹/Mumbai positioning, prebuilt room UI) to ship fastest. Or skip building voice entirely at first: **Discord deep links** — auto-create an invite to a voice channel via a bot when the squad locks in. Cheapest credible v1.
2. **Tournament brackets** — don't build them: integrate **start.gg API** or **Challonge API** for brackets/registration; keep PLAYRA as the roster-formation layer.
3. **Moderation** — **Google Perspective API** or OpenAI moderation endpoint on LFG titles/chat; report/block flows. Non-optional once strangers can post.
4. **Push notifications** — Web Push (free, works with the PWA) for "your LFG filled" / "ready check started"; OneSignal if you want a dashboard.

---

## 3. Niche components worth knowing about (research findings)

| Need | Niche pick | Why it fits PLAYRA |
|---|---|---|
| Realtime rooms at edge | **PartyKit / Cloudflare Durable Objects** | One Durable Object per squad room = exactly the "temporary room with shared ready-check state" model |
| Presence + DB changes, zero servers | **Supabase Realtime** (Elixir/Phoenix, Apache 2.0) | Lobbies/LFG feeds are its documented sweet spot; not for twitch gameplay, which PLAYRA doesn't need |
| Valorant rank without Riot prod approval | **HenrikDev API** | Community standard; key via their Discord |
| Multi-game stats in one key | **Tracker Network dev API** | Free tier; Apex/CS2/Fortnite/etc. |
| Voice, self-host escape hatch | **LiveKit** (OSS) | 2.5–8× cheaper than Agora-class vendors at standard rates; free tier to prototype |
| Voice, fastest ship + India presence | **100ms** | Prebuilt room components, role permissions |
| Zero-build voice v1 | **Discord bot + voice-channel invite deep link** | Meets gamers where they already are |
| Brackets | **start.gg API** | Standard for esports; don't reinvent |
| Toxicity scoring | **Perspective API** | Free, purpose-built for comment toxicity |
| Scheduling overlap | Store availability as **bitmask per weekday-hour** | Compat "schedule overlap" bar becomes a real `popcount(a & b)` — cheap and exact |

---

## 4. Suggested order of attack

1. `localStorage` persistence + XSS fixes + PWA + deploy to Cloudflare Pages *(days)*
2. Supabase: Discord auth + LFG posts table + realtime feed *(1–2 weeks)*
3. Presence, squad-room sync, push notifications *(1–2 weeks)*
4. Rank verification (HenrikDev + Tracker Network), real compat scoring *(2–3 weeks)*
5. Endorsements, moderation, Discord-invite voice handoff *(2–3 weeks)*
6. start.gg tournament integration, LiveKit/100ms native voice *(later)*

### Sources
- [Socket.IO vs Supabase Realtime (Ably, 2026)](https://ably.com/compare/socketio-vs-supabase) · [supabase/realtime](https://github.com/supabase/realtime) · [PartyKit](https://www.partykit.io/)
- [Riot VALORANT API policies](https://www.riotgames.com/en/DevRel/valorant-api-launch) · [HenrikDev unofficial Valorant API](https://github.com/Henrik-3/unofficial-valorant-api) · [Tracker Network developers](https://tracker.gg/developers)
- [LiveKit pricing](https://livekit.com/pricing) · [100ms vs LiveKit](https://www.videosdk.live/100ms-vs-livekit) · [LiveKit alternatives comparison](https://www.buildmvpfast.com/alternatives/livekit)
