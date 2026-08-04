import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  ROUTINE_SELECT,
  type Routine,
} from "@/lib/workouts/types";

type RoutineExerciseInput = {
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  rest_time_seconds: number;
};

type CreateRoutineBody = {
  name?: unknown;
  exercises?: unknown;
};

type UpdateRoutineBody = CreateRoutineBody & {
  routineId?: unknown;
};

type DeleteRoutineBody = {
  routineId?: unknown;
  deleteWorkoutHistory?: unknown;
};

function parseInteger(value: unknown, fallback: number) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const parsedValue =
    typeof value === "number"
      ? Math.trunc(value)
      : Number.parseInt(String(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function normalizeRoutineExercise(
  value: unknown,
): RoutineExerciseInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RoutineExerciseInput>;
  const targetSets = parseInteger(candidate.target_sets, 3);
  const targetReps = parseInteger(candidate.target_reps, 10);
  const restTimeSeconds = parseInteger(
    candidate.rest_time_seconds,
    90,
  );

  if (
    typeof candidate.exercise_id !== "string" ||
    candidate.exercise_id.length === 0 ||
    targetSets < 1 ||
    targetReps < 1 ||
    restTimeSeconds < 0
  ) {
    return null;
  }

  return {
    exercise_id: candidate.exercise_id,
    target_sets: targetSets,
    target_reps: targetReps,
    rest_time_seconds: restTimeSeconds,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    return NextResponse.json(
      { error: "You must be signed in to create a routine." },
      { status: 401 },
    );
  }

  let body: CreateRoutineBody;

  try {
    body = (await request.json()) as CreateRoutineBody;
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawExercises = Array.isArray(body.exercises)
    ? body.exercises
    : [];
  const exercises = rawExercises
    .map(normalizeRoutineExercise)
    .filter(
      (exercise): exercise is RoutineExerciseInput =>
        exercise !== null,
    );

  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Routine name is required and must be 120 characters or less." },
      { status: 400 },
    );
  }

  if (
    exercises.length === 0 ||
    exercises.length !== rawExercises.length
  ) {
    return NextResponse.json(
      {
        error:
          "Add at least one exercise with valid sets, reps, and rest time.",
      },
      { status: 400 },
    );
  }

  const exerciseIds = exercises.map(
    (exercise: RoutineExerciseInput) => exercise.exercise_id,
  );

  if (new Set(exerciseIds).size !== exerciseIds.length) {
    return NextResponse.json(
      { error: "A routine cannot contain the same exercise twice." },
      { status: 400 },
    );
  }

  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .insert({ name })
    .select()
    .single();

  if (routineError || !routine) {
    console.error("Supabase routine insert failed:", routineError);

    return NextResponse.json(
      {
        error:
          routineError?.message ?? "Unable to create the routine.",
        detail: routineError?.message,
      },
      { status: 500 },
    );
  }

  const routineExercises = exercises.map(
    (exercise: RoutineExerciseInput, index) => ({
      routine_id: routine.id,
      exercise_id: exercise.exercise_id,
      target_sets: parseInteger(exercise.target_sets, 3),
      target_reps: parseInteger(exercise.target_reps, 10),
      rest_time_seconds: parseInteger(
        exercise.rest_time_seconds,
        90,
      ),
      sort_order: index,
    }),
  );

  const { error: routineExercisesError } = await supabase
    .from("routine_exercises")
    .insert(routineExercises);

  if (routineExercisesError) {
    console.error(
      "Supabase routine_exercises insert failed:",
      routineExercisesError,
    );

    await supabase.from("routines").delete().eq("id", routine.id);

    return NextResponse.json(
      {
        error: routineExercisesError.message,
        detail: routineExercisesError.message,
      },
      { status: 500 },
    );
  }

  const { data: savedRoutine, error: savedRoutineError } = await supabase
    .from("routines")
    .select(ROUTINE_SELECT)
    .eq("id", routine.id)
    .single();

  if (savedRoutineError || !savedRoutine) {
    return NextResponse.json(
      {
        routine: {
          ...routine,
          routine_exercises: [],
        } satisfies Routine,
        warning:
          "The routine was saved, but its details could not be refreshed.",
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { routine: savedRoutine as unknown as Routine },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    return NextResponse.json(
      { error: "You must be signed in to delete a routine." },
      { status: 401 },
    );
  }

  let body: DeleteRoutineBody;

  try {
    body = (await request.json()) as DeleteRoutineBody;
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const routineId =
    typeof body.routineId === "string" ? body.routineId.trim() : "";
  const deleteWorkoutHistory = body.deleteWorkoutHistory === true;

  if (!routineId) {
    return NextResponse.json(
      { error: "A routine id is required." },
      { status: 400 },
    );
  }

  const { count: workoutCount, error: workoutCountError } =
    await supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("routine_id", routineId);

  if (workoutCountError) {
    return NextResponse.json(
      {
        error: "Unable to check this routine's workout history.",
        detail: workoutCountError.message,
        code: workoutCountError.code,
      },
      { status: 500 },
    );
  }

  if ((workoutCount ?? 0) > 0 && !deleteWorkoutHistory) {
    return NextResponse.json(
      {
        error:
          "This routine still has workout history attached to it.",
        requiresHistoryConfirmation: true,
        workoutCount,
      },
      { status: 409 },
    );
  }

  if ((workoutCount ?? 0) > 0) {
    const { error: workoutDeleteError } = await supabase
      .from("workouts")
      .delete()
      .eq("routine_id", routineId);

    if (workoutDeleteError) {
      return NextResponse.json(
        {
          error: "Unable to delete the routine's workout history.",
          detail: workoutDeleteError.message,
          code: workoutDeleteError.code,
          hint: workoutDeleteError.hint,
        },
        { status: 500 },
      );
    }
  }

  const { error: routineExerciseDeleteError } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("routine_id", routineId);

  if (routineExerciseDeleteError) {
    return NextResponse.json(
      {
        error: "Unable to delete the routine exercises.",
        detail: routineExerciseDeleteError.message,
        code: routineExerciseDeleteError.code,
        hint: routineExerciseDeleteError.hint,
      },
      { status: 500 },
    );
  }

  const { data: deletedRoutine, error: routineDeleteError } =
    await supabase
      .from("routines")
      .delete()
      .eq("id", routineId)
      .select("id")
      .maybeSingle();

  if (routineDeleteError) {
    return NextResponse.json(
      {
        error: "Unable to delete the routine.",
        detail: routineDeleteError.message,
        code: routineDeleteError.code,
        hint: routineDeleteError.hint,
      },
      { status: 500 },
    );
  }

  if (!deletedRoutine) {
    return NextResponse.json(
      {
        error:
          "The routine was not found or you do not have permission to delete it.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    routineId,
    workoutsDeleted: deleteWorkoutHistory ? workoutCount ?? 0 : 0,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    return NextResponse.json(
      { error: "You must be signed in to edit a routine." },
      { status: 401 },
    );
  }

  let body: UpdateRoutineBody;

  try {
    body = (await request.json()) as UpdateRoutineBody;
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const routineId =
    typeof body.routineId === "string" ? body.routineId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawExercises = Array.isArray(body.exercises)
    ? body.exercises
    : [];
  const exercises = rawExercises
    .map(normalizeRoutineExercise)
    .filter(
      (exercise): exercise is RoutineExerciseInput =>
        exercise !== null,
    );

  if (!routineId) {
    return NextResponse.json(
      { error: "Routine ID is required." },
      { status: 400 },
    );
  }

  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Routine name is required and must be 120 characters or less." },
      { status: 400 },
    );
  }

  if (
    exercises.length === 0 ||
    exercises.length !== rawExercises.length
  ) {
    return NextResponse.json(
      {
        error:
          "Add at least one exercise with valid sets, reps, and rest time.",
      },
      { status: 400 },
    );
  }

  const exerciseIds = exercises.map((exercise) => exercise.exercise_id);

  if (new Set(exerciseIds).size !== exerciseIds.length) {
    return NextResponse.json(
      { error: "A routine cannot contain the same exercise twice." },
      { status: 400 },
    );
  }

  const { data: previousExercises, error: previousExercisesError } =
    await supabase
      .from("routine_exercises")
      .select(
        "routine_id, exercise_id, target_sets, target_reps, rest_time_seconds, sort_order",
      )
      .eq("routine_id", routineId);

  if (previousExercisesError) {
    return NextResponse.json(
      {
        error: previousExercisesError.message,
        detail: previousExercisesError.message,
      },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("routine_id", routineId);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message, detail: deleteError.message },
      { status: 500 },
    );
  }

  const replacementRows = exercises.map((exercise, index) => ({
    routine_id: routineId,
    exercise_id: exercise.exercise_id,
    target_sets: parseInteger(exercise.target_sets, 3),
    target_reps: parseInteger(exercise.target_reps, 10),
    rest_time_seconds: parseInteger(
      exercise.rest_time_seconds,
      90,
    ),
    sort_order: index,
  }));
  const { error: replacementError } = await supabase
    .from("routine_exercises")
    .insert(replacementRows);

  if (replacementError) {
    console.error(
      "Supabase routine edit insert failed:",
      replacementError,
    );

    if (previousExercises && previousExercises.length > 0) {
      const { error: rollbackError } = await supabase
        .from("routine_exercises")
        .insert(previousExercises);

      if (rollbackError) {
        console.error(
          "Supabase routine edit rollback failed:",
          rollbackError,
        );
      }
    }

    return NextResponse.json(
      {
        error: replacementError.message,
        detail: replacementError.message,
      },
      { status: 500 },
    );
  }

  const { error: routineUpdateError } = await supabase
    .from("routines")
    .update({ name })
    .eq("id", routineId);

  if (routineUpdateError) {
    return NextResponse.json(
      {
        error: routineUpdateError.message,
        detail: routineUpdateError.message,
      },
      { status: 500 },
    );
  }

  const { data: savedRoutine, error: savedRoutineError } = await supabase
    .from("routines")
    .select(ROUTINE_SELECT)
    .eq("id", routineId)
    .single();

  if (savedRoutineError || !savedRoutine) {
    return NextResponse.json(
      {
        error:
          savedRoutineError?.message ??
          "The routine was updated but could not be refreshed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    routine: savedRoutine as unknown as Routine,
  });
}
