create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists keys jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'p256dh'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'auth'
  ) then
    update public.push_subscriptions
    set keys = jsonb_build_object(
      'p256dh',
      p256dh,
      'auth',
      auth
    )
    where keys is null;

    alter table public.push_subscriptions
      alter column p256dh drop not null,
      alter column auth drop not null;
  end if;
end
$$;

alter table public.push_subscriptions
  alter column keys set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_subscriptions_keys_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_keys_check
      check (
        jsonb_typeof(keys) = 'object'
        and jsonb_typeof(keys -> 'p256dh') = 'string'
        and jsonb_typeof(keys -> 'auth') = 'string'
      );
  end if;
end
$$;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create unique index if not exists
  push_subscriptions_endpoint_unique_idx
  on public.push_subscriptions (endpoint);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;
grant select, insert, update, delete
  on table public.push_subscriptions
  to authenticated;

drop policy if exists "Users can view their push subscriptions"
  on public.push_subscriptions;
create policy "Users can view their push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their push subscriptions"
  on public.push_subscriptions;
create policy "Users can create their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their push subscriptions"
  on public.push_subscriptions;
create policy "Users can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their push subscriptions"
  on public.push_subscriptions;
create policy "Users can delete their push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
