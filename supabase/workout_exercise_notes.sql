create extension if not exists pgcrypto;

create table if not exists public.workout_exercise_notes (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null
    references public.workouts(id) on delete cascade,
  exercise_id uuid not null
    references public.exercises(id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  notes text not null default ''
    check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, exercise_id, sort_order)
);

create index if not exists workout_exercise_notes_workout_idx
  on public.workout_exercise_notes (workout_id, sort_order);

alter table public.workout_exercise_notes enable row level security;

revoke all on table public.workout_exercise_notes from anon;
revoke all on table public.workout_exercise_notes from authenticated;
grant select, insert, update, delete
  on table public.workout_exercise_notes to authenticated;

drop policy if exists "Users can view their workout exercise notes"
  on public.workout_exercise_notes;
create policy "Users can view their workout exercise notes"
  on public.workout_exercise_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercise_notes.workout_id
        and workouts.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can create their workout exercise notes"
  on public.workout_exercise_notes;
create policy "Users can create their workout exercise notes"
  on public.workout_exercise_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercise_notes.workout_id
        and workouts.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their workout exercise notes"
  on public.workout_exercise_notes;
create policy "Users can update their workout exercise notes"
  on public.workout_exercise_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercise_notes.workout_id
        and workouts.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercise_notes.workout_id
        and workouts.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their workout exercise notes"
  on public.workout_exercise_notes;
create policy "Users can delete their workout exercise notes"
  on public.workout_exercise_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercise_notes.workout_id
        and workouts.user_id = (select auth.uid())
    )
  );
