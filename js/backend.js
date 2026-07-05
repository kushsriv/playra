/* ================= PLAYRA BACKEND (Supabase) =================
   Thin wrapper around Supabase Auth + Postgres + Realtime.
   Every method fails soft: if SUPABASE_URL/ANON_KEY aren't set in
   config.js, `Backend.enabled` is false and app.js falls back to the
   original localStorage-only behavior untouched. */
const Backend = (() => {
  const cfg = window.PLAYRA_CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = enabled
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  let session = null;
  let presenceChannel = null;
  let lfgChannel = null;

  async function init(){
    if(!enabled) return null;
    try{
      const { data } = await client.auth.getSession();
      session = data.session;
      return session;
    }catch(e){ console.warn('[backend] init failed', e); return null; }
  }

  function onAuthChange(cb){
    if(!enabled) return;
    client.auth.onAuthStateChange((_event, sess) => { session = sess; cb(sess); });
  }

  function currentUser(){ return session?.user || null; }

  function signInWithDiscord(){
    if(!enabled) return;
    const redirectTo = window.location.href.split('#')[0];
    client.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
  }

  async function signOut(){
    if(!enabled) return;
    try{ await client.auth.signOut(); }catch(e){ console.warn('[backend] sign out failed', e); }
  }

  async function loadProfile(userId){
    if(!enabled) return null;
    try{
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      if(error) throw error;
      return data;
    }catch(e){ console.warn('[backend] loadProfile failed', e); return null; }
  }

  async function saveProfile(state){
    if(!enabled) return false;
    const user = currentUser();
    if(!user) return false;
    try{
      const { error } = await client.from('profiles').upsert({
        id: user.id, name: state.name, avatar: state.avatar, games: state.games,
        langs: state.langs, styles: state.styles, goals: state.goals, level: state.level,
        xp: state.xp, xp_need: state.xpNeed, quests: state.quests,
        achievements: [...state.achievements], mood_idx: state.moodIdx || 0,
        onboarded: !!state.onboarded, updated_at: new Date().toISOString()
      });
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] saveProfile failed', e); return false; }
  }

  function rowToPost(row){
    const mins = Math.max(0, Math.round((new Date(row.expires_at) - Date.now()) / 60000));
    return { id: row.id, game: row.game, title: row.title, tags: row.tags || [], slots: row.slots, filled: row.filled, mins, live: true, author: row.author_name };
  }

  async function fetchLfgPosts(){
    if(!enabled) return [];
    try{
      const { data, error } = await client.from('lfg_posts').select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(40);
      if(error) throw error;
      return (data || []).map(rowToPost);
    }catch(e){ console.warn('[backend] fetchLfgPosts failed', e); return []; }
  }

  async function insertLfgPost({ game, title, tags, slots, filled, mins, authorName }){
    if(!enabled) return null;
    const user = currentUser();
    if(!user) return null;
    try{
      const expires_at = new Date(Date.now() + mins*60000).toISOString();
      const { data, error } = await client.from('lfg_posts')
        .insert({ user_id: user.id, author_name: authorName, game, title, tags, slots, filled, expires_at })
        .select().single();
      if(error) throw error;
      return rowToPost(data);
    }catch(e){ console.warn('[backend] insertLfgPost failed', e); return null; }
  }

  function subscribeLfgInserts(onInsert){
    if(!enabled) return;
    lfgChannel = client.channel('lfg-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lfg_posts' }, payload => {
        onInsert(rowToPost(payload.new));
      })
      .subscribe();
  }

  async function fetchProfiles(excludeId, limit=20){
    if(!enabled) return [];
    try{
      let q = client.from('profiles').select('*').eq('onboarded', true).order('updated_at', { ascending: false }).limit(limit);
      if(excludeId) q = q.neq('id', excludeId);
      const { data, error } = await q;
      if(error) throw error;
      return data || [];
    }catch(e){ console.warn('[backend] fetchProfiles failed', e); return []; }
  }

  async function fetchEndorsementCounts(userId){
    if(!enabled) return {};
    try{
      const { data, error } = await client.from('endorsements').select('trait').eq('to_user', userId);
      if(error) throw error;
      const counts = {};
      (data || []).forEach(r => { counts[r.trait] = (counts[r.trait]||0) + 1; });
      return counts;
    }catch(e){ console.warn('[backend] fetchEndorsementCounts failed', e); return {}; }
  }

  async function insertEndorsement(toUserId, trait){
    if(!enabled) return false;
    const user = currentUser();
    if(!user || user.id === toUserId) return false;
    try{
      const { error } = await client.from('endorsements').insert({ from_user: user.id, to_user: toUserId, trait });
      if(error && error.code !== '23505') throw error; // 23505 = unique violation, already endorsed = fine
      return true;
    }catch(e){ console.warn('[backend] insertEndorsement failed', e); return false; }
  }

  function joinPresence(name, onCountChange){
    if(!enabled) return;
    const user = currentUser();
    const key = user ? user.id : `guest-${Math.random().toString(36).slice(2)}`;
    presenceChannel = client.channel('operators-online', { config: { presence: { key } } });
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      onCountChange(Object.keys(state).length);
    });
    presenceChannel.subscribe(status => {
      if(status === 'SUBSCRIBED') presenceChannel.track({ name, online_at: new Date().toISOString() });
    });
  }

  return {
    get enabled(){ return enabled; },
    init, onAuthChange, currentUser, signInWithDiscord, signOut,
    loadProfile, saveProfile, fetchLfgPosts, insertLfgPost, subscribeLfgInserts, joinPresence,
    fetchProfiles, fetchEndorsementCounts, insertEndorsement
  };
})();
