import { redirect } from "next/navigation";

import { WorkoutsClient } from "@/components/workouts/WorkoutsClient";
import { createClient } from "@/lib/supabase/server";
import {
  ROUTINE_SELECT,
  type Exercise,
  type Routine,
} from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login?next=/workouts");
  }

  const [exercisesResult, routinesResult] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .order("name", { ascending: true }),
    supabase
      .from("routines")
      .select(ROUTINE_SELECT)
      .order("name", { ascending: true }),
  ]);

  const queryErrors = [
    exercisesResult.error?.message,
    routinesResult.error?.message,
  ].filter(Boolean);

  return (
    <WorkoutsClient
      initialExercises={
        (exercisesResult.data ?? []) as unknown as Exercise[]
      }
      initialRoutines={
        (routinesResult.data ?? []) as unknown as Routine[]
      }
      initialError={
        queryErrors.length > 0
          ? `Some workout data could not be loaded: ${queryErrors.join(" ")}`
          : null
      }
    />
  );
}
