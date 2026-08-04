import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type WorkoutSetRow = {
  exercise_id: string;
  weight_lbs: number;
  reps: number;
  exercises:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

type HistoricalSetRow = {
  exercise_id: string;
  weight_lbs: number;
  reps: number;
};

type ExerciseMaximums = {
  exerciseName: string;
  actual: number;
  estimated: number;
};

const pageSize = 1000;

function calculateBrzycki(weight: number, reps: number) {
  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps >= 37
  ) {
    return 0;
  }

  return weight * (36 / (37 - reps));
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function getExerciseName(set: WorkoutSetRow) {
  const exercise = Array.isArray(set.exercises)
    ? set.exercises[0]
    : set.exercises;

  return exercise?.name ?? "Exercise";
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: workoutId } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    return NextResponse.json(
      { error: "You must be signed in to finish a workout." },
      { status: 401 },
    );
  }

  if (!workoutId) {
    return NextResponse.json(
      { error: "A workout id is required." },
      { status: 400 },
    );
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id, start_time, end_time")
    .eq("id", workoutId)
    .maybeSingle();

  if (workoutError) {
    return NextResponse.json(
      {
        error: "Unable to load this workout.",
        detail: workoutError.message,
        code: workoutError.code,
      },
      { status: 500 },
    );
  }

  if (!workout) {
    return NextResponse.json(
      { error: "Workout not found." },
      { status: 404 },
    );
  }

  const { data: sessionSetData, error: sessionSetError } =
    await supabase
      .from("workout_sets")
      .select(
        `
          exercise_id,
          weight_lbs,
          reps,
          exercises (
            id,
            name
          )
        `,
      )
      .eq("workout_id", workoutId);

  if (sessionSetError) {
    return NextResponse.json(
      {
        error: "Unable to calculate the workout summary.",
        detail: sessionSetError.message,
        code: sessionSetError.code,
      },
      { status: 500 },
    );
  }

  const sessionSets =
    (sessionSetData ?? []) as unknown as WorkoutSetRow[];
  const exerciseIds = [
    ...new Set(sessionSets.map((set) => set.exercise_id)),
  ];
  const historicalSets: HistoricalSetRow[] = [];

  if (exerciseIds.length > 0) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("exercise_id, weight_lbs, reps")
        .in("exercise_id", exerciseIds)
        .neq("workout_id", workoutId)
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json(
          {
            error: "Unable to compare historical personal records.",
            detail: error.message,
            code: error.code,
          },
          { status: 500 },
        );
      }

      const page = (data ?? []) as HistoricalSetRow[];
      historicalSets.push(...page);

      if (page.length < pageSize) {
        break;
      }
    }
  }

  const sessionMaximums = new Map<string, ExerciseMaximums>();

  for (const set of sessionSets) {
    const weight = Number(set.weight_lbs);
    const reps = Number(set.reps);

    if (
      !Number.isFinite(weight) ||
      weight < 0 ||
      !Number.isInteger(reps) ||
      reps < 1
    ) {
      continue;
    }

    const current = sessionMaximums.get(set.exercise_id) ?? {
      exerciseName: getExerciseName(set),
      actual: 0,
      estimated: 0,
    };
    current.actual = Math.max(current.actual, weight);
    current.estimated = Math.max(
      current.estimated,
      calculateBrzycki(weight, reps),
    );
    sessionMaximums.set(set.exercise_id, current);
  }

  const historicalMaximums = new Map<
    string,
    { actual: number; estimated: number }
  >();

  for (const set of historicalSets) {
    const weight = Number(set.weight_lbs);
    const reps = Number(set.reps);

    if (
      !Number.isFinite(weight) ||
      weight < 0 ||
      !Number.isInteger(reps) ||
      reps < 1
    ) {
      continue;
    }

    const current = historicalMaximums.get(set.exercise_id) ?? {
      actual: 0,
      estimated: 0,
    };
    current.actual = Math.max(current.actual, weight);
    current.estimated = Math.max(
      current.estimated,
      calculateBrzycki(weight, reps),
    );
    historicalMaximums.set(set.exercise_id, current);
  }

  const personalRecords = [...sessionMaximums.entries()].flatMap(
    ([exerciseId, sessionMaximum]) => {
      const historicalMaximum = historicalMaximums.get(exerciseId) ?? {
        actual: 0,
        estimated: 0,
      };
      const records: {
        exerciseId: string;
        exerciseName: string;
        type: "actual" | "estimated";
        value: number;
        previousValue: number;
      }[] = [];

      if (
        sessionMaximum.actual > 0 &&
        sessionMaximum.actual > historicalMaximum.actual
      ) {
        records.push({
          exerciseId,
          exerciseName: sessionMaximum.exerciseName,
          type: "actual",
          value: roundToTenth(sessionMaximum.actual),
          previousValue: roundToTenth(historicalMaximum.actual),
        });
      }

      if (
        sessionMaximum.estimated > 0 &&
        sessionMaximum.estimated > historicalMaximum.estimated
      ) {
        records.push({
          exerciseId,
          exerciseName: sessionMaximum.exerciseName,
          type: "estimated",
          value: roundToTenth(sessionMaximum.estimated),
          previousValue: roundToTenth(historicalMaximum.estimated),
        });
      }

      return records;
    },
  );
  const endTime = workout.end_time ?? new Date().toISOString();

  if (!workout.end_time) {
    const { error: finishError } = await supabase
      .from("workouts")
      .update({ end_time: endTime })
      .eq("id", workoutId)
      .is("end_time", null);

    if (finishError) {
      return NextResponse.json(
        {
          error: "Unable to finish this workout.",
          detail: finishError.message,
          code: finishError.code,
        },
        { status: 500 },
      );
    }
  }

  const durationSeconds = Math.max(
    0,
    Math.floor(
      (new Date(endTime).getTime() -
        new Date(workout.start_time).getTime()) /
        1000,
    ),
  );
  const totalVolume = sessionSets.reduce((total, set) => {
    const weight = Number(set.weight_lbs);
    const reps = Number(set.reps);

    return Number.isFinite(weight) &&
      weight >= 0 &&
      Number.isInteger(reps) &&
      reps > 0
      ? total + weight * reps
      : total;
  }, 0);

  return NextResponse.json({
    summary: {
      endTime,
      durationSeconds,
      totalVolume: roundToTenth(totalVolume),
      completedSets: sessionSets.length,
      personalRecords,
    },
  });
}
