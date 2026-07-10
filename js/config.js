/* ================= PLAYRA CONFIG =================
   Fill these in from your Supabase project (Settings → API) to turn on
   Discord login, persistent LFG posts, and realtime presence.
   Leave them blank to run PLAYRA in local/guest mode — everything still
   works, it just stays on this device (localStorage only).

   This file is git-ignored — edit it locally for local dev, it won't be
   committed. Production deploys get their real values injected by
   .github/workflows/deploy.yml from repo secrets (Settings → Secrets and
   variables → Actions → SUPABASE_URL / SUPABASE_ANON_KEY).
   See SETUP.md for the full walkthrough. */
window.PLAYRA_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
