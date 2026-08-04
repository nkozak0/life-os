create extension if not exists pgcrypto;

create table if not exists public.ai_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  topic text not null
    check (char_length(btrim(topic)) between 1 and 500),
  is_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_reminders_dispatch_idx
  on public.ai_reminders (scheduled_for)
  where is_sent = false;

create index if not exists ai_reminders_user_idx
  on public.ai_reminders (user_id, scheduled_for desc);

alter table public.ai_reminders enable row level security;

revoke all on table public.ai_reminders from anon;
revoke all on table public.ai_reminders from authenticated;
grant select, insert, delete on table public.ai_reminders to authenticated;

drop policy if exists "Users can view their reminders"
  on public.ai_reminders;
create policy "Users can view their reminders"
  on public.ai_reminders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can schedule their reminders"
  on public.ai_reminders;
create policy "Users can schedule their reminders"
  on public.ai_reminders
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and is_sent = false
  );

drop policy if exists "Users can delete their reminders"
  on public.ai_reminders;
create policy "Users can delete their reminders"
  on public.ai_reminders
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

