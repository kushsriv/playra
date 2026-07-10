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
