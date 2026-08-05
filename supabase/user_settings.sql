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
    ),
  accountability_roast_level text not null default 'standard',
  default_calendar_view text not null default 'month',
  semester_start date,
  semester_end date,
  weight_unit text not null default 'lbs',
  default_rest_seconds integer not null default 90,
  last_ai_checkin timestamptz not null
    default (now() - interval '1 day'),
  core_memory text not null default ''
);

alter table public.user_settings
  add column if not exists accountability_roast_level text
    not null default 'standard',
  add column if not exists default_calendar_view text
    not null default 'month',
  add column if not exists semester_start date,
  add column if not exists semester_end date,
  add column if not exists weight_unit text
    not null default 'lbs',
  add column if not exists default_rest_seconds integer
    not null default 90,
  add column if not exists last_ai_checkin timestamptz
    not null default (now() - interval '1 day'),
  add column if not exists core_memory text
    not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_roast_level_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_roast_level_check
      check (
        accountability_roast_level in (
          'gentle',
          'standard',
          'unhinged'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_calendar_view_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_calendar_view_check
      check (default_calendar_view in ('day', 'week', 'month'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_semester_dates_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_semester_dates_check
      check (
        semester_start is null
        or semester_end is null
        or semester_end >= semester_start
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_weight_unit_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_weight_unit_check
      check (weight_unit in ('lbs', 'kg'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_rest_seconds_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_rest_seconds_check
      check (default_rest_seconds between 15 and 900);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_core_memory_length_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_core_memory_length_check
      check (char_length(core_memory) <= 8000);
  end if;
end
$$;

insert into public.user_settings (user_id)
select id
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_default_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_default_user_settings()
  from public, anon, authenticated;

drop trigger if exists create_default_user_settings_on_signup
  on auth.users;
create trigger create_default_user_settings_on_signup
  after insert on auth.users
  for each row execute procedure public.create_default_user_settings();

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
