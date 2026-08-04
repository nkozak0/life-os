import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  WorkoutAnalytics,
  type AnalyticsWorkout,
  type AnalyticsWorkoutSet,
} from "@/components/analytics/WorkoutAnalytics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workout Analytics",
  description:
    "Training volume, intensity, frequency, and distribution analytics.",
};

const pageSize = 1000;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchCompletedWorkouts(
  supabase: ServerSupabaseClient,
) {
  const workouts: AnalyticsWorkout[] = [];
  let queryError: string | null = null;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
          id,
          routine_id,
          start_time,
          end_time,
          routines (
            id,
            name
          )
        `,
      )
      .not("end_time", "is", null)
      .order("start_time", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      queryError = error.message;
      break;
    }

    const page = (data ?? []) as unknown as AnalyticsWorkout[];
    workouts.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return { workouts, error: queryError };
}

async function fetchWorkoutSets(supabase: ServerSupabaseClient) {
  const workoutSets: AnalyticsWorkoutSet[] = [];
  let queryError: string | null = null;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("workout_sets")
      .select(
        `
          workout_id,
          exercise_id,
          set_number,
          weight_lbs,
          reps,
          created_at,
          exercises (
            id,
            name,
            muscle_group
          )
        `,
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      queryError = error.message;
      break;
    }

    const page = (data ?? []) as unknown as AnalyticsWorkoutSet[];
    workoutSets.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return { workoutSets, error: queryError };
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login?next=/analytics");
  }

  const [workoutResult, setResult] = await Promise.all([
    fetchCompletedWorkouts(supabase),
    fetchWorkoutSets(supabase),
  ]);
  const completedWorkoutIds = new Set(
    workoutResult.workouts.map((workout) => workout.id),
  );
  const completedWorkoutSets = setResult.workoutSets.filter((set) =>
    completedWorkoutIds.has(set.workout_id),
  );
  const errors = [
    workoutResult.error
      ? `Workouts: ${workoutResult.error}`
      : null,
    setResult.error ? `Sets: ${setResult.error}` : null,
  ].filter((error): error is string => Boolean(error));

  return (
    <WorkoutAnalytics
      workouts={workoutResult.workouts}
      workoutSets={completedWorkoutSets}
      initialError={errors.length > 0 ? errors.join(" ") : null}
    />
  );
}
