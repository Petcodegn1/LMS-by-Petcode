-- ============================================================================
-- LMSbyPetcode — Real Auth Migration
-- Run this in Supabase's SQL Editor AFTER supabase-setup.sql (the original
-- lms_storage table must already exist).
--
-- What this does:
--   1. Creates a `profiles` table linking real Supabase Auth users to a
--      school_id + role, so Postgres can enforce access rules based on WHO
--      is actually logged in, not just "anyone with the public API key."
--   2. Replaces the old permissive policies on lms_storage with real ones:
--      a school's data is only readable/writable by members of that school
--      (or the platform owner).
--   3. Splits the old single "platform" blob into three separate keys with
--      different access rules, since it previously mixed owner passwords,
--      every school's registry, and support tickets into one row that
--      anyone could read:
--        - platform_registry      (schools + owners)      → owner only
--        - platform_announcements (broadcast messages)     → owner writes, everyone reads
--        - platform_auditlog      (owner's own audit log)  → owner only
--      Support tickets move to each school's own scoped key
--      (`${schoolId}:tickets`), consistent with everything else that school
--      owns.
--
-- IMPORTANT LIMITATION (read this): Postgres Row Level Security enforces
-- rules per ROW. This app stores each school's entire "results" (or "fees",
-- "coursework", etc.) as ONE row containing every student's data as a single
-- JSON blob. That means these policies correctly stop School A from ever
-- touching School B's data, and stop anyone without a real login from
-- touching anything — but they CANNOT stop a student at School A from
-- reading a classmate's grade by calling the API directly, because both
-- students' records live inside the same row. The app's own UI never shows
-- that data to the wrong person, but the raw database doesn't distinguish
-- between records within a row. Fixing that fully requires normalizing this
-- data into one-row-per-record tables — a much larger rewrite.
-- ============================================================================

-- 1. Profiles table — one row per real Supabase Auth user
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id text,              -- null for platform owners
  role text not null,          -- 'owner' | 'admin' | 'teacher' | 'student' | 'parent'
  app_username text not null,  -- the username shown/used inside the LMS
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- People can read their own profile (needed so the app can look up its own role/school on load)
create policy "Read own profile" on profiles
  for select using (auth.uid() = id);

-- Only the service role (used by the create-user Edge Function) can insert/update profiles —
-- regular logged-in users should never be able to grant themselves a different role or school.
-- (No insert/update/delete policy is created for the anon/authenticated roles, so those
-- operations are blocked by default under RLS. The Edge Function uses the service_role key,
-- which bypasses RLS entirely, by design — that's the only place account creation happens.)

-- 2. Helper functions — used inside the lms_storage policies below
create or replace function my_role() returns text
language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function my_school_id() returns text
language sql security definer stable as $$
  select school_id from profiles where id = auth.uid();
$$;

create or replace function is_owner() returns boolean
language sql security definer stable as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'owner', false);
$$;

-- 3. Replace the old permissive lms_storage policies
drop policy if exists "Allow anonymous read" on lms_storage;
drop policy if exists "Allow anonymous insert" on lms_storage;
drop policy if exists "Allow anonymous update" on lms_storage;
drop policy if exists "Allow anonymous delete" on lms_storage;

-- School-scoped keys (e.g. "sch_abc123:directory") are only touchable by a
-- logged-in member of that exact school, or the owner.
create policy "School members read own school data" on lms_storage
  for select using (
    is_owner()
    or (my_school_id() is not null and key like my_school_id() || ':%')
    or key in ('platform_announcements', 'platform_articles')
  );

create policy "School members write own school data" on lms_storage
  for insert with check (
    is_owner()
    or (my_school_id() is not null and key like my_school_id() || ':%')
  );

create policy "School members update own school data" on lms_storage
  for update using (
    is_owner()
    or (my_school_id() is not null and key like my_school_id() || ':%')
  );

create policy "School members delete own school data" on lms_storage
  for delete using (
    is_owner()
    or (my_school_id() is not null and key like my_school_id() || ':%')
  );

-- Owner-only keys: platform_registry, platform_auditlog
create policy "Owner reads platform registry and audit log" on lms_storage
  for select using (
    is_owner() and key in ('platform_registry', 'platform_auditlog')
  );

create policy "Owner writes platform registry and audit log" on lms_storage
  for insert with check (
    is_owner() and key in ('platform_registry', 'platform_auditlog', 'platform_announcements', 'platform_articles')
  );

create policy "Owner updates platform registry and audit log" on lms_storage
  for update using (
    is_owner() and key in ('platform_registry', 'platform_auditlog', 'platform_announcements', 'platform_articles')
  );

-- Note: platform_announcements read access for everyone is covered in the
-- "School members read own school data" policy above (the `or key =
-- 'platform_announcements'` clause) — announcements are meant to be public
-- broadcasts, so any logged-in user can read them, but only the owner can
-- write them (covered by the owner-only insert/update policies above).
