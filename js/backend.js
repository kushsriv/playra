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
    // explicit scopes: Supabase's Discord token exchange fetches the
    // user's email as part of sign-in, and needs the "email" scope
    // granted to do it — without it (or without Discord returning an
    // email at all) the callback comes back as
    // error=server_error&error_code=unexpected_failure&error_description=
    // Error+getting+user+email+from+external+provider
    client.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo, scopes: 'identify email' } });
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

  // level/xp/xp_need/achievements are deliberately NOT sent: they are
  // server-owned now (guard_profile_progression rejects client writes to
  // them, and award_xp/unlock_achievement are the only way they move).
  // Sending them here would make every profile save throw.
  async function saveProfile(state){
    if(!enabled) return false;
    const user = currentUser();
    if(!user) return false;
    try{
      const { error } = await client.from('profiles').upsert({
        id: user.id, name: state.name, avatar: state.avatar, games: state.games,
        langs: state.langs, styles: state.styles, goals: state.goals,
        quests: state.quests, mood_idx: state.moodIdx || 0,
        onboarded: !!state.onboarded, discord_handle: state.discord || '',
        age_bracket: state.ageBracket || null,
        terms_version: state.termsVersion || '',
        terms_accepted_at: state.termsVersion ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] saveProfile failed', e); return false; }
  }

  /* ---- progression (server-authoritative) ----
     Both return the updated profile row so the client can adopt the
     server's numbers rather than keeping its own running total. */
  async function awardXp(amount, reason, eventKey){
    if(!enabled || !currentUser()) return null;
    try{
      const { data, error } = await client.rpc('award_xp', {
        p_amount: amount, p_reason: reason || '', p_event_key: eventKey || null
      });
      if(error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }catch(e){ console.warn('[backend] awardXp failed', e); return null; }
  }

  async function unlockAchievement(ach){
    if(!enabled || !currentUser()) return null;
    try{
      const { data, error } = await client.rpc('unlock_achievement', { p_ach: ach });
      if(error) throw error;
      return Array.isArray(data) ? data[0] : data;
    }catch(e){ console.warn('[backend] unlockAchievement failed', e); return null; }
  }

  /* ---- squad sessions ----
     A durable record of who actually played together. This is what the
     endorsement gate checks, so it has to be written when a room is joined,
     not when someone clicks "endorse". */
  async function joinSquadSession(postId, name){
    if(!enabled || !currentUser()) return null;
    try{
      const { data, error } = await client.rpc('join_squad_session', { p_post_id: postId, p_name: name || '' });
      if(error) throw error;
      return data || null;
    }catch(e){ console.warn('[backend] joinSquadSession failed', e); return null; }
  }

  async function fetchSquadmateIds(){
    if(!enabled || !currentUser()) return new Set();
    try{
      const me = currentUser().id;
      const { data: mine, error: e1 } = await client.from('squad_members').select('session_id').eq('user_id', me);
      if(e1) throw e1;
      const ids = (mine||[]).map(r=>r.session_id);
      if(!ids.length) return new Set();
      const { data, error } = await client.from('squad_members').select('user_id').in('session_id', ids);
      if(error) throw error;
      return new Set((data||[]).map(r=>r.user_id).filter(id=>id!==me));
    }catch(e){ console.warn('[backend] fetchSquadmateIds failed', e); return new Set(); }
  }

  /* ---- missions ---- */
  function rowToMission(r){
    return { id:r.id, game:r.game, goal:r.goal, desc:r.description, diff:r.difficulty,
             by:r.author_name, userId:r.user_id, rep:'—', live:true };
  }
  async function fetchMissions(limit=30){
    if(!enabled) return [];
    try{
      const { data, error } = await client.from('missions').select('*')
        .eq('status','open').order('created_at',{ascending:false}).limit(limit);
      if(error) throw error;
      return (data||[]).map(rowToMission);
    }catch(e){ console.warn('[backend] fetchMissions failed', e); return []; }
  }
  async function insertMission({ game, goal, description, difficulty, authorName }){
    if(!enabled) return null;
    const user = currentUser();
    if(!user) return null;
    try{
      const { data, error } = await client.from('missions')
        .insert({ user_id:user.id, author_name:authorName, game, goal,
                  description:description||'', difficulty:difficulty||3 })
        .select().single();
      if(error) throw error;
      return rowToMission(data);
    }catch(e){
      console.warn('[backend] insertMission failed', e);
      return classifyDbError(e) || null;
    }
  }
  async function acceptMission(missionId){
    if(!enabled) return false;
    const user = currentUser();
    if(!user) return false;
    try{
      const { error } = await client.from('mission_accepts').insert({ mission_id:missionId, user_id:user.id });
      if(error && error.code !== '23505') throw error; // already accepted is fine
      return true;
    }catch(e){ console.warn('[backend] acceptMission failed', e); return false; }
  }
  function subscribeMissions(onInsert){
    if(!enabled) return;
    client.channel('mission-feed')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'missions' },
          p => onInsert(rowToMission(p.new)))
      .subscribe();
  }

  /* ---- tournaments ---- */
  async function fetchTournaments(){
    if(!enabled) return [];
    try{
      const { data, error } = await client.from('tournaments').select('*')
        .order('starts_at',{ascending:true}).limit(20);
      if(error) throw error;
      return (data||[]).map(r=>{
        const d = new Date(r.starts_at);
        return { id:r.id, game:r.game, name:r.name, need:r.requirements, prize:r.prize,
                 d:String(d.getDate()).padStart(2,'0'),
                 m:d.toLocaleString('en',{month:'short'}).toUpperCase(), live:true };
      });
    }catch(e){ console.warn('[backend] fetchTournaments failed', e); return []; }
  }
  // Admin-only by RLS ("admins manage tournaments"). Surfacing this in the
  // app matters because without it the tournaments table can only ever be
  // populated by hand in the SQL editor, so the page stays permanently empty.
  async function createTournament({ game, name, requirements, prize, startsAt }){
    if(!enabled) return null;
    const user = currentUser();
    if(!user) return null;
    try{
      const { data, error } = await client.from('tournaments')
        .insert({ organiser_id:user.id, game, name, requirements:requirements||'',
                  prize:prize||'', starts_at:startsAt })
        .select().single();
      if(error) throw error;
      const d = new Date(data.starts_at);
      return { id:data.id, game:data.game, name:data.name, need:data.requirements,
               prize:data.prize, d:String(d.getDate()).padStart(2,'0'),
               m:d.toLocaleString('en',{month:'short'}).toUpperCase(), live:true };
    }catch(e){ console.warn('[backend] createTournament failed', e); return null; }
  }

  async function registerTournament(id){
    if(!enabled) return false;
    const user = currentUser();
    if(!user) return false;
    try{
      const { error } = await client.from('tournament_registrations').insert({ tournament_id:id, user_id:user.id });
      if(error && error.code !== '23505') throw error;
      return true;
    }catch(e){ console.warn('[backend] registerTournament failed', e); return false; }
  }

  /* ---- blocks ---- */
  async function fetchBlocks(){
    if(!enabled || !currentUser()) return new Set();
    try{
      const { data, error } = await client.from('blocks').select('blocked_id').eq('blocker_id', currentUser().id);
      if(error) throw error;
      return new Set((data||[]).map(r=>r.blocked_id));
    }catch(e){ console.warn('[backend] fetchBlocks failed', e); return new Set(); }
  }
  async function blockUser(id){
    if(!enabled) return false;
    const user = currentUser();
    if(!user || user.id === id) return false;
    try{
      const { error } = await client.from('blocks').insert({ blocker_id:user.id, blocked_id:id });
      if(error && error.code !== '23505') throw error;
      return true;
    }catch(e){ console.warn('[backend] blockUser failed', e); return false; }
  }
  async function unblockUser(id){
    if(!enabled || !currentUser()) return false;
    try{
      const { error } = await client.from('blocks').delete().eq('blocker_id', currentUser().id).eq('blocked_id', id);
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] unblockUser failed', e); return false; }
  }

  /* ---- moderation (admin only; the RPCs enforce it server-side) ---- */
  async function fetchReportQueue(){
    if(!enabled || !currentUser()) return [];
    try{
      const { data, error } = await client.rpc('admin_report_queue');
      if(error) throw error;
      return data || [];
    }catch(e){ return []; } // non-admins get FORBIDDEN; treat as "no queue"
  }
  async function banUser(id, days){
    if(!enabled) return false;
    try{
      const until = days === null ? null : new Date(Date.now()+days*86400000).toISOString();
      const { error } = await client.rpc('set_ban', { target:id, until });
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] banUser failed', e); return false; }
  }

  /* ---- account data rights ---- */
  async function exportMyData(){
    if(!enabled || !currentUser()) return null;
    try{
      const { data, error } = await client.rpc('export_my_data');
      if(error) throw error;
      return data;
    }catch(e){ console.warn('[backend] exportMyData failed', e); return null; }
  }
  async function deleteMyAccount(){
    if(!enabled || !currentUser()) return false;
    try{
      const { error } = await client.rpc('delete_my_account');
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] deleteMyAccount failed', e); return false; }
  }

  /* ---- error reporting ----
     Deliberately fire-and-forget and never throws: an error reporter that
     can itself throw turns one broken page into an error loop. */
  function reportClientError(message, stack, url){
    if(!enabled) return;
    try{
      client.from('client_errors').insert({
        user_id: currentUser()?.id || null,
        message: String(message||'').slice(0,500),
        stack: String(stack||'').slice(0,2000),
        url: String(url||location.href).slice(0,300),
        user_agent: navigator.userAgent.slice(0,300)
      }).then(()=>{}, ()=>{});
    }catch(e){ /* never let telemetry break the app */ }
  }

  function rowToPost(row){
    const expiresAt = new Date(row.expires_at).getTime();
    const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
    return { id: row.id, game: row.game, title: row.title, tags: row.tags || [], slots: row.slots, filled: row.filled, mins, expiresAt, live: true, author: row.author_name };
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

  // Server-side triggers (rate limit + moderation) raise a Postgres
  // exception with a recognizable prefix; surface those as distinct
  // return values so the UI can tell "you're posting too fast" apart
  // from "network hiccup, fall back to a local-only post."
  function classifyDbError(e){
    const msg = String(e?.message || '');
    if(msg.includes('RATE_LIMIT')) return 'rate_limited';
    if(msg.includes('MODERATION')) return 'blocked';
    return null;
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
    }catch(e){
      console.warn('[backend] insertLfgPost failed', e);
      return classifyDbError(e) || null;
    }
  }

  async function insertReport(reportedId, reason, context){
    if(!enabled) return false;
    const user = currentUser();
    if(!user || user.id === reportedId) return false;
    try{
      const { error } = await client.from('reports').insert({ reporter_id: user.id, reported_id: reportedId, reason, context: context||'' });
      if(error) throw error;
      return true;
    }catch(e){ console.warn('[backend] insertReport failed', e); return false; }
  }

  function subscribeLfg(onInsert, onUpdate){
    if(!enabled) return;
    lfgChannel = client.channel('lfg-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lfg_posts' }, payload => {
        onInsert(rowToPost(payload.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lfg_posts' }, payload => {
        if(onUpdate) onUpdate(rowToPost(payload.new));
      })
      .subscribe();
  }

  async function joinLfgPost(postId){
    if(!enabled) return null;
    if(!currentUser()) return null;
    try{
      const { data, error } = await client.rpc('join_lfg', { post_id: postId });
      if(error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? rowToPost(row) : null; // null = post full or expired
    }catch(e){ console.warn('[backend] joinLfgPost failed', e); return null; }
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

  /* ---- squad rooms: one realtime channel per LFG post ----
     Presence carries each member's {name, avatar, discord, ready}; pressing
     READY re-tracks with ready:true and every client re-renders on sync. */
  let roomChannel = null;
  let roomSelf = null;
  function joinRoom(postId, member, onSync){
    if(!enabled) return false;
    leaveRoom();
    const user = currentUser();
    const key = user ? user.id : `guest-${Math.random().toString(36).slice(2)}`;
    roomSelf = { key, ...member, ready:false };
    roomChannel = client.channel(`room-${postId}`, { config: { presence: { key } } });
    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const members = Object.entries(state).map(([k, metas]) => ({ key:k, ...metas[0] }));
      onSync(members, key);
    });
    roomChannel.subscribe(status => {
      if(status === 'SUBSCRIBED') roomChannel.track(roomSelf);
    });
    return true;
  }
  function setRoomReady(){
    if(!roomChannel || !roomSelf) return;
    roomSelf.ready = true;
    roomChannel.track(roomSelf);
  }
  function leaveRoom(){
    if(roomChannel){ try{ roomChannel.unsubscribe(); }catch(e){} roomChannel=null; roomSelf=null; }
  }

  /* Presence is sharded across PRESENCE_SHARDS channels rather than putting
     every account in one. A single channel makes the whole userbase share one
     connection's fan-out and one presence payload, which is the first thing
     that falls over under load. Each client joins one shard deterministically
     and the displayed count is scaled by the shard count — an estimate, but a
     cheap one that keeps working as the userbase grows. */
  const PRESENCE_SHARDS = 8;
  function shardFor(key){
    let h = 0;
    for(let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) | 0;
    return Math.abs(h) % PRESENCE_SHARDS;
  }
  function joinPresence(name, onCountChange){
    if(!enabled) return;
    const user = currentUser();
    const key = user ? user.id : `guest-${Math.random().toString(36).slice(2)}`;
    const shard = shardFor(key);
    presenceChannel = client.channel(`operators-online-${shard}`, { config: { presence: { key } } });
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const inShard = Object.keys(presenceChannel.presenceState()).length;
      // scale the shard's population up to an estimate of the whole
      onCountChange(Math.max(inShard, Math.round(inShard * PRESENCE_SHARDS)));
    });
    presenceChannel.subscribe(status => {
      if(status === 'SUBSCRIBED') presenceChannel.track({ name, online_at: new Date().toISOString() });
    });
  }

  /* ---- product analytics ----
     Fire-and-forget, never throws, never blocks a user action. Events go to
     the project's own Postgres, so nothing is shared with a third party and
     there is no processor agreement to negotiate in diligence. */
  const sessionId = (()=>{
    try{
      let s = sessionStorage.getItem('playra_sid');
      if(!s){ s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('playra_sid', s); }
      return s;
    }catch(e){ return 'nostore'; }
  })();
  function track(event, props){
    if(!enabled) return;
    try{
      client.from('analytics_events').insert({
        user_id: currentUser()?.id || null,
        session_id: sessionId,
        event: String(event).slice(0,60),
        props: props || {}
      }).then(()=>{}, ()=>{});
    }catch(e){ /* telemetry must never break the app */ }
  }
  async function fetchMetrics(days){
    if(!enabled || !currentUser()) return null;
    try{
      const { data, error } = await client.rpc('admin_metrics', { days: days || 30 });
      if(error) throw error;
      return data;
    }catch(e){ return null; }   // non-admins get FORBIDDEN
  }

  return {
    get enabled(){ return enabled; },
    init, onAuthChange, currentUser, signInWithDiscord, signOut,
    loadProfile, saveProfile, fetchLfgPosts, insertLfgPost, subscribeLfg, joinLfgPost, joinPresence,
    fetchProfiles, fetchEndorsementCounts, insertEndorsement, insertReport,
    joinRoom, setRoomReady, leaveRoom,
    awardXp, unlockAchievement,
    joinSquadSession, fetchSquadmateIds,
    fetchMissions, insertMission, acceptMission, subscribeMissions,
    fetchTournaments, registerTournament, createTournament,
    fetchBlocks, blockUser, unblockUser,
    fetchReportQueue, banUser,
    exportMyData, deleteMyAccount, reportClientError,
    track, fetchMetrics
  };
})();
