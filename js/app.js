/* ================= SOUND ENGINE (synthesized, tiny, tasteful) ================= */
const Sfx = (() => {
  let ctx = null, on = true;
  const ensure = () => { if(!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); if(ctx.state==='suspended') ctx.resume(); };
  const env = (g,t,a=.005,d=.12,v=.06)=>{g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);};
  const tone = (f,type='sine',d=.12,v=.06,slide=0)=>{ if(!on) return; ensure(); const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t); if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),t+d);
    env(g,t,.005,d,v);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+d+.05); };
  return {
    toggle(){ on=!on; return on; },
    get on(){ return on; },
    hover(){ tone(1400,'sine',.05,.02); },
    click(){ tone(520,'square',.05,.03); tone(1100,'sine',.07,.03); },
    open(){ tone(300,'sine',.16,.04,500); },
    ping(){ tone(1650,'sine',.14,.05); setTimeout(()=>tone(2100,'sine',.16,.04),90); },
    xp(){ tone(660,'triangle',.1,.05); setTimeout(()=>tone(880,'triangle',.12,.05),80); },
    lvl(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,'triangle',.22,.06),i*110)); },
    ready(){ tone(880,'square',.08,.04); setTimeout(()=>tone(1320,'square',.12,.04),90); },
    launch(){ [392,523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',.18,.035),i*80)); },
    skip(){ tone(300,'sawtooth',.1,.03,-140); },
    invite(){ tone(740,'sine',.1,.05); setTimeout(()=>tone(1180,'sine',.14,.05),90); }
  };
})();
document.addEventListener('mouseover', e=>{ if(e.target.closest('button,.chip,.hub-card,.rec-card')) Sfx.hover(); });
document.addEventListener('click', e=>{ if(e.target.closest('button,.chip')) Sfx.click(); });

/* ================= STATE ================= */
const S = {
  name:'Recruit', avatar:'⚡', games:['Valorant'], langs:['English'], styles:['Competitive','IGL'],
  goals:['Rank Push'], level:1, xp:0, xpNeed:100, quests:{}, achievements:new Set(['first']), onboarded:false
};
const XP_EVENTS = { join:40, ready:25, invite:20, quest:0, post:30, register:35, hub:10 };

/* ================= PERSISTENCE ================= */
const STORAGE_KEY = 'playra_state_v1';
/* localStorage writes are cheap and happen immediately; the server upsert
   is debounced so a burst of XP events becomes one network write */
let profileSyncTimer=null;
function syncProfileNow(){
  if(profileSyncTimer){ clearTimeout(profileSyncTimer); profileSyncTimer=null; }
  if(Backend.enabled && Backend.currentUser()){
    S.moodIdx = typeof moodIdx==='number'?moodIdx:0;
    Backend.saveProfile(S);
  }
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name:S.name, avatar:S.avatar, games:S.games, langs:S.langs, styles:S.styles, goals:S.goals,
      level:S.level, xp:S.xp, xpNeed:S.xpNeed, quests:S.quests, achievements:[...S.achievements],
      onboarded:S.onboarded, moodIdx: typeof moodIdx==='number'?moodIdx:0
    }));
  }catch(e){}
  if(Backend.enabled && Backend.currentUser()){
    clearTimeout(profileSyncTimer);
    profileSyncTimer=setTimeout(syncProfileNow, 1500);
  }
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && profileSyncTimer) syncProfileNow(); });
function loadState(){
  let raw;
  try{ raw = localStorage.getItem(STORAGE_KEY); }catch(e){ return false; }
  if(!raw) return false;
  try{
    const d = JSON.parse(raw);
    Object.assign(S, {
      name:d.name, avatar:d.avatar, games:d.games, langs:d.langs, styles:d.styles, goals:d.goals,
      level:d.level, xp:d.xp, xpNeed:d.xpNeed, quests:d.quests||{}, onboarded:!!d.onboarded
    });
    S.achievements = new Set(d.achievements && d.achievements.length ? d.achievements : ['first']);
    if(typeof d.moodIdx==='number') moodIdx = d.moodIdx;
    return true;
  }catch(e){ return false; }
}

/* ================= DATA ================= */
const GAMES = [
  {n:'Valorant', ab:'VA', c:'#FF4655', glow:'rgba(255,70,85,.28)', online:'41.2K', tag:'TACTICAL FPS'},
  {n:'Minecraft', ab:'MC', c:'#5FBB4E', glow:'rgba(95,187,78,.26)', online:'38.9K', tag:'SANDBOX'},
  {n:'CS2', ab:'CS', c:'#F5A623', glow:'rgba(245,166,35,.26)', online:'29.4K', tag:'TACTICAL FPS'},
  {n:'Fortnite', ab:'FN', c:'#8B5CF6', glow:'rgba(139,92,246,.3)', online:'33.1K', tag:'BATTLE ROYALE'},
  {n:'League of Legends', ab:'LoL', c:'#00E5FF', glow:'rgba(0,229,255,.26)', online:'52.7K', tag:'MOBA'},
  {n:'Rocket League', ab:'RL', c:'#3DFFA0', glow:'rgba(61,255,160,.26)', online:'12.3K', tag:'SPORTS'},
  {n:'Apex Legends', ab:'AP', c:'#FF3D81', glow:'rgba(255,61,129,.28)', online:'18.8K', tag:'BATTLE ROYALE'},
  {n:'FIFA', ab:'FC', c:'#57F6FF', glow:'rgba(87,246,255,.26)', online:'9.6K', tag:'SPORTS'},
  {n:'Destiny 2', ab:'D2', c:'#FFB020', glow:'rgba(255,176,32,.26)', online:'7.2K', tag:'LOOTER'}
];
const gameBy = n => GAMES.find(g=>g.n===n) || GAMES[0];

let LFG = [
  {game:'Valorant', title:'Need 2 Immortal — smokes main, comp only', tags:['Mumbai','Mic required','English','Immortal+','Starts in 5 min'], slots:5, filled:3, mins:15},
  {game:'Destiny 2', title:'Salvation\'s Edge raid — teaching run, new lights welcome', tags:['Any server','Patient','Teacher','Mic optional'], slots:6, filled:4, mins:38},
  {game:'CS2', title:'Faceit lvl 8+ stack for prize scrim', tags:['EU','English','IGL needed','Prize tournament'], slots:5, filled:4, mins:9},
  {game:'Minecraft', title:'Hardcore world day 1 — Ender Dragon by weekend', tags:['Chill','Long-term','Voice','18+'], slots:4, filled:2, mins:52},
  {game:'Apex Legends', title:'Ranked grind to Diamond — need entry fragger', tags:['Mumbai','Duo→Trio','Mic required','Plat+'], slots:3, filled:2, mins:21},
  {game:'Rocket League', title:'Champ 2s partner, rotation-first playstyle', tags:['Any region','No toxicity','C1–C3'], slots:2, filled:1, mins:44}
];
/* every post carries an absolute expiry; countdowns derive from it so
   re-renders can't reset them, and expired posts drop off the radar */
LFG.forEach(p=>p.expiresAt = Date.now() + p.mins*60000);
const MISSIONS = [
  {game:'Valorant', goal:'Reach Radiant before Episode ends', desc:'Immortal 3, 78 RR. Need a consistent duo — VOD review together twice a week.', diff:5, by:'Vex', rep:'4.9'},
  {game:'Minecraft', goal:'Hardcore Ender Dragon, zero deaths', desc:'Third attempt. Looking for one calm player who knows bastion routes.', diff:4, by:'Blocksmith', rep:'5.0'},
  {game:'Destiny 2', goal:'Teach 5 new players their first raid', desc:'Sherpa run, all encounters explained. Patience mandatory, loot guaranteed.', diff:2, by:'Warden', rep:'4.8'},
  {game:'FIFA', goal:'Grind Ultimate Team weekend objectives', desc:'Pro Clubs sessions Tue/Thu. Need a CDM who actually defends.', diff:3, by:'Tekkers', rep:'4.7'},
  {game:'Fortnite', goal:'Zero Build duo for Unreal push', desc:'Currently Elite. High-ground specialist wanted, comms in English or Hindi.', diff:4, by:'Skyfall', rep:'4.9'},
  {game:'Apex Legends', goal:'Finish Battle Pass before season ends', desc:'12 levels left, 9 days. Casual grind, funny people preferred.', diff:1, by:'Loba_Main', rep:'4.6'},
  {game:'League of Legends', goal:'Climb out of Gold — duo bot lane', desc:'ADC main seeking enchanter support. Long-term duo if we click.', diff:3, by:'Riftline', rep:'4.8'},
  {game:'Rocket League', goal:'Learn air dribbles in custom training', desc:'Coach-style session. I hit GC last split, happy to trade for 1s coaching.', diff:2, by:'Aerialist', rep:'5.0'},
  {game:'CS2', goal:'Build a roster for weekend cup', desc:'Prize pool ₹50K. Need AWPer + lurker, scrims Thu/Fri night IST.', diff:5, by:'ClutchKing', rep:'4.9'}
];
const RECS = [
  {n:'Nyx', h:'@nyx_ftw', rank:'Immortal 1 · VAL', compat:97, tags:[['cy','SMOKES'],['lm','NO TOXICITY'],['am','IST NIGHTS']]},
  {n:'Draco', h:'@draco', rank:'Faceit 8 · CS2', compat:93, tags:[['mg','IGL'],['cy','ENGLISH+HINDI'],['lm','MIC 100%']]},
  {n:'Miru', h:'@miru_plays', rank:'Diamond · APEX', compat:91, tags:[['vi','SUPPORT'],['lm','PATIENT'],['am','WEEKENDS']]}
];
const SWIPES = [
  {n:'Nyx', h:'@nyx_ftw · IMMORTAL 1', compat:97, glow:'rgba(61,255,160,.2)', bars:[['SCHEDULE OVERLAP',94],['COMMS STYLE',91],['GOAL ALIGNMENT',98],['VIBE',96]], tags:[['cy','VALORANT'],['mg','SMOKES MAIN'],['lm','NO TOXICITY'],['am','NIGHT OWL']]},
  {n:'Draco', h:'@draco · FACEIT LVL 8', compat:93, glow:'rgba(0,229,255,.2)', bars:[['SCHEDULE OVERLAP',88],['COMMS STYLE',95],['GOAL ALIGNMENT',90],['VIBE',89]], tags:[['cy','CS2'],['mg','IGL'],['am','TOURNAMENTS'],['lm','TEACHER']]},
  {n:'Miru', h:'@miru_plays · DIAMOND', compat:91, glow:'rgba(255,61,129,.2)', bars:[['SCHEDULE OVERLAP',96],['COMMS STYLE',84],['GOAL ALIGNMENT',88],['VIBE',94]], tags:[['mg','APEX'],['vi','SUPPORT MAIN'],['lm','PATIENT'],['cy','WEEKENDS']]},
  {n:'Blocksmith', h:'@blocksmith · 2.4K HRS', compat:89, glow:'rgba(95,187,78,.22)', bars:[['SCHEDULE OVERLAP',82],['COMMS STYLE',92],['GOAL ALIGNMENT',95],['VIBE',85]], tags:[['lm','MINECRAFT'],['cy','BUILDER'],['am','HARDCORE'],['vi','CHILL']]},
  {n:'Aerialist', h:'@aerialist · GRAND CHAMP', compat:87, glow:'rgba(139,92,246,.24)', bars:[['SCHEDULE OVERLAP',90],['COMMS STYLE',80],['GOAL ALIGNMENT',86],['VIBE',91]], tags:[['vi','ROCKET LEAGUE'],['cy','COACH'],['lm','FUNNY'],['am','SPEEDRUNNER']]}
];
const TOURS = [
  {d:'12', m:'JUL', game:'Valorant', name:'Mumbai Ascension Cup', need:'2 rosters recruiting · Immortal+', prize:'₹1,00,000'},
  {d:'18', m:'JUL', game:'CS2', name:'Night Market Invitational', need:'AWPers wanted · Faceit 7+', prize:'₹50,000'},
  {d:'25', m:'JUL', game:'Rocket League', name:'Aerial Season Finals 3v3', need:'Open qualifier · all ranks', prize:'₹30,000'},
  {d:'02', m:'AUG', game:'Fortnite', name:'Zero Build Rumble', need:'Duos · Elite+ recommended', prize:'₹75,000'}
];
const FRIENDS = [
  {n:'Vex', s:'In match · Valorant', d:'game'}, {n:'Warden', s:'Lobby · Destiny 2', d:'game'},
  {n:'Tekkers', s:'Online', d:'on'}, {n:'Skyfall', s:'Online', d:'on'}, {n:'Riftline', s:'Last seen 2h ago', d:'off'}
];
const QUESTS = [
  {id:'q1', name:'Join one squad through LFG', xp:40},
  {id:'q2', name:'Endorse a teammate after a session', xp:25},
  {id:'q3', name:'Complete a ready check', xp:25},
  {id:'q4', name:'Invite a 90%+ compatible duo', xp:20}
];
const ACH = [
  {id:'first', ico:'🎖️', nm:'First Link', ds:'JOINED GAMELINK'},
  {id:'clutch', ico:'⚡', nm:'First Clutch', ds:'ENDORSED: CLUTCH ×1'},
  {id:'owl', ico:'🌙', nm:'Night Owl', ds:'10 SESSIONS AFTER 1AM'},
  {id:'squad', ico:'🛡️', nm:'Squad Leader', ds:'LEAD 5 READY CHECKS'},
  {id:'clean', ico:'💠', nm:'No Toxicity', ds:'50 CLEAN SESSIONS'},
  {id:'mentor', ico:'📡', nm:'Mentor', ds:'TEACH 10 BEGINNERS'},
  {id:'hundo', ico:'🤝', nm:'100 Friends', ds:'LOCKED'},
  {id:'trophy', ico:'🏆', nm:'Tournament Winner', ds:'LOCKED'}
];
const ENDORSE = [['Communication',96],['Clutch',88],['Leadership',82],['Patient',91],['Funny',77],['Teacher',69],['Reliable',94],['No Toxicity',99]];

/* ================= HELPERS ================= */
const $ = id => document.getElementById(id);
const el = (h) => { const t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstChild; };
const tagHtml = t => `<span class="tag ${t[0]}">${esc(t[1])}</span>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Minimal client-side moderation. Not a substitute for a real moderation
   pipeline (see DEPLOYMENT_ROADMAP.md re: Perspective API) — this just
   stops the obvious stuff before it ever reaches the database. */
const BLOCKLIST = ['fuck','shit','bitch','nigger','faggot','cunt','asshole','whore','slut','retard','rape'];
const hasBlockedWord = text => { const low=String(text).toLowerCase(); return BLOCKLIST.some(w=>low.includes(w)); };
function toast(ico, title, desc, cls=''){
  const t = el(`<div class="toast ${cls}"><div class="t-ico">${ico}</div><div><div class="t-t">${esc(title)}</div><div class="t-d">${esc(desc)}</div></div></div>`);
  $('toasts').appendChild(t); Sfx.ping();
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),350); }, 4200);
}
function addXP(n, why){
  S.xp += n; toast('✦',`+${n} XP`, why.toUpperCase(),'xp'); Sfx.xp();
  while(S.xp >= S.xpNeed){ S.xp -= S.xpNeed; S.level++; S.xpNeed = Math.round(S.xpNeed*1.35);
    $('lvlTxt').textContent = `LEVEL ${S.level}`; const f=$('lvlFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); Sfx.lvl();
  }
  renderXP(); saveState();
}
function renderXP(){
  $('xpFill').style.width = Math.min(100, S.xp/S.xpNeed*100)+'%';
  $('xpNow').textContent=S.xp; $('xpNeed').textContent=S.xpNeed;
  $('lvlNum').textContent=S.level; $('sideLvl').textContent=S.level; $('gcLvl').textContent=S.level;
}
function unlockAch(id, nm){
  if(S.achievements.has(id)) return; S.achievements.add(id);
  toast('🏅','Achievement unlocked', nm.toUpperCase(),'ach-t'); renderAch(); saveState();
}

/* ================= NAV ================= */
const VIEW_NAMES = {dash:'COMMAND CENTER', lfg:'LFG RADAR', missions:'MISSION MARKETPLACE', discover:'DISCOVER', hubs:'GAME HUBS', tours:'TOURNAMENT HUB', profile:'GAMER CARD'};
function go(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));
  $('view-'+v).classList.add('on');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  $('crumbName').textContent = VIEW_NAMES[v]; Sfx.open();
  window.scrollTo({top:0, behavior:'smooth'});
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));

/* ================= LANDING: particles + neon rain + parallax ================= */
(function(){
  const cv = $('landingCanvas'), cx = cv.getContext('2d');
  let W,H,parts=[],drops=[];
  const fit=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;};
  fit(); addEventListener('resize',fit);
  for(let i=0;i<90;i++) parts.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.6+.4,v:Math.random()*.3+.05,tw:Math.random()*Math.PI*2});
  for(let i=0;i<60;i++) drops.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,l:Math.random()*22+8,v:Math.random()*5+4,hue:Math.random()<.5?'0,229,255':'255,61,129'});
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(){
    if($('landing').classList.contains('gone')) return;
    cx.clearRect(0,0,W,H);
    parts.forEach(p=>{ p.y-=p.v; p.tw+=.03; if(p.y<-4){p.y=H+4;p.x=Math.random()*W;}
      cx.globalAlpha=.35+Math.sin(p.tw)*.3; cx.fillStyle='#9BE8FF';
      cx.beginPath(); cx.arc(p.x,p.y,p.r,0,7); cx.fill(); });
    cx.globalAlpha=1;
    drops.forEach(d=>{ d.y+=d.v; if(d.y>H){d.y=-30;d.x=Math.random()*W;}
      const g=cx.createLinearGradient(d.x,d.y,d.x,d.y+d.l);
      g.addColorStop(0,`rgba(${d.hue},0)`); g.addColorStop(1,`rgba(${d.hue},.5)`);
      cx.strokeStyle=g; cx.lineWidth=1.2; cx.beginPath(); cx.moveTo(d.x,d.y); cx.lineTo(d.x,d.y+d.l); cx.stroke(); });
    requestAnimationFrame(frame);
  }
  if(!reduce) frame();
  // mouse parallax
  addEventListener('mousemove', e=>{
    if($('landing').classList.contains('gone')||reduce) return;
    const nx=(e.clientX/innerWidth-.5), ny=(e.clientY/innerHeight-.5);
    document.querySelectorAll('[data-parallax]').forEach(elm=>{
      const f=+elm.dataset.parallax; elm.style.transform=`translate(${nx*f}px,${ny*f*.5}px)`;
    });
  });
})();

/* ================= RADAR CANVAS ================= */
(function(){
  const cv=$('radar'), cx=cv.getContext('2d'); const R=220, C=220; let a=0;
  const blips=[{r:.45,ang:.9,c:'#00E5FF'},{r:.7,ang:2.4,c:'#FF3D81'},{r:.85,ang:4.2,c:'#3DFFA0'},{r:.3,ang:5.4,c:'#FFB020'}];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(){
    // don't burn frames while the dashboard is off-screen
    if(!$('view-dash').classList.contains('on')){ requestAnimationFrame(draw); return; }
    cx.clearRect(0,0,440,440);
    cx.strokeStyle='rgba(0,229,255,.18)'; cx.lineWidth=1;
    [0.33,0.66,1].forEach(k=>{cx.beginPath();cx.arc(C,C,R*k*.92,0,7);cx.stroke();});
    cx.beginPath();cx.moveTo(C-R*.92,C);cx.lineTo(C+R*.92,C);cx.moveTo(C,C-R*.92);cx.lineTo(C,C+R*.92);cx.stroke();
    // sweep
    const g=cx.createConicGradient ? cx.createConicGradient(a,C,C) : null;
    if(g){ g.addColorStop(0,'rgba(0,229,255,.35)'); g.addColorStop(.12,'rgba(0,229,255,0)'); g.addColorStop(1,'rgba(0,229,255,0)');
      cx.fillStyle=g; cx.beginPath(); cx.moveTo(C,C); cx.arc(C,C,R*.92,a,a+ .5); cx.closePath(); cx.fill(); }
    blips.forEach(b=>{
      const x=C+Math.cos(b.ang)*R*b.r*.9, y=C+Math.sin(b.ang)*R*b.r*.9;
      const diff=Math.abs(((b.ang-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2));
      const hot = diff<.9 ? 1-diff/.9 : 0;
      cx.fillStyle=b.c; cx.globalAlpha=.45+hot*.55;
      cx.beginPath(); cx.arc(x,y,3.5+hot*3,0,7); cx.fill();
      if(hot>.3){ cx.globalAlpha=hot*.3; cx.beginPath(); cx.arc(x,y,10+hot*8,0,7); cx.fill(); }
      cx.globalAlpha=1;
    });
    a+= reduce? 0 : .014; requestAnimationFrame(draw);
  }
  draw();
})();

/* ================= 3D TILT ================= */
document.addEventListener('mousemove', e=>{
  const c = e.target.closest('.tilt'); 
  document.querySelectorAll('.tilt').forEach(t=>{ if(t!==c) t.style.transform=''; });
  if(!c) return;
  const r=c.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
  c.style.transform=`perspective(900px) rotateY(${x*4}deg) rotateX(${-y*4}deg)`;
});

/* ================= REAL MATCHMAKING ================= */
let REAL_PROFILES = [];
const jac = (x,y) => { x=x||[]; y=y||[]; if(!x.length||!y.length) return 0; const sy=new Set(y); const inter=x.filter(v=>sy.has(v)).length; return inter/new Set([...x,...y]).size; };
function computeCompat(mine, other){
  const score = jac(mine.games,other.games)*0.4 + jac(mine.goals,other.goals)*0.3 + jac(mine.langs,other.langs)*0.15 + jac(mine.styles,other.styles)*0.15;
  return Math.max(38, Math.round(score*100));
}
function profileToSwipeCard(p){
  return {
    n:p.name||'Operator', h:'@'+(p.name||'operator').toLowerCase().replace(/\s/g,''),
    compat:computeCompat(S,p), glow:'rgba(0,229,255,.2)',
    bars:[['GAME OVERLAP',Math.round(jac(S.games,p.games)*100)],['COMMS STYLE',Math.round(jac(S.langs,p.langs)*100)],
          ['GOAL ALIGNMENT',Math.round(jac(S.goals,p.goals)*100)],['VIBE',Math.round(jac(S.styles,p.styles)*100)]],
    tags:[...(p.games||[]).slice(0,2).map(g=>['cy',g.toUpperCase()]),...(p.styles||[]).slice(0,1).map(s=>['mg',s.toUpperCase()]),...(p.langs||[]).slice(0,1).map(l=>['am',l.toUpperCase()])],
    id:p.id
  };
}

/* ================= RENDER: DASHBOARD ================= */
function renderRecs(){
  $('recGrid').innerHTML='';
  const real = REAL_PROFILES.map(p=>({
    n:p.name||'Operator', rank:((p.games&&p.games[0])||'Operator')+' · LVL '+(p.level||1),
    compat:computeCompat(S,p), id:p.id,
    tags:[...(p.games||[]).slice(0,1).map(g=>['cy',g.toUpperCase()]),...(p.styles||[]).slice(0,1).map(s=>['mg',s.toUpperCase()]),...(p.langs||[]).slice(0,1).map(l=>['am',l.toUpperCase()])]
  })).sort((a,b)=>b.compat-a.compat).slice(0,3);
  const list = real.length ? real : RECS;
  list.forEach(r=>{
    const card = el(`<div class="rec-card">
      <div class="rec-top"><div class="av"></div>
        <div><div class="rn"></div><div class="rr"></div></div>
        <div class="compat"><b>${r.compat}%</b><span>MATCH</span></div></div>
      <div class="rec-tags">${r.tags.map(tagHtml).join('')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn sm primary invite-btn" style="flex:1">INVITE TO SQUAD</button>
        <button class="btn sm ghost endorse-btn" style="${r.id?'':'display:none'}">ENDORSE</button>
      </div>
    </div>`);
    card.querySelector('.av').textContent = (r.n[0]||'?').toUpperCase();
    card.querySelector('.rn').textContent = r.n;
    card.querySelector('.rr').textContent = r.rank;
    card.querySelector('.invite-btn').onclick=()=>inviteRec(r.n);
    if(r.id) card.querySelector('.endorse-btn').onclick=()=>openEndorsePicker(r.id, r.n);
    $('recGrid').appendChild(card);
  });
}
function inviteRec(n){ addXP(XP_EVENTS.invite, `Invited ${n}`); completeQuest('q4'); }
function renderFriends(){
  $('friendList').innerHTML='';
  FRIENDS.forEach(f=>$('friendList').appendChild(el(`<div class="friend-row">
    <div class="av">${f.n[0]}</div><div><div class="fn">${f.n}</div><div class="fs">${f.s.toUpperCase()}</div></div>
    <span class="st-dot ${f.d}"></span></div>`)));
}
function renderQuests(){
  $('questRow').innerHTML='';
  QUESTS.forEach(q=>{
    const done = S.quests[q.id];
    $('questRow').appendChild(el(`<div class="quest ${done?'done':''}" id="quest-${q.id}">
      <div class="q-check">✓</div><div class="q-name">${q.name}</div><div class="q-xp">+${q.xp} XP</div></div>`));
  });
  const d = Object.keys(S.quests).length;
  $('questCnt').textContent = `${d}/${QUESTS.length} COMPLETE`;
}
function completeQuest(id){
  if(S.quests[id]) return; S.quests[id]=true;
  const q=QUESTS.find(x=>x.id===id); renderQuests(); addXP(q.xp,`Quest: ${q.name}`);
}
function renderTourMini(){
  $('tourMini').innerHTML='';
  TOURS.slice(0,3).forEach((t,i)=>{
    const colors=['#FF3D81','#00E5FF','#3DFFA0'];
    $('tourMini').appendChild(el(`<div class="radar-blip-row" onclick="go('tours')">
      <span class="b" style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}"></span>
      <div><b>${t.name}</b> · ${t.m} ${t.d} · <span class="mono" style="font-size:11px;color:var(--amber)">${t.prize}</span></div></div>`));
  });
}

/* ================= LFG ================= */
let lfgFilter='All';
function renderLfgFilters(){
  const cats=['All',...new Set(LFG.map(p=>p.game))];
  $('lfgFilters').innerHTML='';
  cats.forEach(c=>{
    const b=el(`<button class="chip ${c===lfgFilter?'sel':''}">${c}</button>`);
    b.onclick=()=>{lfgFilter=c;renderLfgFilters();renderLfg();};
    $('lfgFilters').appendChild(b);
  });
}
function renderLfg(){
  const list=$('lfgList'); list.innerHTML='';
  const items = LFG.filter(p=>lfgFilter==='All'||p.game===lfgFilter);
  if(!items.length){ list.appendChild(el(`<div class="empty"><div class="e-ico">📡</div><b>No live signals on this frequency</b>Broadcast your own LFG and squads will find you.</div>`)); return; }
  items.forEach((p,i)=>{
    const g=gameBy(p.game);
    const card=el(`<div class="panel lfg-card" style="--accent:${g.c}">
      <div class="game-ico" style="color:${g.c};background:${g.glow};border-color:${g.c}55">${g.ab}</div>
      <div><div class="lfg-title">${esc(p.title)}${p.live?' <span class=\"tag lm\" style=\"margin-left:6px\">LIVE</span>':''}</div>
        <div class="lfg-meta"><span class="tag" style="color:${g.c};border-color:${g.c}55">${p.game.toUpperCase()}</span>${p.author?`<span class="tag">BY ${esc(p.author.toUpperCase())}</span>`:''}${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div>
      <div class="lfg-right">
        <div class="countdown" data-expires="${p.expiresAt||''}"><span class="cd-dot"></span><span class="cd-txt mono">--:--</span></div>
        <div class="slots">${Array.from({length:p.slots},(_,k)=>`<i class="${k<p.filled?'fill':''}"></i>`).join('')}</div>
        <button class="btn sm primary">JOIN SQUAD</button>
      </div></div>`);
    card.querySelector('.btn').onclick=()=>openRoom(p);
    list.appendChild(card);
  });
}
/* live countdowns — derived from each post's absolute expiry, so
   re-renders can't reset them; expired posts are pruned from the feed */
setInterval(()=>{
  const now = Date.now();
  document.querySelectorAll('.countdown[data-expires]').forEach(c=>{
    const exp = +c.dataset.expires;
    if(!exp) return;
    const s = Math.max(0, Math.round((exp-now)/1000));
    const m=String(Math.floor(s/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
    c.querySelector('.cd-txt').textContent=`${m}:${ss}`;
    c.classList.toggle('crit', s<300);
  });
  const live = LFG.filter(p=>!p.expiresAt || p.expiresAt > now);
  if(live.length !== LFG.length){
    LFG = live;
    if(lfgFilter!=='All' && !LFG.some(p=>p.game===lfgFilter)) lfgFilter='All';
    renderLfgFilters(); renderLfg();
    $('lfgBadge').textContent = LFG.length+' LIVE';
  }
},1000);

/* ================= MISSIONS ================= */
function renderMissions(){
  $('missionGrid').innerHTML='';
  MISSIONS.forEach(m=>{
    const g=gameBy(m.game);
    const c=el(`<div class="panel mission-card" style="--accent:${g.c}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="tag" style="color:${g.c};border-color:${g.c}55">${m.game.toUpperCase()}</span>
        <div class="diff" title="Difficulty">${Array.from({length:5},(_,i)=>`<i class="${i<m.diff?'on':''}"></i>`).join('')}</div>
      </div>
      <div class="m-goal">${m.goal}</div>
      <div class="m-desc">${m.desc}</div>
      <div class="m-foot">
        <div class="m-poster"><div class="av">${m.by[0]}</div>${m.by} · <span class="mono" style="color:var(--lime)">★${m.rep}</span></div>
        <button class="btn sm ghost">ACCEPT →</button>
      </div></div>`);
    c.querySelector('.btn').onclick=()=>openRoom({game:m.game,title:m.goal,slots:4,filled:2});
    $('missionGrid').appendChild(c);
  });
}

/* ================= GAME CAROUSEL ================= */
let gcIdx=0, gcTimer=null;
const gcReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderCarousel(){
  const track=$('gcTrack'); track.innerHTML='';
  GAMES.forEach(g=>{
    const s=el(`<div class="gc-slide" style="--hub:${g.c};--hub-glow:${g.glow}">
      <div class="gc-abbr">${g.ab}</div>
      <div class="gc-info">
        <div class="gc-tag">${g.tag}</div>
        <div class="gc-name">${g.n}</div>
        <div class="gc-stat"><b>${g.online}</b> PLAYERS ONLINE NOW</div>
        <button class="btn sm primary gc-enter">ENTER HUB →</button>
      </div></div>`);
    s.querySelector('.gc-enter').onclick=e=>{ e.stopPropagation(); selectHub(g); };
    s.onclick=()=>selectHub(g);
    track.appendChild(s);
  });
  $('gcDots').innerHTML='';
  GAMES.forEach((g,i)=>{
    const d=el(`<i class="${i===gcIdx?'on':''}"></i>`);
    d.onclick=()=>gcGoto(i);
    $('gcDots').appendChild(d);
  });
  gcUpdate();
}
function gcUpdate(){
  $('gcTrack').style.transform=`translateX(-${gcIdx*100}%)`;
  $('gcDots').querySelectorAll('i').forEach((d,i)=>d.classList.toggle('on',i===gcIdx));
}
function gcGoto(i){ gcIdx=(i+GAMES.length)%GAMES.length; gcUpdate(); gcRestart(); }
function gcRestart(){ clearInterval(gcTimer); if(!gcReduce) gcTimer=setInterval(()=>gcGoto(gcIdx+1),4500); }
$('gcNext').onclick=()=>gcGoto(gcIdx+1);
$('gcPrev').onclick=()=>gcGoto(gcIdx-1);
$('gameCarousel').addEventListener('mouseenter',()=>clearInterval(gcTimer));
$('gameCarousel').addEventListener('mouseleave',gcRestart);

/* ================= HUBS ================= */
function renderHubs(){
  $('hubGrid').innerHTML='';
  GAMES.forEach(g=>{
    const c=el(`<div class="hub-card" style="--hub:${g.c};--hub-glow:${g.glow}">
      <div class="h-abbr">${g.ab}</div>
      <div class="h-name">${g.n}</div>
      <div class="h-stat"><b>${g.online}</b> ONLINE · ${g.tag}</div></div>`);
    c.onclick=()=>selectHub(g);
    $('hubGrid').appendChild(c);
  });
}
function selectHub(g){
  document.documentElement.style.setProperty('--accent', g.c); Sfx.open();
  addXPOnce('hub_'+g.n, XP_EVENTS.hub, `Entered ${g.n} hub`);
  $('hubDetail').innerHTML='';
  $('hubDetail').appendChild(el(`<div class="panel" style="--accent:${g.c};background:
      radial-gradient(80% 140% at 90% -20%, ${g.glow}, transparent 60%),
      linear-gradient(165deg,rgba(16,26,46,.8),rgba(9,14,26,.9))">
    <div class="eyebrow" style="--accent:${g.c};color:${g.c}">HUB ONLINE · INTERFACE RETUNED</div>
    <h2 style="font-size:26px;margin-top:10px">${g.n} Command</h2>
    <p style="color:var(--ink-dim);margin:8px 0 18px;max-width:560px">Live LFG for ${g.n}, active clans recruiting, and this week's scrim calendar — all themed to the hub's own signal color.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn sm" style="border-color:${g.c}66;color:${g.c}" onclick="lfgFilter='${g.n}';renderLfgFilters();renderLfg();go('lfg')">VIEW ${g.ab} LFG</button>
      <button class="btn sm ghost" onclick="toast('🛡️','Clan browser','${g.n.toUpperCase()} CLANS — COMING TO THIS PROTOTYPE')">BROWSE CLANS</button>
    </div></div>`));
  $('hubDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}
const xpOnce = new Set();
function addXPOnce(key,n,why){ if(xpOnce.has(key))return; xpOnce.add(key); addXP(n,why); }

/* ================= TOURNAMENTS ================= */
function renderTours(){
  $('tourList').innerHTML='';
  TOURS.forEach(t=>{
    const g=gameBy(t.game);
    const c=el(`<div class="panel tour-card" style="--accent:${g.c}">
      <div class="tour-date"><b>${t.d}</b><span>${t.m}</span></div>
      <div><div class="lfg-title">${t.name}</div>
        <div class="lfg-meta"><span class="tag" style="color:${g.c};border-color:${g.c}55">${t.game.toUpperCase()}</span><span class="tag">${t.need}</span></div></div>
      <div class="lfg-right"><div class="prize">${t.prize}</div><button class="btn sm hot">REGISTER</button></div></div>`);
    c.querySelector('.btn').onclick=()=>{ addXPOnce('tour_'+t.name, XP_EVENTS.register, `Registered: ${t.name}`); unlockAch('squad','Squad Leader'); };
    $('tourList').appendChild(c);
  });
}

/* ================= PROFILE ================= */
function renderProfile(){
  $('gcName').textContent=S.name; $('heroName').textContent=S.name;
  $('sideName').textContent=S.name;
  $('gcHandle').innerHTML=`@${esc(S.name.toLowerCase().replace(/\s/g,''))} · MUMBAI SERVER · LVL <span id="gcLvl">${S.level}</span>`;
  ['sideAv','gcAv'].forEach(id=>$(id).textContent=S.avatar);
  $('gcTags').innerHTML = [...S.games.map(g=>['cy',g.toUpperCase()]),...S.styles.map(s=>['mg',s.toUpperCase()]),...S.langs.map(l=>['am',l.toUpperCase()]),...S.goals.map(g=>['lm',g.toUpperCase()])].map(tagHtml).join('');
  $('endorseList').innerHTML = ENDORSE.map(e=>`<div class="endorse"><span class="e-nm">${esc(e[0])}</span><span class="e-bar"><i style="width:${e[1]}%"></i></span><span class="e-ct">${e[1]}</span></div>`).join('');
  renderAch();
  if(Backend.enabled && Backend.currentUser()){
    Backend.fetchEndorsementCounts(Backend.currentUser().id).then(counts=>{
      const entries = Object.entries(counts);
      if(!entries.length) return;
      const max = Math.max(...entries.map(e=>e[1]));
      $('endorseList').innerHTML = entries.sort((a,b)=>b[1]-a[1])
        .map(([trait,count])=>`<div class="endorse"><span class="e-nm">${esc(trait)}</span><span class="e-bar"><i style="width:${Math.round(count/max*100)}%"></i></span><span class="e-ct">${count}</span></div>`).join('');
    });
  }
}
function openEndorsePicker(targetId, targetName){
  $('endorseTarget').textContent = targetName;
  $('endorseTraits').innerHTML='';
  ENDORSE.forEach(([trait])=>{
    const c=el(`<button class="chip">${esc(trait)}</button>`);
    c.onclick=async ()=>{
      const ok = await Backend.insertEndorsement(targetId, trait);
      if(ok){ toast('🤝','Endorsement sent',`${trait.toUpperCase()} — GIVEN TO ${targetName.toUpperCase()}`); closeOv('endorseOv'); }
      else toast('⚠️','Could not send','TRY AGAIN IN A MOMENT');
    };
    $('endorseTraits').appendChild(c);
  });
  openOv('endorseOv');
}
function renderAch(){
  $('achGrid').innerHTML='';
  ACH.forEach(a=>{
    const got=S.achievements.has(a.id);
    $('achGrid').appendChild(el(`<div class="ach ${got?'':'locked'}"><span class="a-ico">${a.ico}</span><div><div class="a-nm">${a.nm}</div><div class="a-ds">${got?a.ds:'LOCKED'}</div></div></div>`));
  });
  $('achCnt').textContent = `${S.achievements.size}/${ACH.length} UNLOCKED`;
}

/* ================= SWIPE DECK ================= */
let deckIdx=0;
let DECK = SWIPES;
function renderDeck(){
  const d=$('deck'); d.innerHTML='';
  const rest = DECK.slice(deckIdx, deckIdx+3);
  if(!rest.length){ d.appendChild(el(`<div class="empty" style="height:100%;display:flex;flex-direction:column;justify-content:center"><div class="e-ico">🛰️</div><b>Radar swept clean</b>New compatible operators surface every few minutes.<br><br><button class="btn sm primary" onclick="deckIdx=0;renderDeck()">RESCAN</button></div>`)); return; }
  rest.reverse().forEach((p,i)=>{
    const pos = rest.length-1-i; // 0 = top
    const card=el(`<div class="swipe-card ${pos===1?'behind':pos===2?'behind2':''}" style="--sc-glow:${p.glow}">
      <div class="sc-bg"></div>
      <div class="stamp invite">INVITE</div><div class="stamp skip">SKIP</div>
      <div class="sc-head"><div class="av ring">${esc((p.n[0]||'?').toUpperCase())}</div><div><div class="nm">${esc(p.n)}</div><div class="hn">${esc(p.h)}</div></div></div>
      <div class="sc-compat"><b>${p.compat}%</b><span>SQUAD COMPATIBILITY</span></div>
      <div class="sc-bars">${p.bars.map(b=>`<div class="sc-bar"><div class="lb"><span>${b[0]}</span><span>${b[1]}</span></div><div class="tr"><i style="width:${b[1]}%"></i></div></div>`).join('')}</div>
      <div class="sc-tags">${p.tags.map(tagHtml).join('')}</div></div>`);
    d.appendChild(card);
    if(pos===0) bindDrag(card,p);
  });
}
function bindDrag(card,p){
  let sx=0, dx=0, dragging=false;
  const start=e=>{dragging=true;sx=(e.touches?e.touches[0]:e).clientX;card.style.transition='none';};
  const move=e=>{ if(!dragging)return; dx=((e.touches?e.touches[0]:e).clientX)-sx;
    card.style.transform=`translateX(${dx}px) rotate(${dx*.05}deg)`;
    card.querySelector('.stamp.invite').style.opacity=Math.max(0,dx/90);
    card.querySelector('.stamp.skip').style.opacity=Math.max(0,-dx/90); };
  const end=()=>{ if(!dragging)return; dragging=false;
    if(dx>110) swipe(1,p,card); else if(dx<-110) swipe(-1,p,card);
    else{ card.style.transition='transform .3s'; card.style.transform=''; card.querySelectorAll('.stamp').forEach(s=>s.style.opacity=0);} dx=0; };
  card.addEventListener('pointerdown',e=>{card.setPointerCapture(e.pointerId);start(e);});
  card.addEventListener('pointermove',move);
  card.addEventListener('pointerup',end); card.addEventListener('pointercancel',end);
}
function swipe(dir,p,card){
  card = card||$('deck').querySelector('.swipe-card:not(.behind):not(.behind2)');
  if(!card) return;
  p = p||DECK[deckIdx];
  card.style.transition='transform .45s ease, opacity .45s';
  card.style.transform=`translateX(${dir*560}px) rotate(${dir*22}deg)`; card.style.opacity=0;
  if(dir>0){
    Sfx.invite(); toast('🤝','Invite sent',`${p.n.toUpperCase()} · ${p.compat}% COMPATIBLE`);
    addXP(XP_EVENTS.invite,'Duo invite'); if(p.compat>=90) completeQuest('q4');
  }
  else Sfx.skip();
  setTimeout(()=>{deckIdx++;renderDeck();},380);
}
$('btnSkip').onclick=()=>swipe(-1);
$('btnInvite').onclick=()=>swipe(1);

/* ================= SQUAD ROOM ================= */
let roomTimer=null;
function openRoom(p){
  const g=gameBy(p.game);
  $('roomTitle').textContent=p.title.length>44?p.title.slice(0,44)+'…':p.title;
  $('roomSub').textContent=`${p.game} · voice channel armed. Everyone presses READY, then the room hands off to the game lobby.`;
  const names=['Vex','Nyx','Draco', S.name];
  $('roomMembers').innerHTML = names.map((n,i)=>`<div class="rm ${i<2?'ready':''}" id="rm-${i}">
    <div class="av">${i===3?S.avatar:n[0]}</div><div class="rm-n">${n}${i===3?' (you)':''}</div><div class="rm-s">${i<2?'READY':'STANDBY'}</div></div>`).join('');
  $('readyBtn').disabled=false; $('readyBtn').textContent='PRESS READY';
  openOv('roomOv'); addXP(XP_EVENTS.join,'Joined squad room'); completeQuest('q1');
  let s=300; clearInterval(roomTimer);
  roomTimer=setInterval(()=>{ s=Math.max(0,s-1);
    $('roomCd').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    if(!s) clearInterval(roomTimer); },1000);
}
$('readyBtn').onclick=()=>{
  const me=$('rm-3'); me.classList.add('ready'); me.querySelector('.rm-s').textContent='READY';
  $('readyBtn').disabled=true; $('readyBtn').textContent='LOCKED IN'; Sfx.ready();
  completeQuest('q3');
  setTimeout(()=>{ const o=$('rm-2'); o.classList.add('ready'); o.querySelector('.rm-s').textContent='READY'; Sfx.ready(); },900);
  setTimeout(()=>{ Sfx.launch(); toast('🚀','SQUAD LOCKED','ALL READY — HANDING OFF TO GAME LOBBY'); unlockAch('clutch','First Clutch'); closeRoom(); },2100);
};
function closeRoom(){ clearInterval(roomTimer); closeOv('roomOv'); }

/* ================= POST MODAL ================= */
let postGameSel='Valorant', postExpSel='15 min';
function openPost(){
  $('postGame').innerHTML=''; $('postExp').innerHTML='';
  GAMES.slice(0,6).forEach(g=>{
    const c=el(`<button class="chip ${g.n===postGameSel?'sel':''}">${g.n}</button>`);
    c.onclick=()=>{postGameSel=g.n;openPost();}; $('postGame').appendChild(c);
  });
  ['15 min','30 min','1 hr','3 hr'].forEach(x=>{
    const c=el(`<button class="chip ${x===postExpSel?'sel':''}">${x}</button>`);
    c.onclick=()=>{postExpSel=x;openPost();}; $('postExp').appendChild(c);
  });
  openOv('postOv');
}
const seenLfgIds = new Set();
function addLfgPost(post){
  if(post.id){ if(seenLfgIds.has(post.id)) return; seenLfgIds.add(post.id); }
  LFG.unshift(post);
  renderLfgFilters(); renderLfg();
  $('lfgBadge').textContent = LFG.length+' LIVE';
}
let postSending=false;
$('postSend').onclick=async ()=>{
  if(postSending) return;
  const goal=$('postGoal').value.trim();
  if(!goal){ toast('⚠️','Objective required','LEAD WITH THE GOAL — IT FILLS 3× FASTER'); return; }
  if(hasBlockedWord(goal)){ toast('🚫','Post blocked','KEEP LFG TITLES CLEAN — EDIT AND TRY AGAIN'); return; }
  const mins = {'15 min':15,'30 min':30,'1 hr':60,'3 hr':180}[postExpSel];
  $('postGoal').value=''; closeOv('postOv'); go('lfg');
  if(Backend.enabled && Backend.currentUser()){
    postSending=true; $('postSend').disabled=true;
    const saved = await Backend.insertLfgPost({game:postGameSel,title:goal,tags:['Mic required',postExpSel+' window'],slots:5,filled:1,mins,authorName:S.name});
    postSending=false; $('postSend').disabled=false;
    if(saved){ addLfgPost(saved); addXP(XP_EVENTS.post,'Broadcast LFG'); return; }
    toast('⚠️','Broadcast failed','COULD NOT REACH THE SERVER — POSTED LOCALLY INSTEAD');
  }
  addLfgPost({game:postGameSel,title:goal,tags:['Posted by you','Mic required',postExpSel+' window'],slots:5,filled:1,mins,expiresAt:Date.now()+mins*60000});
  addXP(XP_EVENTS.post,'Broadcast LFG');
};

/* ================= OVERLAYS ================= */
function openOv(id){ $(id).classList.add('on'); Sfx.open(); }
function closeOv(id){ $(id).classList.remove('on'); }
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o && o.id!=='onboardOv') o.classList.remove('on'); }));

/* ================= ONBOARDING ================= */
const OB = { step:1, avatars:['⚡','🐺','👾','🦅','🔮','🐉','🎯','🛰️'],
  games:['Valorant','CS2','Minecraft','Fortnite','League of Legends','Apex Legends','Rocket League','FIFA','Destiny 2'],
  langs:['English','Hindi','Marathi','Tamil','Spanish','Japanese'],
  styles:['Competitive','Casual','Chill','IGL','Entry Fragger','Support Main','Sniper','Tank','Healer','Speedrunner','Achievement Hunter','Content Creator','Coach'],
  goals:['Rank Push','Boss Kills','Raid Groups','Tournament Roster','Teach Beginners','Make Friends','Content Grind','Trophy Hunt'] };
function pickCloud(id, opts, selArr, max=4){
  $(id).innerHTML='';
  opts.forEach(o=>{
    const c=el(`<button class="chip ${selArr.includes(o)?'sel':''}">${o}</button>`);
    c.onclick=()=>{ const i=selArr.indexOf(o);
      if(i>-1) selArr.splice(i,1); else { if(selArr.length>=max) selArr.shift(); selArr.push(o); }
      pickCloud(id,opts,selArr,max); };
    $(id).appendChild(c);
  });
}
function onboardOpen(edit=false){
  OB.step=1; obShow();
  $('obName').value = edit? S.name : '';
  $('avPick').innerHTML='';
  OB.avatars.forEach(a=>{
    const d=el(`<div class="av ${a===S.avatar?'sel':''}" tabindex="0" role="button">${a}</div>`);
    d.onclick=()=>{S.avatar=a;onboardOpen(edit);};
    $('avPick').appendChild(d);
  });
  pickCloud('gamePick',OB.games,S.games,4);
  pickCloud('langPick',OB.langs,S.langs,3);
  pickCloud('stylePick',OB.styles,S.styles,4);
  pickCloud('goalPick',OB.goals,S.goals,3);
  openOv('onboardOv');
}
function obShow(){
  [1,2,3].forEach(i=>{ $('obStep'+i).style.display = OB.step===i?'block':'none'; $('st'+i).classList.toggle('on', OB.step>=i); });
  $('obBack').style.visibility = OB.step>1?'visible':'hidden';
  $('obNext').textContent = OB.step===3?'DEPLOY GAMER CARD ⚡':'CONTINUE →';
}
$('obBack').onclick=()=>{ OB.step--; obShow(); };
$('obNext').onclick=()=>{
  if(OB.step===1){
    const n=$('obName').value.trim();
    if(n){
      if(hasBlockedWord(n)){ toast('🚫','Callsign blocked','PICK SOMETHING ELSE'); return; }
      S.name=n;
    }
  }
  if(OB.step<3){ OB.step++; obShow(); return; }
  S.onboarded = true;
  closeOv('onboardOv'); renderProfile(); renderRecs();
  toast('🪪','Gamer Card deployed',`WELCOME, ${S.name.toUpperCase()} — MATCHMAKING ENGINE CALIBRATED`);
  unlockAch('first','First Link');
  saveState(); syncProfileNow();
};

/* ================= MOOD ================= */
const MOODS=[['Grinding','var(--lime)'],['Tilted','var(--danger)'],['Casual','var(--cyan)'],['Tournament','var(--amber)']];
let moodIdx=0;
$('moodBtn').onclick=()=>{
  moodIdx=(moodIdx+1)%MOODS.length;
  $('moodTxt').textContent=MOODS[moodIdx][0];
  $('moodDot').style.background=MOODS[moodIdx][1];
  $('moodDot').style.boxShadow=`0 0 10px ${MOODS[moodIdx][1]}`;
  toast('🎭','Mood updated',`STATUS: ${MOODS[moodIdx][0].toUpperCase()} — MATCHES RETUNED`);
  saveState();
};

/* ================= SOUND TOGGLE ================= */
$('soundBtn').onclick=()=>{ const on=Sfx.toggle(); $('soundBtn').classList.toggle('muted',!on);
  $('soundBtn').title = on?'Sound on':'Sound off'; };

/* ================= ENTER ================= */
$('enterBtn').onclick=()=>{
  Sfx.launch();
  $('landing').classList.add('gone');
  $('app').classList.add('on');
  if(S.onboarded){
    setTimeout(()=>toast('👋','Welcome back',`${S.name.toUpperCase()} — LEVEL ${S.level} — MATCHMAKING RESUMED`), 500);
  } else {
    setTimeout(()=>onboardOpen(false), 700);
  }
};

/* ================= AUTH / BACKEND ================= */
$('discordBtn').onclick=()=>Backend.signInWithDiscord();
$('signOutBtn').onclick=async ()=>{
  await Backend.signOut();
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  location.reload();
};
function applyProfileRow(row){
  S.name=row.name; S.avatar=row.avatar; S.games=row.games||[]; S.langs=row.langs||[];
  S.styles=row.styles||[]; S.goals=row.goals||[]; S.level=row.level; S.xp=row.xp; S.xpNeed=row.xp_need;
  S.quests=row.quests||{}; S.achievements=new Set(row.achievements&&row.achievements.length?row.achievements:['first']);
  S.onboarded=!!row.onboarded; moodIdx = row.mood_idx||0;
}

/* ================= AMBIENT SIM =================
   demo-mode flavor only: real deployments get real events from the
   backend, so the fake ones stay off there (and while tab is hidden) */
setInterval(()=>{
  if(!$('app').classList.contains('on') || document.hidden || Backend.enabled) return;
  const evts=[['🟢','Vex is online','VALORANT · IMMORTAL 1'],['📡','New LFG match','DESTINY 2 RAID — 92% FIT FOR YOUR GOALS'],['🏆','Roster slot opened','MUMBAI ASCENSION CUP NEEDS A SMOKES MAIN']];
  const e=evts[Math.floor(Math.random()*evts.length)];
  toast(e[0],e[1],e[2]);
}, 45000);

/* ================= INIT ================= */
async function initApp(){
  loadState();

  if(Backend.enabled){
    await Backend.init();
    const user = Backend.currentUser();
    if(user){
      const row = await Backend.loadProfile(user.id);
      if(row) applyProfileRow(row);
      else S.name = user.user_metadata?.full_name || user.user_metadata?.name || S.name;
      $('signOutBtn').style.display='inline-block';
    } else {
      $('discordBtn').style.display='inline-flex';
      $('enterBtn').classList.add('btn-guest-alt');
      $('enterBtn').textContent='CONTINUE AS GUEST';
    }
    // the OAuth callback can deliver the session after getSession() resolves;
    // keep the auth UI honest whenever it lands
    Backend.onAuthChange(sess=>{
      const signedIn = !!(sess && sess.user);
      $('signOutBtn').style.display = signedIn ? 'inline-block' : 'none';
      $('discordBtn').style.display = signedIn ? 'none' : 'inline-flex';
      if(signedIn){ $('enterBtn').classList.remove('btn-guest-alt'); $('enterBtn').textContent='ENTER THE ARENA'; }
    });
    Backend.fetchLfgPosts().then(posts=>{ posts.reverse().forEach(addLfgPost); });
    Backend.subscribeLfgInserts(post=>{
      addLfgPost(post);
      if(post.author && post.author!==S.name) toast('📡','New LFG match',`${post.game.toUpperCase()} — ${post.title.toUpperCase()}`);
    });
    Backend.joinPresence(S.name, count=>{
      $('presenceBadge').style.display='inline-flex';
      $('presenceCount').textContent = count;
    });
    Backend.fetchProfiles(user ? user.id : null).then(profiles=>{
      REAL_PROFILES = profiles;
      DECK = profiles.length ? profiles.map(profileToSwipeCard) : SWIPES;
      deckIdx = 0;
      renderRecs(); renderDeck();
    });
  }

  renderXP(); renderRecs(); renderFriends(); renderQuests(); renderTourMini();
  renderLfgFilters(); renderLfg(); renderMissions(); renderHubs(); renderCarousel(); renderTours(); renderProfile(); renderDeck();
  gcRestart();
  $('moodTxt').textContent=MOODS[moodIdx][0];
  $('moodDot').style.background=MOODS[moodIdx][1];
  $('moodDot').style.boxShadow=`0 0 10px ${MOODS[moodIdx][1]}`;
}
initApp();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
