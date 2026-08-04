alter table public.chat_messages enable row level security;

grant delete on table public.chat_messages to authenticated;

drop policy if exists "Users can delete their chat messages"
  on public.chat_messages;
create policy "Users can delete their chat messages"
  on public.chat_messages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
