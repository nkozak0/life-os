create table if not exists public.user_settings (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  preferred_name text
    check (
      preferred_name is null
      or char_length(btrim(preferred_name)) between 1 and 80
    ),
  current_focus text
    check (
      current_focus is null
      or char_length(btrim(current_focus)) between 1 and 600
  )
);

create unique index if not exists user_settings_user_id_idx
  on public.user_settings (user_id);

alter table public.user_settings enable row level security;

revoke all on table public.user_settings from anon;
revoke all on table public.user_settings from authenticated;
grant select, insert, update on table public.user_settings
  to authenticated;

drop policy if exists "Users can view their settings"
  on public.user_settings;
create policy "Users can view their settings"
  on public.user_settings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their settings"
  on public.user_settings;
create policy "Users can create their settings"
  on public.user_settings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their settings"
  on public.user_settings;
create policy "Users can update their settings"
  on public.user_settings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
