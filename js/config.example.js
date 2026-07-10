/* ================= PLAYRA CONFIG (template) =================
   Copy this file to js/config.js (git-ignored, safe to fill in with real
   values) to turn on Discord login, persistent LFG posts, and realtime
   presence for local development.

   Leave js/config.js absent or blank to run PLAYRA in local/guest mode —
   everything still works, it just stays on this device (localStorage only).

   Production deploys never read this file — GitHub Actions generates a
   real js/config.js at build time from repo secrets. See SETUP.md. */
window.PLAYRA_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
