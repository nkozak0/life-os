import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type SeedExercise = {
  name: string;
  muscleGroup: string;
  baseWeight: number;
  progression: number;
  targetReps: number;
  restTimeSeconds: number;
};

type SeedRoutine = {
  name: string;
  exercises: SeedExercise[];
};

type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string | null;
};

type RoutineRow = {
  id: string;
  name: string;
};

type WorkoutRow = {
  id: string;
  routine_id: string;
  start_time: string;
};

type RoutineExerciseLink = {
  routine_id: string;
  exercise_id: string;
  sort_order: number;
};

const workoutCount = 24;

const seedRoutines: SeedRoutine[] = [
  {
    name: "Push",
    exercises: [
      {
        name: "Bench Press",
        muscleGroup: "Chest",
        baseWeight: 115,
        progression: 5,
        targetReps: 8,
        restTimeSeconds: 120,
      },
      {
        name: "Overhead Press",
        muscleGroup: "Shoulders",
        baseWeight: 65,
        progression: 5,
        targetReps: 8,
        restTimeSeconds: 105,
      },
      {
        name: "Incline Dumbbell Press",
        muscleGroup: "Chest",
        baseWeight: 40,
        progression: 2.5,
        targetReps: 10,
        restTimeSeconds: 90,
      },
    ],
  },
  {
    name: "Pull",
    exercises: [
      {
        name: "Deadlift",
        muscleGroup: "Back",
        baseWeight: 185,
        progression: 10,
        targetReps: 5,
        restTimeSeconds: 180,
      },
      {
        name: "Barbell Row",
        muscleGroup: "Back",
        baseWeight: 95,
        progression: 5,
        targetReps: 8,
        restTimeSeconds: 105,
      },
      {
        name: "Lat Pulldown",
        muscleGroup: "Back",
        baseWeight: 85,
        progression: 5,
        targetReps: 10,
        restTimeSeconds: 90,
      },
    ],
  },
  {
    name: "Legs",
    exercises: [
      {
        name: "Squat",
        muscleGroup: "Quads",
        baseWeight: 145,
        progression: 10,
        targetReps: 6,
        restTimeSeconds: 150,
      },
      {
        name: "Romanian Deadlift",
        muscleGroup: "Hamstrings",
        baseWeight: 125,
        progression: 10,
        targetReps: 8,
        restTimeSeconds: 120,
      },
      {
        name: "Leg Press",
        muscleGroup: "Quads",
        baseWeight: 220,
        progression: 10,
        targetReps: 10,
        restTimeSeconds: 105,
      },
    ],
  },
];

function getMapKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function roundToNearestHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function getWorkoutKey(routineId: string, startTime: string | Date) {
  const timestamp =
    startTime instanceof Date
      ? startTime.getTime()
      : new Date(startTime).getTime();

  return `${routineId}:${timestamp}`;
}

function getWorkoutStart(index: number) {
  const now = new Date();
  const daysAgo =
    59 - Math.round((index * 58) / (workoutCount - 1));
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
  const trainingHours = [11, 17, 20, 14, 18, 12];

  start.setUTCDate(start.getUTCDate() - daysAgo);
  start.setUTCHours(
    trainingHours[index % trainingHours.length],
    index % 2 === 0 ? 10 : 40,
    0,
    0,
  );

  return start;
}

function errorResponse(stage: string, message: string) {
  console.error(`Analytics seed failed during ${stage}:`, message);

  return NextResponse.json(
    {
      error: `Unable to generate analytics data during ${stage}.`,
      detail: message,
    },
    { status: 500 },
  );
}

export async function POST() {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    return NextResponse.json(
      { error: "You must be signed in to generate test data." },
      { status: 401 },
    );
  }

  try {
    const exerciseSeeds = seedRoutines.flatMap(
      (routine) => routine.exercises,
    );
    const exerciseNames = exerciseSeeds.map(
      (exercise) => exercise.name,
    );
    const { data: existingExerciseData, error: exerciseLookupError } =
      await supabase
        .from("exercises")
        .select("id, name, muscle_group")
        .in("name", exerciseNames);

    if (exerciseLookupError) {
      return errorResponse(
        "exercise lookup",
        exerciseLookupError.message,
      );
    }

    const exerciseByName = new Map(
      ((existingExerciseData ?? []) as ExerciseRow[]).map((exercise) => [
        getMapKey(exercise.name),
        exercise,
      ]),
    );
    const missingExercises = exerciseSeeds.filter(
      (exercise) => !exerciseByName.has(getMapKey(exercise.name)),
    );

    if (missingExercises.length > 0) {
      const { data: insertedExercises, error: exerciseInsertError } =
        await supabase
          .from("exercises")
          .insert(
            missingExercises.map((exercise) => ({
              name: exercise.name,
              muscle_group: exercise.muscleGroup,
            })),
          )
          .select("id, name, muscle_group");

      if (exerciseInsertError) {
        return errorResponse(
          "exercise creation",
          exerciseInsertError.message,
        );
      }

      for (const exercise of (insertedExercises ?? []) as ExerciseRow[]) {
        exerciseByName.set(getMapKey(exercise.name), exercise);
      }
    }

    const routineNames = seedRoutines.map((routine) => routine.name);
    const { data: existingRoutineData, error: routineLookupError } =
      await supabase
        .from("routines")
        .select("id, name")
        .in("name", routineNames);

    if (routineLookupError) {
      return errorResponse(
        "routine lookup",
        routineLookupError.message,
      );
    }

    const routineByName = new Map(
      ((existingRoutineData ?? []) as RoutineRow[]).map((routine) => [
        getMapKey(routine.name),
        routine,
      ]),
    );
    const missingRoutines = seedRoutines.filter(
      (routine) => !routineByName.has(getMapKey(routine.name)),
    );

    if (missingRoutines.length > 0) {
      const { data: insertedRoutines, error: routineInsertError } =
        await supabase
          .from("routines")
          .insert(
            missingRoutines.map((routine) => ({
              name: routine.name,
            })),
          )
          .select("id, name");

      if (routineInsertError) {
        return errorResponse(
          "routine creation",
          routineInsertError.message,
        );
      }

      for (const routine of (insertedRoutines ?? []) as RoutineRow[]) {
        routineByName.set(getMapKey(routine.name), routine);
      }
    }

    const routineIds = [...routineByName.values()].map(
      (routine) => routine.id,
    );
    const { data: existingLinks, error: linkLookupError } =
      await supabase
        .from("routine_exercises")
        .select("routine_id, exercise_id, sort_order")
        .in("routine_id", routineIds);

    if (linkLookupError) {
      return errorResponse(
        "routine exercise lookup",
        linkLookupError.message,
      );
    }

    const routineExerciseLinks =
      (existingLinks ?? []) as RoutineExerciseLink[];
    const existingLinkKeys = new Set(
      routineExerciseLinks.map(
        (link) => `${link.routine_id}:${link.exercise_id}`,
      ),
    );
    const nextSortOrderByRoutine = new Map<string, number>();

    for (const link of routineExerciseLinks) {
      nextSortOrderByRoutine.set(
        link.routine_id,
        Math.max(
          nextSortOrderByRoutine.get(link.routine_id) ?? 0,
          link.sort_order + 1,
        ),
      );
    }

    const missingLinks = seedRoutines.flatMap((routineSeed) => {
      const routine = routineByName.get(getMapKey(routineSeed.name));

      if (!routine) {
        return [];
      }

      return routineSeed.exercises.flatMap((exerciseSeed, index) => {
        const exercise = exerciseByName.get(
          getMapKey(exerciseSeed.name),
        );

        if (
          !exercise ||
          existingLinkKeys.has(`${routine.id}:${exercise.id}`)
        ) {
          return [];
        }

        const sortOrder =
          nextSortOrderByRoutine.get(routine.id) ?? index;
        nextSortOrderByRoutine.set(routine.id, sortOrder + 1);

        return [
          {
            routine_id: routine.id,
            exercise_id: exercise.id,
            target_sets: index === 0 ? 4 : 3,
            target_reps: exerciseSeed.targetReps,
            rest_time_seconds: exerciseSeed.restTimeSeconds,
            sort_order: sortOrder,
          },
        ];
      });
    });

    if (missingLinks.length > 0) {
      const { error: linkInsertError } = await supabase
        .from("routine_exercises")
        .insert(missingLinks);

      if (linkInsertError) {
        return errorResponse(
          "routine exercise creation",
          linkInsertError.message,
        );
      }
    }

    const workoutPlans = Array.from(
      { length: workoutCount },
      (_, index) => {
        const routineSeed =
          seedRoutines[index % seedRoutines.length];
        const routine = routineByName.get(getMapKey(routineSeed.name));

        if (!routine) {
          throw new Error(
            `The ${routineSeed.name} routine could not be prepared.`,
          );
        }

        const start = getWorkoutStart(index);
        const end = new Date(
          start.getTime() + (52 + (index % 5) * 6) * 60_000,
        );

        return {
          index,
          routine,
          routineSeed,
          start,
          end,
        };
      },
    );
    const { data: insertedWorkoutData, error: workoutInsertError } =
      await supabase
        .from("workouts")
        .insert(
          workoutPlans.map((plan) => ({
            routine_id: plan.routine.id,
            start_time: plan.start.toISOString(),
            end_time: plan.end.toISOString(),
          })),
        )
        .select("id, routine_id, start_time");

    if (workoutInsertError || !insertedWorkoutData) {
      return errorResponse(
        "workout creation",
        workoutInsertError?.message ??
          "Supabase did not return the generated workouts.",
      );
    }

    const insertedWorkouts = insertedWorkoutData as WorkoutRow[];
    const workoutByStart = new Map(
      insertedWorkouts.map((workout) => [
        getWorkoutKey(workout.routine_id, workout.start_time),
        workout,
      ]),
    );
    const workoutSets = workoutPlans.flatMap((plan) => {
      const workout = workoutByStart.get(
        getWorkoutKey(plan.routine.id, plan.start),
      );

      if (!workout) {
        return [];
      }

      const progressionSession = Math.floor(
        plan.index / seedRoutines.length,
      );

      return plan.routineSeed.exercises.flatMap(
        (exerciseSeed, exerciseIndex) => {
          const exercise = exerciseByName.get(
            getMapKey(exerciseSeed.name),
          );

          if (!exercise) {
            return [];
          }

          const setCount =
            3 + ((plan.index + exerciseIndex) % 2);
          const topWeight =
            exerciseSeed.baseWeight +
            progressionSession * exerciseSeed.progression;
          const backoff =
            exerciseSeed.baseWeight >= 80 ? 5 : 2.5;

          return Array.from({ length: setCount }, (_, setIndex) => {
            const createdAt = new Date(
              plan.start.getTime() +
                (8 + exerciseIndex * 15 + setIndex * 3) * 60_000,
            );

            return {
              workout_id: workout.id,
              exercise_id: exercise.id,
              set_number: setIndex + 1,
              weight_lbs: roundToNearestHalf(
                Math.max(5, topWeight - setIndex * backoff),
              ),
              reps:
                exerciseSeed.targetReps +
                (setIndex === setCount - 1 ? 2 : setIndex % 2),
              created_at: createdAt.toISOString(),
            };
          });
        },
      );
    });

    if (workoutSets.length === 0) {
      await supabase
        .from("workouts")
        .delete()
        .in(
          "id",
          insertedWorkouts.map((workout) => workout.id),
        );

      return errorResponse(
        "set preparation",
        "No workout sets could be associated with the generated workouts.",
      );
    }

    const { error: workoutSetInsertError } = await supabase
      .from("workout_sets")
      .insert(workoutSets);

    if (workoutSetInsertError) {
      const { error: rollbackError } = await supabase
        .from("workouts")
        .delete()
        .in(
          "id",
          insertedWorkouts.map((workout) => workout.id),
        );

      if (rollbackError) {
        console.error(
          "Analytics seed workout rollback failed:",
          rollbackError.message,
        );
      }

      return errorResponse(
        "workout set creation",
        workoutSetInsertError.message,
      );
    }

    return NextResponse.json({
      message: `Generated ${insertedWorkouts.length} workouts and ${workoutSets.length} sets across the last 60 days.`,
      workoutsCreated: insertedWorkouts.length,
      setsCreated: workoutSets.length,
      routinesCreated: missingRoutines.length,
      exercisesCreated: missingExercises.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected seed error occurred.";

    return errorResponse("generation", message);
  }
}
