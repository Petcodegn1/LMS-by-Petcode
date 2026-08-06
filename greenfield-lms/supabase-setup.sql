-- Run this once in your Supabase project's SQL Editor (Supabase dashboard → SQL Editor → New query).
-- It creates the single table the app uses to store all shared school data
-- (directory, coursework, attendance, results, fees, messages, etc.) as
-- JSON blobs keyed by name — mirroring the key/value shape the app expects.

create table if not exists lms_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security is on, but policies below are permissive (anyone with
-- the public anon key can read/write). See the security note at the top of
-- src/storageShim.supabase.js for what this does and doesn't protect against.
alter table lms_storage enable row level security;

create policy "Allow anonymous read" on lms_storage
  for select using (true);

create policy "Allow anonymous insert" on lms_storage
  for insert with check (true);

create policy "Allow anonymous update" on lms_storage
  for update using (true);

create policy "Allow anonymous delete" on lms_storage
  for delete using (true);
