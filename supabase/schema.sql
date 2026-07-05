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
  updated_at timestamptz not null default now()
);

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

-- ============ REALTIME ============
-- Broadcast INSERT/UPDATE/DELETE on lfg_posts to subscribed clients.
alter publication supabase_realtime add table public.lfg_posts;

-- ============ HOUSEKEEPING ============
-- Optional: a cron-free cleanup you can run periodically (Supabase → Database → Cron, or manually)
-- to drop long-expired posts instead of just hiding them client-side.
-- delete from public.lfg_posts where expires_at < now() - interval '1 day';
