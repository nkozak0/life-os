"use client";

import {
  type ComponentType,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Award,
  Ban,
  ChartBar,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Dumbbell,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Repeat2,
  Sparkles,
  Timer,
  TimerReset,
  Trophy,
  Trash2,
  Weight,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { Exercise } from "@/lib/workouts/types";

type Workout = {
  id: string;
  routine_id: string;
  start_time: string;
  end_time: string | null;
};

type Routine = {
  id: string;
  name: string;
};

type SessionExercise = {
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  rest_time_seconds: number;
  sort_order: number;
  exercises: Exercise | Exercise[] | null;
};

type SetEntry = {
  setNumber: number;
  weight: string;
  reps: string;
  isSaving: boolean;
  isRemoving: boolean;
  isComplete: boolean;
  error: string | null;
};

type HistoricalSet = {
  exercise_id: string;
  set_number: number;
  weight_lbs: number;
  reps: number;
};

type HistoricalSetDisplay = {
  weight: number;
  reps: number;
};

type TemplateStructureItem = {
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  rest_time_seconds: number;
  sort_order: number;
};

type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  type: "actual" | "estimated";
  value: number;
  previousValue: number;
};

type WorkoutSummary = {
  endTime: string;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  personalRecords: PersonalRecord[];
};

function getExercise(
  joinedExercise: SessionExercise["exercises"],
) {
  return Array.isArray(joinedExercise)
    ? (joinedExercise[0] ?? null)
    : joinedExercise;
}

function getExerciseKey(exercise: SessionExercise) {
  return `${exercise.exercise_id}:${exercise.sort_order}`;
}

function getSetKey(exercise: SessionExercise, setNumber: number) {
  return `${getExerciseKey(exercise)}:${setNumber}`;
}

function getHistoricalSetKey(exerciseId: string, setNumber: number) {
  return `${exerciseId}:${setNumber}`;
}

function buildTemplateStructure(
  exercises: SessionExercise[],
  entries?: Record<string, SetEntry>,
) {
  return exercises.map((exercise, index) => {
    const exerciseKey = getExerciseKey(exercise);
    const targetSets = entries
      ? Object.keys(entries).filter((key) =>
          key.startsWith(`${exerciseKey}:`),
        ).length
      : exercise.target_sets;

    return {
      exercise_id: exercise.exercise_id,
      target_sets: targetSets,
      target_reps: exercise.target_reps,
      rest_time_seconds: exercise.rest_time_seconds,
      sort_order: index,
    } satisfies TemplateStructureItem;
  });
}

function structuresMatch(
  original: TemplateStructureItem[],
  current: TemplateStructureItem[],
) {
  return (
    original.length === current.length &&
    original.every((item, index) => {
      const candidate = current[index];

      return (
        candidate?.exercise_id === item.exercise_id &&
        candidate.target_sets === item.target_sets &&
        candidate.target_reps === item.target_reps &&
        candidate.rest_time_seconds === item.rest_time_seconds &&
        candidate.sort_order === item.sort_order
      );
    })
  );
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

export default function LiveWorkoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const workoutId = params.id;

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [sessionExercises, setSessionExercises] = useState<
    SessionExercise[]
  >([]);
  const [setEntries, setSetEntries] = useState<
    Record<string, SetEntry>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [openExerciseMenuKey, setOpenExerciseMenuKey] = useState<
    string | null
  >(null);
  const [exerciseNotes, setExerciseNotes] = useState<
    Record<string, string>
  >({});
  const [historicalSets, setHistoricalSets] = useState<
    Record<string, HistoricalSetDisplay>
  >({});
  const [originalTemplateStructure, setOriginalTemplateStructure] =
    useState<TemplateStructureItem[]>([]);
  const [isTemplateSyncOpen, setIsTemplateSyncOpen] =
    useState(false);
  const [templateSyncError, setTemplateSyncError] = useState<
    string | null
  >(null);
  const [workoutSummary, setWorkoutSummary] =
    useState<WorkoutSummary | null>(null);

  const currentTemplateStructure = useMemo(
    () => buildTemplateStructure(sessionExercises, setEntries),
    [sessionExercises, setEntries],
  );
  const hasTemplateChanges = useMemo(
    () =>
      !structuresMatch(
        originalTemplateStructure,
        currentTemplateStructure,
      ),
    [currentTemplateStructure, originalTemplateStructure],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSession() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const { data: workoutData, error: workoutError } =
          await supabase
            .from("workouts")
            .select("id, routine_id, start_time, end_time")
            .eq("id", workoutId)
            .abortSignal(controller.signal)
            .single();

        if (workoutError || !workoutData) {
          throw workoutError ?? new Error("Workout session not found.");
        }

        const [routineResult, exercisesResult] = await Promise.all([
          supabase
            .from("routines")
            .select("id, name")
            .eq("id", workoutData.routine_id)
            .abortSignal(controller.signal)
            .single(),
          supabase
            .from("routine_exercises")
            .select(
              `
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
              `,
            )
            .eq("routine_id", workoutData.routine_id)
            .order("sort_order", { ascending: true })
            .abortSignal(controller.signal),
        ]);

        if (routineResult.error || !routineResult.data) {
          throw (
            routineResult.error ??
            new Error("The routine for this workout was not found.")
          );
        }

        if (exercisesResult.error) {
          throw exercisesResult.error;
        }

        if (controller.signal.aborted) {
          return;
        }

        const exercises =
          (exercisesResult.data ?? []) as unknown as SessionExercise[];
        const initialSetEntries: Record<string, SetEntry> = {};
        const historicalSetEntries: Record<
          string,
          HistoricalSetDisplay
        > = {};

        for (const exercise of exercises) {
          for (
            let setNumber = 1;
            setNumber <= exercise.target_sets;
            setNumber += 1
          ) {
            initialSetEntries[getSetKey(exercise, setNumber)] = {
              setNumber,
              weight: "",
              reps: String(exercise.target_reps),
              isSaving: false,
              isRemoving: false,
              isComplete: false,
              error: null,
            };
          }
        }

        const exerciseIds = [
          ...new Set(
            exercises.map((exercise) => exercise.exercise_id),
          ),
        ];

        if (exerciseIds.length > 0) {
          const { data: historyData, error: historyError } =
            await supabase
              .from("workout_sets")
              .select(
                "exercise_id, set_number, weight_lbs, reps, created_at",
              )
              .in("exercise_id", exerciseIds)
              .neq("workout_id", workoutId)
              .order("created_at", { ascending: false })
              .limit(250)
              .abortSignal(controller.signal);

          if (historyError) {
            console.warn(
              "Previous workout set lookup failed:",
              historyError,
            );
          } else {
            for (const row of (historyData ?? []) as HistoricalSet[]) {
              const historyKey = getHistoricalSetKey(
                row.exercise_id,
                row.set_number,
              );

              if (!historicalSetEntries[historyKey]) {
                historicalSetEntries[historyKey] = {
                  weight: row.weight_lbs,
                  reps: row.reps,
                };
              }
            }
          }
        }

        setWorkout(workoutData as Workout);
        setRoutine(routineResult.data as Routine);
        setSessionExercises(exercises);
        setSetEntries(initialSetEntries);
        setHistoricalSets(historicalSetEntries);
        setOriginalTemplateStructure(
          buildTemplateStructure(exercises),
        );
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }

        console.error("Unable to load workout session:", error);
        setLoadError(
          getErrorMessage(error, "Unable to load this workout."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchSession();

    return () => controller.abort();
  }, [supabase, workoutId]);

  useEffect(() => {
    if (!workout?.start_time) {
      return;
    }

    const updateElapsedTime = () => {
      const startTime = new Date(workout.start_time).getTime();
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startTime) / 1000)),
      );
    };

    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 1000);

    return () => window.clearInterval(intervalId);
  }, [workout?.start_time]);

  useEffect(() => {
    if (restSeconds === null) {
      return;
    }

    if (restSeconds <= 0) {
      const clearId = window.setTimeout(
        () => setRestSeconds(null),
        1000,
      );
      return () => window.clearTimeout(clearId);
    }

    const intervalId = window.setInterval(() => {
      setRestSeconds((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [restSeconds]);

  useEffect(() => {
    if (!openExerciseMenuKey) {
      return;
    }

    const closeMenu = () => setOpenExerciseMenuKey(null);
    window.addEventListener("pointerdown", closeMenu);

    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [openExerciseMenuKey]);

  const updateSetEntry = (
    setKey: string,
    field: "weight" | "reps",
    value: string,
  ) => {
    setSetEntries((current) => ({
      ...current,
      [setKey]: {
        ...current[setKey],
        [field]: value,
        error: null,
      },
    }));
  };

  const addSet = (exercise: SessionExercise) => {
    const exerciseKey = getExerciseKey(exercise);
    const exerciseEntries = Object.entries(setEntries)
      .filter(([key]) => key.startsWith(`${exerciseKey}:`))
      .map(([, entry]) => entry);
    const nextSetNumber =
      Math.max(
        0,
        ...exerciseEntries.map((entry) => entry.setNumber),
      ) + 1;
    const setKey = getSetKey(exercise, nextSetNumber);

    setSetEntries((current) => ({
      ...current,
      [setKey]: {
        setNumber: nextSetNumber,
        weight: "",
        reps: String(exercise.target_reps),
        isSaving: false,
        isRemoving: false,
        isComplete: false,
        error: null,
      },
    }));
  };

  const removeSet = async (
    exercise: SessionExercise,
    setKey: string,
  ) => {
    const entry = setEntries[setKey];

    if (!entry || entry.isSaving || entry.isRemoving) {
      return;
    }

    if (entry.isComplete) {
      setSetEntries((current) => ({
        ...current,
        [setKey]: {
          ...current[setKey],
          isRemoving: true,
          error: null,
        },
      }));

      const { error } = await supabase
        .from("workout_sets")
        .delete()
        .eq("workout_id", workoutId)
        .eq("exercise_id", exercise.exercise_id)
        .eq("set_number", entry.setNumber);

      if (error) {
        console.error("Supabase workout set delete failed:", error);
        setSetEntries((current) => ({
          ...current,
          [setKey]: {
            ...current[setKey],
            isRemoving: false,
            error: error.message,
          },
        }));
        return;
      }
    }

    setSetEntries((current) => {
      const nextEntries = { ...current };
      delete nextEntries[setKey];
      return nextEntries;
    });
  };

  const removeExercise = (exercise: SessionExercise) => {
    const exerciseKey = getExerciseKey(exercise);
    const name = getExercise(exercise.exercises)?.name ?? "this exercise";
    const confirmed = window.confirm(
      `Remove ${name} from this session? Logged sets will remain in your history.`,
    );

    if (!confirmed) {
      return;
    }

    setSessionExercises((current) =>
      current.filter(
        (item) => getExerciseKey(item) !== exerciseKey,
      ),
    );
    setSetEntries((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${exerciseKey}:`),
        ),
      ),
    );
    setOpenExerciseMenuKey(null);
  };

  const addExerciseNote = (exercise: SessionExercise) => {
    const exerciseKey = getExerciseKey(exercise);
    const currentNote = exerciseNotes[exerciseKey] ?? "";
    const note = window.prompt("Exercise note", currentNote);

    if (note !== null) {
      setExerciseNotes((current) => ({
        ...current,
        [exerciseKey]: note.trim(),
      }));
    }

    setOpenExerciseMenuKey(null);
  };

  const updateExerciseRest = (exercise: SessionExercise) => {
    const value = window.prompt(
      "Rest time in seconds",
      String(exercise.rest_time_seconds),
    );

    if (value === null) {
      return;
    }

    const seconds = Number.parseInt(value, 10);

    if (!Number.isInteger(seconds) || seconds < 0) {
      window.alert("Enter a valid rest time of zero seconds or more.");
      return;
    }

    const exerciseKey = getExerciseKey(exercise);
    setSessionExercises((current) =>
      current.map((item) =>
        getExerciseKey(item) === exerciseKey
          ? { ...item, rest_time_seconds: seconds }
          : item,
      ),
    );
    setOpenExerciseMenuKey(null);
  };

  const replaceExercise = (exercise: SessionExercise) => {
    const currentExercise = getExercise(exercise.exercises);
    const replacementName = window.prompt(
      "Replacement exercise name",
      currentExercise?.name ?? "",
    );

    if (!replacementName?.trim()) {
      return;
    }

    const exerciseKey = getExerciseKey(exercise);
    setSessionExercises((current) =>
      current.map((item) =>
        getExerciseKey(item) === exerciseKey
          ? {
              ...item,
              exercises: {
                id: currentExercise?.id ?? item.exercise_id,
                name: replacementName.trim(),
                muscle_group:
                  currentExercise?.muscle_group ?? "Other",
              },
            }
          : item,
      ),
    );
    console.log("Replace exercise stub:", {
      exerciseId: exercise.exercise_id,
      replacementName: replacementName.trim(),
    });
    setOpenExerciseMenuKey(null);
  };

  const logSet = async (
    exercise: SessionExercise,
    setNumber: number,
  ) => {
    const setKey = getSetKey(exercise, setNumber);
    const entry = setEntries[setKey];

    if (
      !entry ||
      entry.isSaving ||
      entry.isRemoving ||
      entry.isComplete
    ) {
      return;
    }

    const weight = Number.parseFloat(entry.weight);
    const reps = Number.parseInt(entry.reps, 10);

    if (!Number.isFinite(weight) || weight < 0) {
      setSetEntries((current) => ({
        ...current,
        [setKey]: {
          ...current[setKey],
          error: "Enter a valid weight.",
        },
      }));
      return;
    }

    if (!Number.isInteger(reps) || reps < 1) {
      setSetEntries((current) => ({
        ...current,
        [setKey]: {
          ...current[setKey],
          error: "Enter at least one rep.",
        },
      }));
      return;
    }

    setSetEntries((current) => ({
      ...current,
      [setKey]: {
        ...current[setKey],
        isSaving: true,
        error: null,
      },
    }));

    const { error } = await supabase.from("workout_sets").insert({
      workout_id: workoutId,
      exercise_id: exercise.exercise_id,
      set_number: setNumber,
      weight_lbs: weight,
      reps,
    });

    if (error) {
      console.error("Supabase workout_sets insert failed:", error);
      setSetEntries((current) => ({
        ...current,
        [setKey]: {
          ...current[setKey],
          isSaving: false,
          error: error.message,
        },
      }));
      return;
    }

    setSetEntries((current) => ({
      ...current,
      [setKey]: {
        ...current[setKey],
        isSaving: false,
        isComplete: true,
        error: null,
      },
    }));
    setRestSeconds(exercise.rest_time_seconds);
  };

  const requestWorkoutSummary = async () => {
    const response = await fetch(
      `/api/workouts/${workoutId}/complete`,
      {
        method: "POST",
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      summary?: WorkoutSummary;
      error?: string;
      detail?: string;
      code?: string;
    };

    if (!response.ok || !result.summary) {
      throw new Error(
        result.detail ??
          result.error ??
          "Unable to finish this workout.",
      );
    }

    return result.summary;
  };

  const completeWorkout = async ({
    updateTemplate,
    showErrorsInDialog,
  }: {
    updateTemplate: boolean;
    showErrorsInDialog: boolean;
  }) => {
    if (!workout || isFinishing) {
      return;
    }

    setIsFinishing(true);
    setFinishError(null);
    setTemplateSyncError(null);

    try {
      if (updateTemplate) {
        if (currentTemplateStructure.length === 0) {
          throw new Error(
            "A routine template must contain at least one exercise.",
          );
        }

        const response = await fetch("/api/routines", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            routineId: routine?.id,
            name: routine?.name,
            exercises: currentTemplateStructure.map((exercise) => ({
              exercise_id: exercise.exercise_id,
              target_sets: exercise.target_sets,
              target_reps: exercise.target_reps,
              rest_time_seconds: exercise.rest_time_seconds,
            })),
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.detail ??
              result.error ??
              "Unable to update the routine template.",
          );
        }

        setOriginalTemplateStructure(currentTemplateStructure);
      }

      const summary = await requestWorkoutSummary();
      setWorkout((current) =>
        current
          ? {
              ...current,
              end_time: summary.endTime,
            }
          : current,
      );
      setRestSeconds(null);
      setWorkoutSummary(summary);
      setIsTemplateSyncOpen(false);
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Unable to finish this workout.",
      );

      if (showErrorsInDialog) {
        setTemplateSyncError(message);
      } else {
        setFinishError(message);
      }
    } finally {
      setIsFinishing(false);
    }
  };

  const finishWorkout = () => {
    if (!workout || isFinishing) {
      return;
    }

    if (hasTemplateChanges) {
      setTemplateSyncError(null);
      setIsTemplateSyncOpen(true);
      return;
    }

    void completeWorkout({
      updateTemplate: false,
      showErrorsInDialog: false,
    });
  };

  const cancelWorkout = async () => {
    if (!workout || isCancelling) {
      return;
    }

    const confirmed = window.confirm(
      "Cancel this workout? The session and all logged sets will be permanently deleted.",
    );

    if (!confirmed) {
      return;
    }

    setIsCancelling(true);
    setFinishError(null);

    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workout.id);

    if (error) {
      console.error("Supabase workout cancellation failed:", error);
      setFinishError(error.message);
      setIsCancelling(false);
      return;
    }

    router.push("/workouts");
    router.refresh();
  };

  if (isLoading) {
    return <WorkoutLoadingState />;
  }

  if (loadError || !workout || !routine) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-950 px-5 text-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-red-400/20 bg-white/5 p-7 text-center shadow-2xl backdrop-blur-xl"
        >
          <CircleAlert className="mx-auto h-8 w-8 text-red-300" />
          <h1 className="mt-4 text-xl font-semibold">
            Session unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/50">
            {loadError ?? "This workout could not be found."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/workouts")}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workouts
          </button>
        </motion.div>
      </main>
    );
  }

  if (workoutSummary) {
    return (
      <PostWorkoutSummary
        routineName={routine.name}
        summary={workoutSummary}
        onDone={() => {
          router.push("/workouts");
          router.refresh();
        }}
      />
    );
  }

  const completedSets = Object.values(setEntries).filter(
    (entry) => entry.isComplete,
  ).length;
  const totalSets = Object.keys(setEntries).length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 pb-36 text-white sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute left-[-9rem] top-32 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8rem] top-[-6rem] h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

      <header className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-neutral-950/75 px-4 py-4 backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/workouts")}
              aria-label="Back to workouts"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-300/70">
                Live session
              </p>
              <h1 className="truncate text-base font-semibold sm:text-lg">
                {routine.name}
              </h1>
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right backdrop-blur-lg sm:px-4">
            <p className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider text-white/35">
              <Clock3 className="h-3 w-3" />
              Elapsed
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-white/90">
              {formatElapsed(elapsedSeconds)}
            </p>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {restSeconds !== null ? (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="sticky top-[89px] z-20 mx-auto mt-4 flex max-w-5xl items-center justify-between gap-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/15 px-4 py-3 shadow-[0_18px_60px_rgba(34,211,238,0.15)] backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200">
                <TimerReset className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/60">
                  Rest timer
                </p>
                <p className="text-sm font-medium text-cyan-50">
                  {restSeconds > 0 ? "Recover and reset" : "Next set"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl font-semibold tabular-nums text-cyan-50">
                {Math.floor(restSeconds / 60)}:
                {String(restSeconds % 60).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => setRestSeconds(null)}
                aria-label="Dismiss rest timer"
                className="rounded-xl p-2 text-cyan-100/50 transition hover:bg-white/10 hover:text-cyan-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative mx-auto max-w-5xl">
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm backdrop-blur-lg">
          <span className="text-white/45">
            {sessionExercises.length}{" "}
            {sessionExercises.length === 1 ? "exercise" : "exercises"}
          </span>
          <span className="flex items-center gap-2 font-medium text-white/75">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            {completedSets} / {totalSets} sets
          </span>
        </div>

        {workout.end_time ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <CircleAlert className="h-4 w-4 shrink-0" />
            This workout has already been finished. Set logging is
            disabled.
          </div>
        ) : null}

        <motion.section
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
          className="mt-5 space-y-5"
        >
          {sessionExercises.map((sessionExercise, exerciseIndex) => {
            const exercise = getExercise(sessionExercise.exercises);
            const exerciseKey = getExerciseKey(sessionExercise);
            const exerciseSetRows = Object.entries(setEntries)
              .filter(([key]) => key.startsWith(`${exerciseKey}:`))
              .sort(
                ([, first], [, second]) =>
                  first.setNumber - second.setNumber,
              );
            const exerciseNote = exerciseNotes[exerciseKey];

            return (
              <motion.article
                key={getExerciseKey(sessionExercise)}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0 },
                }}
                className={`relative rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-xl ${
                  openExerciseMenuKey === exerciseKey ? "z-20" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet-300/15 bg-violet-300/10 text-sm font-semibold text-violet-200">
                      {exerciseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-white/90">
                        {exercise?.name ?? "Unknown exercise"}
                      </h2>
                      <p className="mt-0.5 text-xs text-white/35">
                        {exerciseSetRows.length} sets ·{" "}
                        {sessionExercise.target_reps} target reps ·{" "}
                        {sessionExercise.rest_time_seconds}s rest
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative shrink-0"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={`Open controls for ${exercise?.name ?? "exercise"}`}
                      aria-haspopup="menu"
                      aria-expanded={
                        openExerciseMenuKey === exerciseKey
                      }
                      onClick={() =>
                        setOpenExerciseMenuKey((current) =>
                          current === exerciseKey ? null : exerciseKey,
                        )
                      }
                      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/45 transition hover:bg-white/10 hover:text-white"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>

                    <AnimatePresence>
                      {openExerciseMenuKey === exerciseKey ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          role="menu"
                          className="absolute right-0 top-12 z-30 w-52 rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl"
                        >
                          <ExerciseMenuButton
                            icon={MessageSquareText}
                            label="Add Note"
                            onClick={() =>
                              addExerciseNote(sessionExercise)
                            }
                          />
                          <ExerciseMenuButton
                            icon={Timer}
                            label="Update Rest Timer"
                            onClick={() =>
                              updateExerciseRest(sessionExercise)
                            }
                          />
                          <ExerciseMenuButton
                            icon={Repeat2}
                            label="Replace Exercise"
                            onClick={() =>
                              replaceExercise(sessionExercise)
                            }
                          />
                          <ExerciseMenuButton
                            icon={Trash2}
                            label="Remove Exercise"
                            danger
                            onClick={() =>
                              removeExercise(sessionExercise)
                            }
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>

                {exerciseNote ? (
                  <div className="flex items-start gap-2 border-b border-white/[0.07] bg-white/[0.025] px-5 py-3 text-xs leading-5 text-white/45">
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300/60" />
                    {exerciseNote}
                  </div>
                ) : null}

                <div className="px-3 py-3 sm:px-5 sm:py-4">
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.8fr)_5.75rem_2.75rem] gap-2 px-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-white/30 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_8rem_2.75rem]">
                    <span>Set</span>
                    <span>Weight</span>
                    <span>Reps</span>
                    <span className="text-center">Status</span>
                    <span className="sr-only">Remove</span>
                  </div>

                  <div className="space-y-2">
                    {exerciseSetRows.map(
                      ([setKey, entry], displayIndex) => {
                        const setNumber = entry.setNumber;
                        const previousSet =
                          historicalSets[
                            getHistoricalSetKey(
                              sessionExercise.exercise_id,
                              setNumber,
                            )
                          ];

                        return (
                          <div key={setKey}>
                            <div
                              className={`grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.8fr)_5.75rem_2.75rem] items-center gap-2 rounded-2xl border p-2 transition sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_8rem_2.75rem] ${
                                entry.isComplete
                                  ? "border-emerald-300/20 bg-emerald-300/[0.08]"
                                  : "border-white/[0.07] bg-black/10"
                              }`}
                            >
                              <span className="text-center text-sm font-semibold text-white/45">
                                {displayIndex + 1}
                              </span>
                              <label className="relative">
                                <Weight className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.5"
                                  value={entry.weight}
                                  onChange={(event) =>
                                    updateSetEntry(
                                      setKey,
                                      "weight",
                                      event.target.value,
                                    )
                                  }
                                  disabled={
                                    entry.isComplete ||
                                    entry.isSaving ||
                                    entry.isRemoving ||
                                    Boolean(workout.end_time)
                                  }
                                  aria-label={`${exercise?.name ?? "Exercise"} set ${setNumber} weight in pounds`}
                                  placeholder="lbs"
                                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-2 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-violet-300/40 focus:ring-4 focus:ring-violet-400/10 disabled:opacity-60"
                                />
                              </label>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                value={entry.reps}
                                onChange={(event) =>
                                  updateSetEntry(
                                    setKey,
                                    "reps",
                                    event.target.value,
                                  )
                                }
                                disabled={
                                  entry.isComplete ||
                                  entry.isSaving ||
                                  entry.isRemoving ||
                                  Boolean(workout.end_time)
                                }
                                aria-label={`${exercise?.name ?? "Exercise"} set ${setNumber} reps`}
                                placeholder={String(
                                  sessionExercise.target_reps,
                                )}
                                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-violet-300/40 focus:ring-4 focus:ring-violet-400/10 disabled:opacity-60"
                              />
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={() =>
                                  logSet(
                                    sessionExercise,
                                    setNumber,
                                  )
                                }
                                disabled={
                                  entry.isSaving ||
                                  entry.isRemoving ||
                                  entry.isComplete ||
                                  Boolean(workout.end_time)
                                }
                                aria-pressed={entry.isComplete}
                                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition disabled:cursor-default ${
                                  entry.isComplete
                                    ? "bg-emerald-300 text-emerald-950"
                                    : "border border-white/10 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-50"
                                }`}
                              >
                                {entry.isSaving ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                {entry.isComplete ? "Done" : "Complete"}
                              </motion.button>
                              <button
                                type="button"
                                onClick={() =>
                                  void removeSet(
                                    sessionExercise,
                                    setKey,
                                  )
                                }
                                disabled={
                                  entry.isSaving ||
                                  entry.isRemoving ||
                                  Boolean(workout.end_time)
                                }
                                aria-label={`Remove set ${displayIndex + 1} from ${exercise?.name ?? "exercise"}`}
                                className="grid h-11 w-11 place-items-center rounded-xl text-white/30 transition hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {entry.isRemoving ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <X className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            {previousSet ? (
                              <p className="mt-1.5 px-3 text-[11px] text-white/30">
                                Prev: {previousSet.weight}lbs ×{" "}
                                {previousSet.reps}
                              </p>
                            ) : null}
                            {entry.error ? (
                              <p
                                role="alert"
                                className="mt-1.5 px-3 text-xs text-red-300"
                              >
                                {entry.error}
                              </p>
                            ) : null}
                          </div>
                        );
                      },
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => addSet(sessionExercise)}
                    disabled={Boolean(workout.end_time)}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] text-sm font-medium text-white/45 transition hover:border-violet-300/20 hover:bg-violet-300/[0.06] hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                    Add Set
                  </button>
                </div>
              </motion.article>
            );
          })}
        </motion.section>

        {sessionExercises.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-16 text-center backdrop-blur-lg">
            <Dumbbell className="mx-auto h-7 w-7 text-white/25" />
            <h2 className="mt-4 font-semibold">
              No exercises in this routine
            </h2>
            <p className="mt-2 text-sm text-white/40">
              Finish this session and add exercises to the template.
            </p>
          </div>
        ) : null}

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-xl">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-300/10 text-violet-200">
            <Trophy className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-semibold">
            Ready to wrap up?
          </h2>
          <p className="mt-1 text-sm text-white/40">
            Finish the workout when your final set is complete.
          </p>

          {finishError ? (
            <p
              role="alert"
              className="mx-auto mt-4 max-w-lg rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
            >
              {finishError}
            </p>
          ) : null}

          <div className="mx-auto mt-5 flex max-w-xl flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={cancelWorkout}
              disabled={
                isCancelling ||
                isFinishing ||
                Boolean(workout.end_time)
              }
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-400/10 px-6 text-sm font-semibold text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-48"
            >
              {isCancelling ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              {isCancelling ? "Cancelling…" : "Cancel Workout"}
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={finishWorkout}
              disabled={
                isFinishing ||
                isCancelling ||
                Boolean(workout.end_time)
              }
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-6 text-sm font-semibold text-neutral-950 shadow-[0_12px_40px_rgba(167,139,250,0.2)] transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-56"
            >
              {isFinishing ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Finishing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Finish Workout
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isTemplateSyncOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-end bg-black/75 p-3 backdrop-blur-md sm:place-items-center sm:p-6"
          >
            <motion.button
              type="button"
              aria-label="Close template update dialog"
              className="absolute inset-0 cursor-default"
              onClick={() => {
                if (!isFinishing) {
                  setIsTemplateSyncOpen(false);
                }
              }}
            />
            <motion.section
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="template-sync-title"
              className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900/95 p-6 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
                  <Repeat2 className="h-5 w-5" />
                </span>
                <button
                  type="button"
                  aria-label="Close template update dialog"
                  disabled={isFinishing}
                  onClick={() => setIsTemplateSyncOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl text-white/35 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <h2
                id="template-sync-title"
                className="mt-5 text-xl font-semibold tracking-tight"
              >
                You made changes to this routine.
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Do you want to update the original template, or just
                save this for today?
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                    Session structure
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/80">
                    {currentTemplateStructure.length}{" "}
                    {currentTemplateStructure.length === 1
                      ? "exercise"
                      : "exercises"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                    Set rows
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/80">
                    {currentTemplateStructure.reduce(
                      (total, exercise) =>
                        total + exercise.target_sets,
                      0,
                    )}{" "}
                    sets
                  </p>
                </div>
              </div>

              {currentTemplateStructure.length === 0 ? (
                <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  An empty structure can be saved for today, but it
                  cannot replace the original template.
                </p>
              ) : null}

              {templateSyncError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
                >
                  {templateSyncError}
                </p>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isFinishing}
                  onClick={() =>
                    void completeWorkout({
                      updateTemplate: false,
                      showErrorsInDialog: true,
                    })
                  }
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
                >
                  {isFinishing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save as One-Off
                </button>
                <button
                  type="button"
                  disabled={
                    isFinishing ||
                    currentTemplateStructure.length === 0
                  }
                  onClick={() =>
                    void completeWorkout({
                      updateTemplate: true,
                      showErrorsInDialog: true,
                    })
                  }
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isFinishing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Repeat2 className="h-4 w-4" />
                  )}
                  Update Template
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function PostWorkoutSummary({
  routineName,
  summary,
  onDone,
}: {
  routineName: string;
  summary: WorkoutSummary;
  onDone: () => void;
}) {
  const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-8rem] h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mx-auto max-w-3xl"
      >
        <header className="text-center">
          <motion.span
            initial={{ scale: 0.75, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-violet-300/25 bg-violet-300/15 text-violet-200 shadow-[0_18px_60px_rgba(167,139,250,0.2)]"
          >
            <Trophy className="h-7 w-7" />
          </motion.span>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 backdrop-blur-lg">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            Session complete
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Post-Workout Summary
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {routineName} is in the books.
          </p>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Duration",
              value: formatElapsed(summary.durationSeconds),
              icon: Clock3,
              color: "text-cyan-300",
            },
            {
              label: "Total volume",
              value: `${numberFormatter.format(summary.totalVolume)} lb`,
              icon: ChartBar,
              color: "text-violet-300",
            },
            {
              label: "Logged sets",
              value: numberFormatter.format(summary.completedSets),
              icon: CheckCircle2,
              color: "text-emerald-300",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <article
              key={label}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5">
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </span>
              <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.15em] text-white/30">
                {label}
              </p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-white/90">
                {value}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-amber-300/60">
                Personal records
              </p>
              <h2 className="mt-1.5 text-lg font-semibold">
                Session highlights
              </h2>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
              <Award className="h-5 w-5" />
            </span>
          </div>

          {summary.personalRecords.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {summary.personalRecords.map((record) => (
                <motion.article
                  key={`${record.exerciseId}:${record.type}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.07] p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-100/60">
                    <Award className="h-3.5 w-3.5" />
                    {record.type === "actual"
                      ? "New Actual PR"
                      : "New Estimated 1RM"}
                  </div>
                  <p className="mt-2 font-medium text-white/90">
                    {record.exerciseName}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-amber-100">
                    {numberFormatter.format(record.value)} lb
                  </p>
                  <p className="mt-1 text-xs text-white/30">
                    {record.previousValue > 0
                      ? `Previous: ${numberFormatter.format(record.previousValue)} lb`
                      : "First recorded benchmark"}
                  </p>
                </motion.article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-8 text-center">
              <Award className="mx-auto h-6 w-6 text-white/20" />
              <p className="mt-3 text-sm text-white/40">
                No new PRs today. Consistency still compounds.
              </p>
            </div>
          )}
        </section>

        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onDone}
          className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-6 text-sm font-semibold text-neutral-950 shadow-[0_16px_50px_rgba(167,139,250,0.22)] transition hover:bg-violet-300"
        >
          Done
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </motion.div>
    </main>
  );
}

type ExerciseMenuButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

function ExerciseMenuButton({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: ExerciseMenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition ${
        danger
          ? "text-red-300 hover:bg-red-400/10"
          : "text-white/65 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function WorkoutLoadingState() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/5" />
            <div>
              <div className="h-3 w-20 rounded-full bg-white/5" />
              <div className="mt-2 h-5 w-40 rounded-full bg-white/10" />
            </div>
          </div>
          <div className="h-14 w-28 rounded-2xl bg-white/5" />
        </div>
        <div className="mt-8 h-12 rounded-2xl bg-white/5" />
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="h-6 w-44 rounded-full bg-white/10" />
            <div className="mt-6 space-y-3">
              <div className="h-14 rounded-2xl bg-white/5" />
              <div className="h-14 rounded-2xl bg-white/5" />
              <div className="h-14 rounded-2xl bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
