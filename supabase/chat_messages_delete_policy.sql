create extension if not exists pgcrypto;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null
    check (char_length(btrim(content)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

revoke all on table public.chat_messages from anon;
revoke all on table public.chat_messages from authenticated;
grant select, insert, delete
  on table public.chat_messages to authenticated;

drop policy if exists "Users can view their chat messages"
  on public.chat_messages;
create policy "Users can view their chat messages"
  on public.chat_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their chat messages"
  on public.chat_messages;
create policy "Users can create their chat messages"
  on public.chat_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their chat messages"
  on public.chat_messages;
create policy "Users can delete their chat messages"
  on public.chat_messages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
