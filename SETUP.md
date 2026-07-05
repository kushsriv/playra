# PLAYRA — backend setup (Discord login + live LFG + presence)

PLAYRA runs with **zero setup** in guest/local mode — just open `index.html`.
Everything below is optional and only turns on once you fill in `js/config.js`.
Until then, `Backend.enabled` is `false` and the app behaves exactly as the
original static prototype (localStorage only, no accounts, no network calls).

## What this unlocks

- "Sign in with Discord" on the landing page
- Player profiles (Gamer Card, XP, quests, achievements) persisted server-side, not just in this browser
- Real LFG posts, visible to every visitor and updated live via realtime
- A "🟢 N LIVE" presence badge showing how many operators are actually connected

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is enough to start).
2. Once it's up, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public key**

## 2. Run the schema

1. Open **SQL Editor → New query** in your Supabase dashboard.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   This creates `profiles` and `lfg_posts` tables with row-level security
   policies and enables realtime on `lfg_posts`. It's idempotent — safe to
   re-run if you change something later.

## 3. Register a Discord OAuth app

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → New Application.
2. **OAuth2 → General**: copy the **Client ID** and **Client Secret**.
3. **OAuth2 → Redirects**: add the callback URL Supabase gives you — it's shown
   on the Discord provider settings page in step 4 below
   (`https://<your-project-ref>.supabase.co/auth/v1/callback`).

## 4. Enable the Discord provider in Supabase

1. In Supabase: **Authentication → Providers → Discord** → toggle it on.
2. Paste the Discord **Client ID** and **Client Secret** from step 3.
3. Under **Authentication → URL Configuration**, add the URL you'll deploy
   PLAYRA to (and `http://localhost:8080` or similar for local testing) to
   **Redirect URLs** — Supabase will refuse to redirect back to a URL that
   isn't allow-listed here.

## 5. Fill in `js/config.js`

```js
window.PLAYRA_CONFIG = {
  SUPABASE_URL: 'https://your-project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key'
};
```

The anon key is safe to ship to the browser — it's the one designed for
client-side use, and everything it can touch is gated by the row-level
security policies in `schema.sql`.

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
- refreshing keeps you signed in and restores your Gamer Card

## Notes / limits of this integration

- This wiring was built and tested against a **mocked** Supabase client
  (no live project or Discord app exists in this environment) — the JS
  logic paths are verified, but you should still run through the checklist
  in step 6 once you have real credentials.
- LFG posts don't auto-delete when they expire; the client just hides
  expired rows. Run the commented cleanup query at the bottom of
  `schema.sql` periodically (or wire it to Supabase's cron feature) if you
  want the table itself to stay small.
- There's no moderation yet — anyone signed in can post anything. See
  `DEPLOYMENT_ROADMAP.md` for the Perspective API suggestion before opening
  this up publicly.
