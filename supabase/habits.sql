create extension if not exists pgcrypto;

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null
    references public.habits(id) on delete cascade,
  completed_date date not null default current_date,
  unique (habit_id, completed_date)
);

create index if not exists habits_user_created_idx
  on public.habits (user_id, created_at);

create index if not exists habit_completions_habit_date_idx
  on public.habit_completions (habit_id, completed_date desc);

alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;

revoke all on table public.habits from anon;
revoke all on table public.habit_completions from anon;
revoke all on table public.habits from authenticated;
revoke all on table public.habit_completions from authenticated;

grant select, insert, update, delete
  on table public.habits to authenticated;
grant select, insert, delete
  on table public.habit_completions to authenticated;

drop policy if exists "Users can view their habits"
  on public.habits;
create policy "Users can view their habits"
  on public.habits
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their habits"
  on public.habits;
create policy "Users can create their habits"
  on public.habits
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their habits"
  on public.habits;
create policy "Users can update their habits"
  on public.habits
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their habits"
  on public.habits;
create policy "Users can delete their habits"
  on public.habits
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their habit completions"
  on public.habit_completions;
create policy "Users can view their habit completions"
  on public.habit_completions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can create their habit completions"
  on public.habit_completions;
create policy "Users can create their habit completions"
  on public.habit_completions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their habit completions"
  on public.habit_completions;
create policy "Users can delete their habit completions"
  on public.habit_completions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );
