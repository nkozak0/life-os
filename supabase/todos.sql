create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 240),
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'todo'
);

alter table public.todos
  alter column user_id set default auth.uid();

create index if not exists todos_user_completion_created_idx
  on public.todos (user_id, is_completed, created_at desc);

alter table public.todos enable row level security;

grant usage on schema public to authenticated;
revoke all on table public.todos from anon;
revoke all on table public.todos from authenticated;
grant select, insert, update, delete
  on table public.todos to authenticated;

drop policy if exists "Users can view their todos"
  on public.todos;
create policy "Users can view their todos"
  on public.todos
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their todos"
  on public.todos;
create policy "Users can create their todos"
  on public.todos
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their todos"
  on public.todos;
create policy "Users can update their todos"
  on public.todos
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their todos"
  on public.todos;
create policy "Users can delete their todos"
  on public.todos
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
