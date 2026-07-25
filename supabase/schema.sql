-- PLAYRA — Supabase schema
-- Run this once in your project's SQL Editor (Supabase Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

-- ============ PROFILES ============
-- One row per authenticated player. Mirrors the client-side `S` state object.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Recruit',
  avatar text not null default '⚡',
  games text[] not null default '{}',
  langs text[] not null default '{}',
  styles text[] not null default '{}',
  goals text[] not null default '{}',
  level int not null default 1,
  xp int not null default 0,
  xp_need int not null default 100,
  quests jsonb not null default '{}',
  achievements text[] not null default '{first}',
  mood_idx int not null default 0,
  onboarded boolean not null default false,
  discord_handle text not null default '',
  updated_at timestamptz not null default now()
);

-- safe to run on an existing deployment
alter table public.profiles add column if not exists discord_handle text not null default '';

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============ LFG POSTS ============
-- Live "looking for group" broadcasts. Rows disappear from the feed once expires_at passes
-- (the client filters expired rows; nothing here deletes them automatically).
create table if not exists public.lfg_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  game text not null,
  title text not null,
  tags text[] not null default '{}',
  slots int not null default 5,
  filled int not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.lfg_posts enable row level security;

drop policy if exists "lfg posts are viewable by everyone" on public.lfg_posts;
create policy "lfg posts are viewable by everyone"
  on public.lfg_posts for select
  using (true);

drop policy if exists "authenticated users can post lfg" on public.lfg_posts;
create policy "authenticated users can post lfg"
  on public.lfg_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update their own lfg posts" on public.lfg_posts;
create policy "users can update their own lfg posts"
  on public.lfg_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own lfg posts" on public.lfg_posts;
create policy "users can delete their own lfg posts"
  on public.lfg_posts for delete
  using (auth.uid() = user_id);

create index if not exists lfg_posts_expires_at_idx on public.lfg_posts (expires_at);

-- ============ JOINING ============
-- Joining someone else's post can't be a plain UPDATE (RLS restricts that
-- to the owner), so it goes through a definer function that increments the
-- filled count atomically and never past the slot cap or an expired post.
create or replace function public.join_lfg(post_id uuid)
returns setof public.lfg_posts
language sql
security definer
set search_path = public
as $$
  update public.lfg_posts
     set filled = least(slots, filled + 1)
   where id = post_id
     and expires_at > now()
     and filled < slots
  returning *;
$$;

revoke all on function public.join_lfg(uuid) from public;
grant execute on function public.join_lfg(uuid) to authenticated;

-- ============ ENDORSEMENTS ============
-- One row per (endorser, target, trait). A player can give the same trait
-- to the same target only once — re-endorsing just no-ops (see the unique
-- index below), so counts reflect distinct endorsers, not repeat clicks.
create table if not exists public.endorsements (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  trait text not null,
  created_at timestamptz not null default now(),
  constraint no_self_endorse check (from_user <> to_user)
);

create unique index if not exists endorsements_unique_idx
  on public.endorsements (from_user, to_user, trait);

alter table public.endorsements enable row level security;

drop policy if exists "endorsements are viewable by everyone" on public.endorsements;
create policy "endorsements are viewable by everyone"
  on public.endorsements for select
  using (true);

drop policy if exists "authenticated users can give endorsements" on public.endorsements;
create policy "authenticated users can give endorsements"
  on public.endorsements for insert
  to authenticated
  with check (auth.uid() = from_user);

-- ============ RATE LIMITING ============
-- Defense in depth: the client already throttles LFG broadcasts in the
-- UI (a posting-in-flight guard), but nothing stops a script hitting the
-- REST API directly. Caps each user to 5 LFG posts per rolling 60s.
create or replace function public.enforce_lfg_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
    from public.lfg_posts
   where user_id = new.user_id
     and created_at > now() - interval '60 seconds';
  if recent_count >= 5 then
    raise exception 'RATE_LIMIT: too many LFG posts, slow down';
  end if;
  return new;
end;
$$;

drop trigger if exists lfg_rate_limit_trigger on public.lfg_posts;
create trigger lfg_rate_limit_trigger
  before insert on public.lfg_posts
  for each row execute function public.enforce_lfg_rate_limit();

-- ============ SERVER-SIDE MODERATION ============
-- Mirrors js/app.js's BLOCKLIST. This is defense in depth so a client
-- that bypasses the UI (or hits the REST API directly) can't post
-- around the client-side check — NOT a substitute for a real moderation
-- pipeline (Perspective API etc. — see DEPLOYMENT_ROADMAP.md Phase 1.2).
-- It only catches exact-word matches, same limitation as the client list.
create or replace function public.contains_blocked_word(input text)
returns boolean
language sql
immutable
as $$
  select input ~* '\y(fuck|shit|bitch|nigger|faggot|cunt|asshole|whore|slut|retard|rape)\y';
$$;

create or replace function public.enforce_clean_lfg_title()
returns trigger
language plpgsql
as $$
begin
  if public.contains_blocked_word(new.title) then
    raise exception 'MODERATION: LFG title contains blocked language';
  end if;
  return new;
end;
$$;

drop trigger if exists lfg_moderation_trigger on public.lfg_posts;
create trigger lfg_moderation_trigger
  before insert or update on public.lfg_posts
  for each row execute function public.enforce_clean_lfg_title();

create or replace function public.enforce_clean_profile_name()
returns trigger
language plpgsql
as $$
begin
  if public.contains_blocked_word(new.name) then
    raise exception 'MODERATION: callsign contains blocked language';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_moderation_trigger on public.profiles;
create trigger profile_moderation_trigger
  before insert or update on public.profiles
  for each row execute function public.enforce_clean_profile_name();

-- ============ REPORTS ============
-- Minimum viable safety valve: captures reports for manual review in the
-- Supabase dashboard. No automated action (auto-hide, auto-ban) yet —
-- see DEPLOYMENT_ROADMAP.md Phase 1.3 for what a fuller version needs.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  context text not null default '',
  reason text not null,
  created_at timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_id)
);

alter table public.reports enable row level security;

drop policy if exists "users can file reports" on public.reports;
create policy "users can file reports"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "users can see their own filed reports" on public.reports;
create policy "users can see their own filed reports"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- ============ REALTIME ============
-- Broadcast INSERT/UPDATE/DELETE on lfg_posts to subscribed clients.
-- Postgres has no "ADD TABLE IF NOT EXISTS" for publications, so this
-- wraps it in a block that swallows the "already a member" error —
-- without this, re-running the script on a project where realtime was
-- already enabled throws 42710 and (since Supabase's SQL Editor runs
-- the whole paste as one implicit transaction) rolls back everything
-- else in this file along with it, silently.
do $$
begin
  alter publication supabase_realtime add table public.lfg_posts;
exception when duplicate_object then
  null;
end $$;

-- ============ HOUSEKEEPING ============
-- Optional: a cron-free cleanup you can run periodically (Supabase → Database → Cron, or manually)
-- to drop long-expired posts instead of just hiding them client-side.
-- delete from public.lfg_posts where expires_at < now() - interval '1 day';

-- ============================================================================
-- ============ PHASE 2: INTEGRITY, SESSIONS, CONTENT, MODERATION =============
-- Everything below turns PLAYRA from "a demo with a database" into something
-- that survives real users. Still safe to re-run top to bottom.
-- ============================================================================

-- ============ ADMIN / BAN PRIMITIVES ============
-- Both are plain columns on profiles. is_admin is never settable by a client:
-- the progression guard below rejects any client-side change to it, so the
-- only way in is the Supabase dashboard / service role.
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists banned_until timestamptz;

-- security definer so policies can call it without tripping over profiles' own
-- RLS (a policy that selects from the table it protects would recurse).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

create or replace function public.is_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select banned_until > now() from public.profiles where id = uid), false);
$$;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_banned(uuid) to authenticated;

-- ============ PROGRESSION LOCKDOWN ============
-- P0 fix. Previously the client upserted its own level/xp, and the profiles
-- UPDATE policy let it: anyone could open devtools and set level 999, which
-- made the whole reputation surface meaningless.
--
-- Now level/xp/xp_need/achievements/is_admin/banned_until are server-owned.
-- The guard below rejects client writes to them; the only legitimate path is
-- award_xp(), which sets a transaction-local flag the guard recognises.
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text,
  amount int not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- one-shot awards (quests, achievements, "first time you did X") pass an
-- event_key; this index is what makes re-awarding them a no-op.
create unique index if not exists xp_events_once_idx
  on public.xp_events (user_id, event_key) where event_key is not null;
create index if not exists xp_events_recent_idx on public.xp_events (user_id, created_at);

alter table public.xp_events enable row level security;

drop policy if exists "users can see their own xp events" on public.xp_events;
create policy "users can see their own xp events"
  on public.xp_events for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

create or replace function public.guard_profile_progression()
returns trigger
language plpgsql
as $$
begin
  -- award_xp() and other trusted server paths set this for their transaction
  if coalesce(current_setting('playra.trusted', true), '') = 'on' then
    return new;
  end if;
  -- direct database access (Supabase SQL editor, service role, migrations) is
  -- already privileged. PostgREST always connects as anon/authenticated, so a
  -- browser client can never reach this branch -- but without it there is no
  -- way to appoint the first admin or hand-correct a row.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a fresh profile always starts at the bottom, whatever the client sent
    new.level := 1; new.xp := 0; new.xp_need := 100;
    new.achievements := '{first}';
    new.is_admin := false; new.banned_until := null;
    return new;
  end if;

  if new.level       is distinct from old.level
  or new.xp          is distinct from old.xp
  or new.xp_need     is distinct from old.xp_need
  or new.achievements is distinct from old.achievements then
    raise exception 'PROGRESSION: level, xp and achievements are server-controlled';
  end if;
  if new.is_admin is distinct from old.is_admin
  or new.banned_until is distinct from old.banned_until then
    raise exception 'PROGRESSION: moderation flags are server-controlled';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_progression_guard on public.profiles;
create trigger profile_progression_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_progression();

-- The only way XP moves. Caps a single award, caps the rolling 24h total, and
-- treats event_key as an idempotency key so a replayed request can't double-pay.
create or replace function public.award_xp(p_amount int, p_reason text default '', p_event_key text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  day_total int;
begin
  if uid is null then raise exception 'AUTH: sign in required'; end if;
  if public.is_banned(uid) then raise exception 'BANNED: account suspended'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 500 then
    raise exception 'PROGRESSION: invalid xp amount';
  end if;

  select coalesce(sum(e.amount), 0) into day_total
    from public.xp_events e
   where e.user_id = uid and e.created_at > now() - interval '24 hours';
  if day_total + p_amount > 5000 then
    raise exception 'PROGRESSION: daily xp cap reached';
  end if;

  insert into public.xp_events (user_id, event_key, amount, reason)
  values (uid, p_event_key, p_amount, p_reason)
  on conflict (user_id, event_key) where event_key is not null do nothing;

  -- already awarded under this key: hand back the current profile untouched
  if not found then
    select * into prof from public.profiles where id = uid;
    return prof;
  end if;

  perform set_config('playra.trusted', 'on', true);

  update public.profiles
     set xp = xp + p_amount, updated_at = now()
   where id = uid
  returning * into prof;

  while prof.xp >= prof.xp_need loop
    update public.profiles
       set xp = xp - xp_need,
           level = level + 1,
           xp_need = greatest(100, round(xp_need * 1.35)::int)
     where id = uid
    returning * into prof;
  end loop;

  return prof;
end;
$$;

revoke all on function public.award_xp(int, text, text) from public;
grant execute on function public.award_xp(int, text, text) to authenticated;

-- Achievements are server-owned too, so unlocking one needs its own door.
create or replace function public.unlock_achievement(p_ach text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then raise exception 'AUTH: sign in required'; end if;
  if p_ach is null or length(p_ach) = 0 or length(p_ach) > 40 then
    raise exception 'PROGRESSION: invalid achievement';
  end if;
  perform set_config('playra.trusted', 'on', true);
  update public.profiles
     set achievements = (select array(select distinct unnest(achievements || p_ach))),
         updated_at = now()
   where id = uid
  returning * into prof;
  return prof;
end;
$$;

revoke all on function public.unlock_achievement(text) from public;
grant execute on function public.unlock_achievement(text) to authenticated;

-- ============ SQUAD SESSIONS ============
-- Squad rooms used to be realtime presence and nothing else: refresh the page
-- and the room never existed. That left no record of who actually played
-- together, which is what endorsements are supposed to be built on.
create table if not exists public.squad_sessions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.lfg_posts(id) on delete set null,
  game text not null default '',
  title text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists squad_sessions_post_idx
  on public.squad_sessions (post_id) where post_id is not null;

create table if not exists public.squad_members (
  session_id uuid not null references public.squad_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists squad_members_user_idx on public.squad_members (user_id);

alter table public.squad_sessions enable row level security;
alter table public.squad_members enable row level security;

drop policy if exists "squad sessions readable by members" on public.squad_sessions;
create policy "squad sessions readable by members"
  on public.squad_sessions for select
  using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.squad_members m
                where m.session_id = squad_sessions.id and m.user_id = auth.uid())
  );

drop policy if exists "squad membership readable by teammates" on public.squad_members;
create policy "squad membership readable by teammates"
  on public.squad_members for select
  using (
    public.is_admin(auth.uid())
    or user_id = auth.uid()
    or exists (select 1 from public.squad_members mine
                where mine.session_id = squad_members.session_id
                  and mine.user_id = auth.uid())
  );

-- Writes go exclusively through join_squad_session() below, so there are no
-- INSERT policies here on purpose — a client cannot fabricate a shared session
-- (and therefore cannot fabricate the right to endorse someone).
create or replace function public.join_squad_session(p_post_id uuid, p_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  post public.lfg_posts;
begin
  if uid is null then raise exception 'AUTH: sign in required'; end if;
  if public.is_banned(uid) then raise exception 'BANNED: account suspended'; end if;

  select * into post from public.lfg_posts where id = p_post_id;
  if post.id is null then raise exception 'NOT_FOUND: no such LFG post'; end if;

  select id into sid from public.squad_sessions where post_id = p_post_id;
  if sid is null then
    insert into public.squad_sessions (post_id, game, title)
    values (p_post_id, post.game, post.title)
    returning id into sid;
  end if;

  insert into public.squad_members (session_id, user_id, name)
  values (sid, uid, coalesce(nullif(p_name, ''), 'Operator'))
  on conflict (session_id, user_id) do update set name = excluded.name;

  return sid;
end;
$$;

revoke all on function public.join_squad_session(uuid, text) from public;
grant execute on function public.join_squad_session(uuid, text) to authenticated;

-- ============ ENDORSEMENT GATE ============
-- The Gamer Card claims "endorsements come only from completed sessions —
-- every badge was given by a real teammate." Nothing enforced that; you could
-- endorse a stranger straight off the recommendations grid. Now the database
-- requires the two accounts to have actually shared a squad.
create or replace function public.enforce_endorsement_shared_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.squad_members a
      join public.squad_members b on a.session_id = b.session_id
     where a.user_id = new.from_user
       and b.user_id = new.to_user
  ) then
    raise exception 'ENDORSE_GATE: you can only endorse someone you have squadded with';
  end if;
  return new;
end;
$$;

drop trigger if exists endorsement_session_gate on public.endorsements;
create trigger endorsement_session_gate
  before insert on public.endorsements
  for each row execute function public.enforce_endorsement_shared_session();

-- ============ MISSIONS ============
-- The Mission Marketplace was nine hardcoded rows in app.js. It is a headline
-- feature with its own nav entry, so it gets a real table with the same
-- protections LFG posts have: rate limit, moderation, ban check.
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default 'Operator',
  game text not null,
  goal text not null,
  description text not null default '',
  difficulty int not null default 3 check (difficulty between 1 and 5),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create index if not exists missions_created_idx on public.missions (created_at desc);

create table if not exists public.mission_accepts (
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

alter table public.missions enable row level security;
alter table public.mission_accepts enable row level security;

drop policy if exists "missions are viewable by everyone" on public.missions;
create policy "missions are viewable by everyone"
  on public.missions for select using (true);

drop policy if exists "authenticated users can post missions" on public.missions;
create policy "authenticated users can post missions"
  on public.missions for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "users can update their own missions" on public.missions;
create policy "users can update their own missions"
  on public.missions for update
  using (auth.uid() = user_id or public.is_admin(auth.uid()))
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "users can delete their own missions" on public.missions;
create policy "users can delete their own missions"
  on public.missions for delete
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "mission accepts are viewable by everyone" on public.mission_accepts;
create policy "mission accepts are viewable by everyone"
  on public.mission_accepts for select using (true);

drop policy if exists "authenticated users can accept missions" on public.mission_accepts;
create policy "authenticated users can accept missions"
  on public.mission_accepts for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "users can withdraw their mission accept" on public.mission_accepts;
create policy "users can withdraw their mission accept"
  on public.mission_accepts for delete using (auth.uid() = user_id);

create or replace function public.enforce_mission_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
    from public.missions
   where user_id = new.user_id
     and created_at > now() - interval '60 seconds';
  if recent_count >= 3 then
    raise exception 'RATE_LIMIT: too many missions, slow down';
  end if;
  return new;
end;
$$;

drop trigger if exists mission_rate_limit_trigger on public.missions;
create trigger mission_rate_limit_trigger
  before insert on public.missions
  for each row execute function public.enforce_mission_rate_limit();

create or replace function public.enforce_clean_mission()
returns trigger
language plpgsql
as $$
begin
  if public.contains_blocked_word(new.goal) or public.contains_blocked_word(new.description) then
    raise exception 'MODERATION: mission contains blocked language';
  end if;
  return new;
end;
$$;

drop trigger if exists mission_moderation_trigger on public.missions;
create trigger mission_moderation_trigger
  before insert or update on public.missions
  for each row execute function public.enforce_clean_mission();

-- ============ TOURNAMENTS ============
-- Previously four hardcoded rows advertising real prize money, where REGISTER
-- only granted XP. Now organiser-owned rows with real registrations.
-- Bracket/seeding logic is deliberately out of scope.
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid references public.profiles(id) on delete set null,
  game text not null,
  name text not null,
  requirements text not null default '',
  prize text not null default '',
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists tournaments_starts_idx on public.tournaments (starts_at);

create table if not exists public.tournament_registrations (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;

drop policy if exists "tournaments are viewable by everyone" on public.tournaments;
create policy "tournaments are viewable by everyone"
  on public.tournaments for select using (true);

-- Creating tournaments is an admin action: they advertise prize money, so a
-- random signed-in account must not be able to publish one.
drop policy if exists "admins manage tournaments" on public.tournaments;
create policy "admins manage tournaments"
  on public.tournaments for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "registrations are viewable by everyone" on public.tournament_registrations;
create policy "registrations are viewable by everyone"
  on public.tournament_registrations for select using (true);

drop policy if exists "authenticated users can register" on public.tournament_registrations;
create policy "authenticated users can register"
  on public.tournament_registrations for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "users can withdraw their registration" on public.tournament_registrations;
create policy "users can withdraw their registration"
  on public.tournament_registrations for delete using (auth.uid() = user_id);

-- ============ BLOCKS ============
-- Someone being harassed previously had exactly one option: file a report that
-- nobody could read. Blocking is the immediate self-serve remedy.
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "users can see their own blocks" on public.blocks;
create policy "users can see their own blocks"
  on public.blocks for select using (auth.uid() = blocker_id);

drop policy if exists "users can block" on public.blocks;
create policy "users can block"
  on public.blocks for insert to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists "users can unblock" on public.blocks;
create policy "users can unblock"
  on public.blocks for delete using (auth.uid() = blocker_id);

-- ============ BAN ENFORCEMENT ON EXISTING TABLES ============
-- The original insert policies only checked identity. A banned account could
-- still post LFG and endorse people, so ban was a label with no teeth.
drop policy if exists "authenticated users can post lfg" on public.lfg_posts;
create policy "authenticated users can post lfg"
  on public.lfg_posts for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "authenticated users can give endorsements" on public.endorsements;
create policy "authenticated users can give endorsements"
  on public.endorsements for insert to authenticated
  with check (auth.uid() = from_user and not public.is_banned(auth.uid()));

-- Admins need to be able to clear out content, and to read the report queue
-- they are supposed to action.
drop policy if exists "users can delete their own lfg posts" on public.lfg_posts;
create policy "users can delete their own lfg posts"
  on public.lfg_posts for delete
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "users can see their own filed reports" on public.reports;
create policy "users can see their own filed reports"
  on public.reports for select
  using (auth.uid() = reporter_id or public.is_admin(auth.uid()));

-- Moderator actions. Both are admin-gated inside the function body, so the
-- grant to authenticated is safe: a non-admin calling them just gets an error.
create or replace function public.set_ban(target uuid, until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN: admin only';
  end if;
  perform set_config('playra.trusted', 'on', true);
  update public.profiles set banned_until = until where id = target;
end;
$$;

revoke all on function public.set_ban(uuid, timestamptz) from public;
grant execute on function public.set_ban(uuid, timestamptz) to authenticated;

create or replace function public.admin_report_queue()
returns table (
  id uuid, reason text, context text, created_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text,
  reported_banned_until timestamptz, reports_against int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN: admin only';
  end if;
  return query
    select r.id, r.reason, r.context, r.created_at,
           r.reporter_id, rp.name, r.reported_id, tp.name, tp.banned_until,
           (select count(*)::int from public.reports x where x.reported_id = r.reported_id)
      from public.reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.profiles tp on tp.id = r.reported_id
     order by r.created_at desc
     limit 200;
end;
$$;

revoke all on function public.admin_report_queue() from public;
grant execute on function public.admin_report_queue() to authenticated;

-- ============ ACCOUNT DELETION & EXPORT ============
-- PLAYRA targets Indian players; the DPDP Act expects both erasure and access.
-- There was previously no way for a user to leave or to see what was held.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH: sign in required'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile',      (select to_jsonb(p) from public.profiles p where p.id = uid),
    'lfg_posts',    coalesce((select jsonb_agg(to_jsonb(l)) from public.lfg_posts l where l.user_id = uid), '[]'::jsonb),
    'missions',     coalesce((select jsonb_agg(to_jsonb(m)) from public.missions m where m.user_id = uid), '[]'::jsonb),
    'xp_events',    coalesce((select jsonb_agg(to_jsonb(x)) from public.xp_events x where x.user_id = uid), '[]'::jsonb),
    'squads',       coalesce((select jsonb_agg(to_jsonb(s)) from public.squad_members s where s.user_id = uid), '[]'::jsonb),
    'endorsements_received', coalesce((select jsonb_agg(to_jsonb(e)) from public.endorsements e where e.to_user = uid), '[]'::jsonb),
    'blocks',       coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = uid), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- Deleting the auth user cascades to profiles, and profiles cascades to
-- everything else, so this one statement erases the account completely.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH: sign in required'; end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ============ CLIENT ERROR REPORTING ============
-- Without this there is no way to know the deployed site is broken except a
-- user telling you. Insert-only for everyone; readable only by admins.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  stack text not null default '',
  url text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "anyone can report a client error" on public.client_errors;
create policy "anyone can report a client error"
  on public.client_errors for insert with check (true);

drop policy if exists "admins can read client errors" on public.client_errors;
create policy "admins can read client errors"
  on public.client_errors for select using (public.is_admin(auth.uid()));

create or replace function public.trim_client_errors()
returns trigger
language plpgsql
as $$
begin
  new.message := left(new.message, 500);
  new.stack   := left(new.stack, 2000);
  new.url     := left(new.url, 300);
  new.user_agent := left(new.user_agent, 300);
  return new;
end;
$$;

drop trigger if exists client_errors_trim on public.client_errors;
create trigger client_errors_trim
  before insert on public.client_errors
  for each row execute function public.trim_client_errors();

-- ============ HOUSEKEEPING ============
-- lfg_posts previously grew forever: expired rows were only hidden client-side.
create or replace function public.purge_expired()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.lfg_posts where expires_at < now() - interval '1 day';
  delete from public.client_errors where created_at < now() - interval '30 days';
  delete from public.xp_events where created_at < now() - interval '90 days' and event_key is null;
$$;

-- pg_cron is available on Supabase but not enabled by default, and CREATE
-- EXTENSION needs privileges the SQL editor may not have on every plan. This
-- schedules the purge when it can and stays silent when it can't, so the rest
-- of the script never rolls back over it. If it is skipped, either enable
-- pg_cron under Database -> Extensions and re-run, or call
-- select public.purge_expired(); on a schedule of your own.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('playra-purge-expired')
    where exists (select 1 from cron.job where jobname = 'playra-purge-expired');
  perform cron.schedule('playra-purge-expired', '17 4 * * *', 'select public.purge_expired();');
exception when others then
  raise notice 'pg_cron unavailable (%), skipping scheduled purge', sqlerrm;
end $$;

-- ============ REALTIME (phase 2 tables) ============
do $$
begin
  alter publication supabase_realtime add table public.missions;
exception when duplicate_object then
  null;
end $$;
