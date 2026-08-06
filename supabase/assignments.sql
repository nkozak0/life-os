create extension if not exists pgcrypto;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  course text,
  due_date timestamptz not null,
  is_completed boolean not null default false,
  source text not null default 'manual',
  moodle_event_id text unique,
  created_at timestamptz not null default now()
);

alter table public.assignments
  alter column user_id set default auth.uid();

create index if not exists assignments_user_due_idx
  on public.assignments (user_id, is_completed, due_date);

alter table public.assignments enable row level security;

grant usage on schema public to authenticated;
revoke all on table public.assignments from anon;
revoke all on table public.assignments from authenticated;
grant select, insert, update, delete
  on table public.assignments to authenticated;

drop policy if exists "Allow manual assignment inserts"
  on public.assignments;

drop policy if exists "Users can view their assignments"
  on public.assignments;
create policy "Users can view their assignments"
  on public.assignments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their assignments"
  on public.assignments;
create policy "Users can create their assignments"
  on public.assignments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and source = 'manual'
  );

drop policy if exists "Users can update their assignments"
  on public.assignments;
create policy "Users can update their assignments"
  on public.assignments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their assignments"
  on public.assignments;
create policy "Users can delete their assignments"
  on public.assignments
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
