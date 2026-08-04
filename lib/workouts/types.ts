export type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
};

export type RoutineExercise = {
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  rest_time_seconds: number;
  sort_order: number;
  exercises: Exercise | Exercise[] | null;
};

export type Routine = {
  id: string;
  name: string;
  routine_exercises: RoutineExercise[];
};

export const ROUTINE_SELECT = `
  id,
  name,
  routine_exercises (
    exercise_id,
    target_sets,
    target_reps,
    rest_time_seconds,
    sort_order,
    exercises (
      id,
      name,
      muscle_group
    )
  )
`;

export function getJoinedExercise(
  joinedExercise: RoutineExercise["exercises"],
) {
  return Array.isArray(joinedExercise)
    ? (joinedExercise[0] ?? null)
    : joinedExercise;
}
