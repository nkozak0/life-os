create extension if not exists pgcrypto;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  course text not null check (length(btrim(course)) > 0),
  due_date timestamptz not null,
  is_completed boolean not null default false,
  source text not null default 'manual',
  moodle_event_id text unique
);

alter table public.assignments enable row level security;

revoke all on table public.assignments from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant insert on table public.assignments to anon, authenticated;

drop policy if exists "Allow manual assignment inserts" on public.assignments;

create policy "Allow manual assignment inserts"
on public.assignments
for insert
to anon, authenticated
with check (
  source = 'manual'
  and is_completed = false
  and moodle_event_id is null
);
