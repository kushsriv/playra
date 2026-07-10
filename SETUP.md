# PLAYRA — deployment & backend setup

## Deploying the site (works today, no backend needed)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys the app
to GitHub Pages on every push to `main`. One-time setup:

1. Repo **Settings → Pages → Source**: select **GitHub Actions**.
2. Merge this branch to `main` (or push anything to `main`).
3. The site goes live at `https://<owner>.github.io/playra/`.

That URL is also what you'll add to Supabase's redirect allow-list in
step 4 below once you turn the backend on.

# Backend setup (Discord login + live LFG + presence + squad rooms)

PLAYRA runs with **zero setup** in guest/local mode — just open `index.html`.
Everything below is optional and only turns on once real Supabase
credentials exist. Until then, `Backend.enabled` is `false` and the app
behaves exactly as the original static prototype (localStorage only, no
accounts, no network calls).

**Credentials are never committed to the repo.** `js/config.js` is
git-ignored; production deploys get real values injected by the GitHub
Actions workflow from encrypted repo secrets (step 5). For local dev, copy
`js/config.example.js` to `js/config.js` and fill it in there — that copy
stays on your machine only.

## What this unlocks

- "Sign in with Discord" on the landing page
- Player profiles (Gamer Card, XP, quests, achievements) persisted server-side, not just in this browser
- Real LFG posts, visible to every visitor and updated live via realtime
- Joining a squad fills its slots live on every connected client
- **Real squad rooms**: players who join the same post see each other,
  ready-checks sync in realtime, and when everyone is ready each member's
  Discord handle is revealed (click to copy) so the squad can actually
  connect — this is the product's core handoff
- A "🟢 N LIVE" presence badge showing how many operators are actually connected

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is enough to start).
2. Once it's up, open **Project Settings → API** and copy:
   - **Project URL** — the bare `https://<ref>.supabase.co`, *not* the `/rest/v1/...` REST endpoint shown elsewhere on that page
   - **anon public key** (Supabase's newer dashboards call this the **Publishable key**)

## 2. Run the schema

1. Open **SQL Editor → New query** in your Supabase dashboard.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   This creates `profiles`, `lfg_posts`, and `endorsements` tables with row-level
   security policies and enables realtime on `lfg_posts`. It's idempotent — safe to
   re-run if you change something later.

## 3. Register a Discord OAuth app

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → New Application.
2. **OAuth2 → General**: copy the **Client ID** and **Client Secret**.
   (Discord only shows the secret once — if you lose it, you'll need to
   regenerate it and re-paste it into Supabase immediately.)
3. **OAuth2 → Redirects**: add the callback URL Supabase gives you — it's shown
   on the Discord provider settings page in step 4 below
   (`https://<your-project-ref>.supabase.co/auth/v1/callback`).

## 4. Enable the Discord provider in Supabase

1. In Supabase: **Authentication → Sign In / Providers → Discord** → toggle it on.
2. Paste the Discord **Client ID** and **Client Secret** from step 3.
3. Under **Authentication → URL Configuration**, add the URL you'll deploy
   PLAYRA to (and `http://localhost:8080` or similar for local testing) to
   **Redirect URLs** — Supabase will refuse to redirect back to a URL that
   isn't allow-listed here.

## 5. Add repo secrets for production, or a local config.js for dev

**Production (GitHub Pages deploy):**

1. Repo **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `SUPABASE_URL` (the bare project URL) and `SUPABASE_ANON_KEY` (the anon/publishable key).
3. Push anything to `main` (or re-run the workflow from the Actions tab) —
   the workflow writes a real `js/config.js` into the build from these
   secrets. Nothing sensitive touches git history.

**Local dev:**

```bash
cp js/config.example.js js/config.js
```

Then edit `js/config.js` with the same two values. It's git-ignored, so it
stays local.

The anon key is safe to ship to the browser either way — it's the one
designed for client-side use, and everything it can touch is gated by the
row-level security policies in `schema.sql`. Keeping it out of source
control isn't about the key being secret so much as good hygiene: it stops
bots that scrape public repos for API keys from spamming your project, and
it means rotating a leaked key never requires a history rewrite.

## 6. Test it

Serve the folder over HTTP (OAuth redirects don't work from `file://`):

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`, click **Sign in with Discord**, and confirm:
- you land back in the app after the Discord consent screen
- the onboarding modal appears once (new profile row created in `profiles`)
- posting an LFG broadcast shows up instantly in a second browser/incognito
  window signed in as a different Discord account
- joining that post from the second window fills a slot on both screens
- both windows land in the same squad room, see each other, and when both
  press READY the Discord handles appear
- refreshing keeps you signed in and restores your Gamer Card

## Notes / limits of this integration

- This wiring was built and tested against a **mocked** Supabase client
  (no live project or Discord app exists in the environment it was built
  in) — the JS logic paths are verified, but run through the checklist in
  step 6 once you have real credentials.
- LFG posts don't auto-delete when they expire; the client just hides
  expired rows. Run the commented cleanup query at the bottom of
  `schema.sql` periodically (or wire it to Supabase's cron feature) if you
  want the table itself to stay small.
- There's no server-side moderation yet — only the client-side blocklist
  in `js/app.js`. See `DEPLOYMENT_ROADMAP.md` for the Perspective API
  suggestion before opening this up publicly at scale.
- If you ever suspect a key leaked (e.g. it was committed before this
  secrets-based flow existed), rotate it: Supabase's newer projects let
  you revoke/reissue the publishable key directly (Settings → API Keys)
  without touching the JWT secret; older projects require resetting the
  JWT secret, which invalidates the anon key *and* the service_role key
  together — update both wherever they're used if you do that.
