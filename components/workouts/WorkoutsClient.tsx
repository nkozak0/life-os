"use client";

import {
  type ComponentType,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Dumbbell,
  Edit,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Play,
  Search,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  getJoinedExercise,
  type Exercise,
  type Routine,
} from "@/lib/workouts/types";

type WorkoutsClientProps = {
  initialExercises: Exercise[];
  initialRoutines: Routine[];
  initialError: string | null;
};

type BuilderExercise = {
  exercise: Exercise;
  target_sets: number | "";
  target_reps: number | "";
  rest_time_seconds: number | "";
};

const defaultBuilderValues = {
  target_sets: 3,
  target_reps: 10,
  rest_time_seconds: 90,
};

function parseIntegerWithFallback(
  value: number | "",
  fallback: number,
) {
  if (value === "" || !Number.isFinite(value)) {
    return fallback;
  }

  return Number.parseInt(String(value), 10);
}

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function WorkoutsClient({
  initialExercises,
  initialRoutines,
  initialError,
}: WorkoutsClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [exercises, setExercises] = useState(initialExercises);
  const [routines, setRoutines] = useState(initialRoutines);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [builderExercises, setBuilderExercises] = useState<
    BuilderExercise[]
  >([]);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [defaultRestSeconds, setDefaultRestSeconds] =
    useState(90);
  const [startingRoutineId, setStartingRoutineId] = useState<
    string | null
  >(null);
  const [editingRoutineId, setEditingRoutineId] = useState<
    string | null
  >(null);
  const [openRoutineMenuId, setOpenRoutineMenuId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/settings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as {
          settings?: {
            default_rest_seconds?: number;
          };
        };
      })
      .then((payload) => {
        const seconds = payload?.settings?.default_rest_seconds;

        if (
          !controller.signal.aborted &&
          Number.isInteger(seconds) &&
          seconds !== undefined &&
          seconds >= 15 &&
          seconds <= 900
        ) {
          setDefaultRestSeconds(seconds);
        }
      })
      .catch((settingsError) => {
        if (
          !(
            settingsError instanceof DOMException &&
            settingsError.name === "AbortError"
          )
        ) {
          console.error(
            "Default rest timer lookup failed:",
            settingsError,
          );
        }
      });

    return () => {
      controller.abort();
    };
  }, []);
  const [routineActionId, setRoutineActionId] = useState<
    string | null
  >(null);
  const [routineActionError, setRoutineActionError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !isSaving &&
        !isCreatingExercise
      ) {
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreatingExercise, isModalOpen, isSaving]);

  useEffect(() => {
    if (!openRoutineMenuId) {
      return;
    }

    const closeMenu = () => setOpenRoutineMenuId(null);
    window.addEventListener("pointerdown", closeMenu);

    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [openRoutineMenuId]);

  const selectedExerciseIds = useMemo(
    () =>
      new Set(
        builderExercises.map(({ exercise }) => exercise.id),
      ),
    [builderExercises],
  );

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const exactMatch = exercises.find(
    (exercise) =>
      exercise.name.trim().toLocaleLowerCase() === normalizedQuery,
  );
  const matchingExercises = exercises
    .filter(
      (exercise) =>
        !selectedExerciseIds.has(exercise.id) &&
        exercise.name.toLocaleLowerCase().includes(normalizedQuery),
    )
    .slice(0, 8);
  const canCreateExercise =
    normalizedQuery.length > 0 && !exactMatch;

  const resetForm = () => {
    setEditingRoutineId(null);
    setRoutineName("");
    setSearchQuery("");
    setIsSelectorOpen(false);
    setBuilderExercises([]);
    setFormError(null);
  };

  const closeModal = () => {
    if (isSaving || isCreatingExercise) {
      return;
    }

    setIsModalOpen(false);
    resetForm();
  };

  const addExerciseToBuilder = (exercise: Exercise) => {
    setBuilderExercises((current) => {
      if (current.some((item) => item.exercise.id === exercise.id)) {
        return current;
      }

      return [
        ...current,
        {
          exercise,
          ...defaultBuilderValues,
          rest_time_seconds: defaultRestSeconds,
        },
      ];
    });
    setSearchQuery("");
    setIsSelectorOpen(false);
    setFormError(null);
  };

  const createExercise = async () => {
    const name = searchQuery.trim();

    if (!name || isCreatingExercise) {
      return;
    }

    const existingExercise = exercises.find(
      (exercise) =>
        exercise.name.trim().toLocaleLowerCase() ===
        name.toLocaleLowerCase(),
    );

    if (existingExercise) {
      addExerciseToBuilder(existingExercise);
      return;
    }

    setIsCreatingExercise(true);
    setFormError(null);

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        name,
        muscle_group: "Other",
      })
      .select("id, name, muscle_group")
      .single();

    if (error || !data) {
      setFormError(
        error?.message ?? "Unable to create that exercise.",
      );
      setIsCreatingExercise(false);
      return;
    }

    const newExercise = data as Exercise;
    setExercises((current) =>
      sortExercises([...current, newExercise]),
    );
    addExerciseToBuilder(newExercise);
    setIsCreatingExercise(false);
  };

  const updateBuilderExercise = (
    exerciseId: string,
    field:
      | "target_sets"
      | "target_reps"
      | "rest_time_seconds",
    value: number | "",
  ) => {
    setBuilderExercises((current) =>
      current.map((item) =>
        item.exercise.id === exerciseId
          ? { ...item, [field]: value }
          : item,
      ),
    );
  };

  const removeBuilderExercise = (exerciseId: string) => {
    setBuilderExercises((current) =>
      current.filter((item) => item.exercise.id !== exerciseId),
    );
  };

  const saveRoutine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = routineName.trim();
    const normalizedBuilderExercises = builderExercises.map(
      (item) => ({
        exercise_id: item.exercise.id,
        target_sets: parseIntegerWithFallback(item.target_sets, 3),
        target_reps: parseIntegerWithFallback(item.target_reps, 10),
        rest_time_seconds: parseIntegerWithFallback(
          item.rest_time_seconds,
          90,
        ),
      }),
    );
    const hasInvalidValues = normalizedBuilderExercises.some(
      (item) =>
        !Number.isInteger(item.target_sets) ||
        item.target_sets < 1 ||
        !Number.isInteger(item.target_reps) ||
        item.target_reps < 1 ||
        !Number.isInteger(item.rest_time_seconds) ||
        item.rest_time_seconds < 0,
    );

    if (!name) {
      setFormError("Give your routine a name.");
      return;
    }

    if (builderExercises.length === 0) {
      setFormError("Add at least one exercise to the routine.");
      return;
    }

    if (hasInvalidValues) {
      setFormError(
        "Sets and reps must be at least 1, and rest cannot be negative.",
      );
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const response = await fetch("/api/routines", {
        method: editingRoutineId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          routineId: editingRoutineId,
          name,
          exercises: normalizedBuilderExercises,
        }),
      });
      const result = (await response.json()) as {
        routine?: Routine;
        error?: string;
        detail?: string;
        warning?: string;
      };

      if (!response.ok || !result.routine) {
        const errorMessage =
          result.detail ??
          result.error ??
          "Unable to save the routine.";
        console.error("Routine save failed:", errorMessage);
        throw new Error(errorMessage);
      }

      setRoutines((current) =>
        editingRoutineId
          ? current.map((routine) =>
              routine.id === editingRoutineId
                ? result.routine!
                : routine,
            )
          : [result.routine!, ...current],
      );
      setNotice(
        result.warning ??
          (editingRoutineId
            ? `${result.routine.name} was updated.`
            : `${result.routine.name} is ready to train.`),
      );
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save the routine.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startWorkout = async (routine: Routine) => {
    if (startingRoutineId) {
      return;
    }

    setStartingRoutineId(routine.id);
    setStartError(null);
    setNotice(null);

    const { data, error } = await supabase
      .from("workouts")
      .insert({ routine_id: routine.id })
      .select("id")
      .single();

    if (error || !data) {
      const errorMessage =
        error?.message ?? "Unable to start this workout.";
      console.error("Supabase workout insert failed:", error);
      setStartError(errorMessage);
      setStartingRoutineId(null);
      return;
    }

    router.push(`/workouts/${data.id}`);
  };

  const editRoutine = (routine: Routine) => {
    const builderItems = [...routine.routine_exercises]
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((routineExercise) => {
        const exercise = getJoinedExercise(
          routineExercise.exercises,
        );

        return exercise
          ? [
              {
                exercise,
                target_sets: routineExercise.target_sets,
                target_reps: routineExercise.target_reps,
                rest_time_seconds:
                  routineExercise.rest_time_seconds,
              } satisfies BuilderExercise,
            ]
          : [];
      });

    setEditingRoutineId(routine.id);
    setRoutineName(routine.name);
    setBuilderExercises(builderItems);
    setSearchQuery("");
    setFormError(null);
    setOpenRoutineMenuId(null);
    setIsModalOpen(true);
  };

  const renameRoutine = async (routine: Routine) => {
    const nextName = window.prompt("Rename routine", routine.name)?.trim();

    if (!nextName || nextName === routine.name) {
      setOpenRoutineMenuId(null);
      return;
    }

    setRoutineActionId(routine.id);
    setRoutineActionError(null);
    setOpenRoutineMenuId(null);

    const { error } = await supabase
      .from("routines")
      .update({ name: nextName })
      .eq("id", routine.id);

    if (error) {
      console.error("Supabase routine rename failed:", error);
      setRoutineActionError(error.message);
    } else {
      setRoutines((current) =>
        current.map((item) =>
          item.id === routine.id ? { ...item, name: nextName } : item,
        ),
      );
      setNotice(`${nextName} was renamed.`);
    }

    setRoutineActionId(null);
  };

  const duplicateRoutine = async (routine: Routine) => {
    setRoutineActionId(routine.id);
    setRoutineActionError(null);
    setOpenRoutineMenuId(null);

    try {
      const duplicateBaseName = `${routine.name} Copy`;
      let duplicateName = duplicateBaseName;
      let copyNumber = 2;

      while (
        routines.some(
          (item) =>
            item.name.toLocaleLowerCase() ===
            duplicateName.toLocaleLowerCase(),
        )
      ) {
        duplicateName = `${duplicateBaseName} ${copyNumber}`;
        copyNumber += 1;
      }

      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: duplicateName,
          exercises: [...routine.routine_exercises]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((routineExercise) => ({
              exercise_id: routineExercise.exercise_id,
              target_sets: routineExercise.target_sets,
              target_reps: routineExercise.target_reps,
              rest_time_seconds:
                routineExercise.rest_time_seconds,
            })),
        }),
      });
      const result = (await response.json()) as {
        routine?: Routine;
        error?: string;
        detail?: string;
      };

      if (!response.ok || !result.routine) {
        throw new Error(
          result.detail ??
            result.error ??
            "Unable to duplicate the routine.",
        );
      }

      setRoutines((current) => [result.routine!, ...current]);
      setNotice(`${result.routine.name} was created.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to duplicate the routine.";
      console.error("Routine duplicate failed:", error);
      setRoutineActionError(message);
    } finally {
      setRoutineActionId(null);
    }
  };

  const deleteRoutine = async (routine: Routine) => {
    const confirmed = window.confirm(
      `Delete “${routine.name}” and all of its template exercises?`,
    );

    if (!confirmed) {
      setOpenRoutineMenuId(null);
      return;
    }

    setRoutineActionId(routine.id);
    setRoutineActionError(null);
    setOpenRoutineMenuId(null);

    type DeleteRoutineResult = {
      success?: boolean;
      error?: string;
      detail?: string;
      code?: string;
      hint?: string;
      requiresHistoryConfirmation?: boolean;
      workoutCount?: number;
      workoutsDeleted?: number;
    };

    const requestDeletion = async (deleteWorkoutHistory: boolean) => {
      const response = await fetch("/api/routines", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          routineId: routine.id,
          deleteWorkoutHistory,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as
        DeleteRoutineResult;

      return { response, result };
    };

    try {
      let deletion = await requestDeletion(false);

      if (
        deletion.response.status === 409 &&
        deletion.result.requiresHistoryConfirmation
      ) {
        const workoutCount = deletion.result.workoutCount ?? 0;
        const historyConfirmed = window.confirm(
          `${routine.name} has ${workoutCount} completed ${
            workoutCount === 1 ? "workout" : "workouts"
          }. Deleting this routine will also permanently delete those sessions and their logged sets. Continue?`,
        );

        if (!historyConfirmed) {
          return;
        }

        deletion = await requestDeletion(true);
      }

      if (!deletion.response.ok || !deletion.result.success) {
        const technicalDetail = [
          deletion.result.detail,
          deletion.result.code
            ? `Code: ${deletion.result.code}`
            : null,
          deletion.result.hint,
        ]
          .filter(Boolean)
          .join(" ");

        throw new Error(
          technicalDetail ||
            deletion.result.error ||
            "Unable to delete the routine.",
        );
      }

      setRoutines((current) =>
        current.filter((item) => item.id !== routine.id),
      );
      const workoutsDeleted = deletion.result.workoutsDeleted ?? 0;
      setNotice(
        workoutsDeleted > 0
          ? `${routine.name} and ${workoutsDeleted} ${
              workoutsDeleted === 1 ? "workout" : "workouts"
            } were deleted.`
          : `${routine.name} was deleted.`,
      );
      router.refresh();
    } catch (error) {
      setRoutineActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the routine.",
      );
    } finally {
      setRoutineActionId(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 pb-28 pt-8 text-white sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute left-[-10rem] top-20 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8rem] top-[-5rem] h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 backdrop-blur-lg">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              Routine templates
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Workouts
            </h1>
            <p className="mt-2 text-sm text-white/50 sm:text-base">
              Select a routine to start your session.
            </p>
          </div>

          <motion.button
            type="button"
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setNotice(null);
              resetForm();
              setIsModalOpen(true);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-[0_12px_40px_rgba(167,139,250,0.22)] transition-colors hover:bg-violet-300"
          >
            <Plus className="h-4 w-4" />
            New Routine
          </motion.button>
        </header>

        <AnimatePresence>
          {notice ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 backdrop-blur-lg"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {notice}
              </span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-emerald-100/60 transition hover:bg-white/10 hover:text-emerald-100"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {initialError ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100 backdrop-blur-lg">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{initialError}</p>
          </div>
        ) : null}

        <AnimatePresence>
          {startError ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="alert"
              className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100 backdrop-blur-lg"
            >
              <span className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {startError}
              </span>
              <button
                type="button"
                onClick={() => setStartError(null)}
                aria-label="Dismiss workout error"
                className="rounded-lg p-1 text-red-100/60 transition hover:bg-white/10 hover:text-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {routineActionError ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="alert"
              className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100 backdrop-blur-lg"
            >
              <span className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {routineActionError}
              </span>
              <button
                type="button"
                onClick={() => setRoutineActionError(null)}
                aria-label="Dismiss routine error"
                className="rounded-lg p-1 text-red-100/60 transition hover:bg-white/10 hover:text-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {routines.length > 0 ? (
          <motion.section
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.07 } },
            }}
            className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {routines.map((routine) => (
              <motion.article
                key={routine.id}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  visible: { opacity: 1, y: 0 },
                }}
                whileHover={{ y: -4 }}
                className={`group relative flex min-h-80 flex-col rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.07] ${
                  openRoutineMenuId === routine.id ? "z-20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-violet-300">
                      <Dumbbell className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">
                        {routine.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-white/40">
                        {routine.routine_exercises.length}{" "}
                        {routine.routine_exercises.length === 1
                          ? "exercise"
                          : "exercises"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative shrink-0"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={`Open actions for ${routine.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openRoutineMenuId === routine.id}
                      onClick={() =>
                        setOpenRoutineMenuId((current) =>
                          current === routine.id ? null : routine.id,
                        )
                      }
                      disabled={routineActionId === routine.id}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/45 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {routineActionId === routine.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-5 w-5" />
                      )}
                    </button>

                    <AnimatePresence>
                      {openRoutineMenuId === routine.id ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          role="menu"
                          className="absolute right-0 top-12 z-30 w-44 rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl"
                        >
                          <RoutineMenuButton
                            icon={Edit}
                            label="Edit"
                            onClick={() => editRoutine(routine)}
                          />
                          <RoutineMenuButton
                            icon={Edit}
                            label="Rename"
                            onClick={() => void renameRoutine(routine)}
                          />
                          <RoutineMenuButton
                            icon={Copy}
                            label="Duplicate"
                            onClick={() =>
                              void duplicateRoutine(routine)
                            }
                          />
                          <RoutineMenuButton
                            icon={Trash2}
                            label="Delete"
                            danger
                            onClick={() => void deleteRoutine(routine)}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="mt-5 flex-1 space-y-2.5">
                  {routine.routine_exercises.length > 0 ? (
                    [...routine.routine_exercises]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map(
                      (routineExercise, index) => {
                        const exercise = getJoinedExercise(
                          routineExercise.exercises,
                        );

                        return (
                          <div
                            key={`${routineExercise.exercise_id}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/10 px-3.5 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white/85">
                                {exercise?.name ?? "Unknown exercise"}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/35">
                                <Timer className="h-3 w-3" />
                                {routineExercise.rest_time_seconds}s rest
                              </p>
                            </div>
                            <span className="shrink-0 rounded-xl border border-violet-300/15 bg-violet-300/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                              {routineExercise.target_sets} ×{" "}
                              {routineExercise.target_reps}
                            </span>
                          </div>
                        );
                      },
                      )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">
                      No exercises in this routine yet.
                    </div>
                  )}
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startWorkout(routine)}
                  disabled={startingRoutineId !== null}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white text-sm font-semibold text-neutral-950 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {startingRoutineId === routine.id ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      Start Workout
                    </>
                  )}
                </motion.button>
              </motion.article>
            ))}
          </motion.section>
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 grid min-h-96 place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-lg"
          >
            <div className="max-w-sm">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-violet-300">
                <Dumbbell className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">
                Build your first routine
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Save your exercises, targets, and rest times as a reusable
                workout template.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsModalOpen(true);
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium transition hover:bg-white/15"
              >
                <Plus className="h-4 w-4" />
                New Routine
              </button>
            </div>
          </motion.section>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeModal();
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-routine-title"
              className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-900/95 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-3xl"
            >
              <div className="flex items-start justify-between border-b border-white/10 px-5 py-5 sm:px-6">
                <div>
                  <h2
                    id="new-routine-title"
                    className="text-xl font-semibold tracking-tight"
                  >
                    {editingRoutineId ? "Edit routine" : "Create routine"}
                  </h2>
                  <p className="mt-1 text-sm text-white/40">
                    {editingRoutineId
                      ? "Refine the exercises and targets in this template."
                      : "Build a reusable template for your next session."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving || isCreatingExercise}
                  aria-label="Close routine builder"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/55 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                onSubmit={saveRoutine}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/45">
                      Routine name
                    </span>
                    <input
                      value={routineName}
                      onChange={(event) =>
                        setRoutineName(event.target.value)
                      }
                      maxLength={120}
                      placeholder="e.g., Push Day"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/40 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-400/10"
                    />
                  </label>

                  <div>
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/45">
                      Add exercises
                    </span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/35" />
                      <input
                        value={searchQuery}
                        onChange={(event) => {
                          setSearchQuery(event.target.value);
                          setIsSelectorOpen(true);
                        }}
                        onFocus={() => setIsSelectorOpen(true)}
                        onBlur={() => {
                          window.setTimeout(
                            () => setIsSelectorOpen(false),
                            120,
                          );
                        }}
                        placeholder="Search or create an exercise"
                        role="combobox"
                        aria-expanded={isSelectorOpen}
                        aria-controls="exercise-options"
                        className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/40 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-400/10"
                      />

                      <AnimatePresence>
                        {isSelectorOpen ? (
                          <motion.div
                            id="exercise-options"
                            role="listbox"
                            initial={{ opacity: 0, y: -6, scale: 0.99 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.99 }}
                            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-2xl"
                          >
                            {matchingExercises.map((exercise) => (
                              <button
                                key={exercise.id}
                                type="button"
                                role="option"
                                aria-selected="false"
                                onMouseDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() =>
                                  addExerciseToBuilder(exercise)
                                }
                                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-white/50">
                                    <Dumbbell className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="truncate text-sm text-white/85">
                                    {exercise.name}
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs text-white/30">
                                  {exercise.muscle_group ?? "Other"}
                                </span>
                              </button>
                            ))}

                            {canCreateExercise ? (
                              <button
                                type="button"
                                role="option"
                                aria-selected="false"
                                disabled={isCreatingExercise}
                                onMouseDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={createExercise}
                                className="flex w-full items-center gap-3 rounded-xl border border-violet-300/10 bg-violet-300/[0.06] px-3 py-2.5 text-left text-sm text-violet-200 transition hover:bg-violet-300/10 disabled:cursor-wait disabled:opacity-60"
                              >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-300/10">
                                  {isCreatingExercise ? (
                                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                </span>
                                <span className="truncate">
                                  Create &ldquo;{searchQuery.trim()}&rdquo;
                                </span>
                              </button>
                            ) : null}

                            {matchingExercises.length === 0 &&
                            !canCreateExercise ? (
                              <p className="px-3 py-5 text-center text-sm text-white/35">
                                {exactMatch &&
                                selectedExerciseIds.has(exactMatch.id)
                                  ? "That exercise is already in this routine."
                                  : "Type to find an exercise."}
                              </p>
                            ) : null}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">
                        Routine exercises
                      </span>
                      <span className="text-xs text-white/30">
                        {builderExercises.length} selected
                      </span>
                    </div>

                    {builderExercises.length > 0 ? (
                      <motion.div layout className="space-y-3">
                        <AnimatePresence initial={false}>
                          {builderExercises.map((item) => (
                            <motion.div
                              layout
                              key={item.exercise.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                            >
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white/90">
                                    {item.exercise.name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-white/35">
                                    {item.exercise.muscle_group ?? "Other"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeBuilderExercise(
                                      item.exercise.id,
                                    )
                                  }
                                  aria-label={`Remove ${item.exercise.name}`}
                                  className="rounded-xl p-2 text-white/35 transition hover:bg-red-400/10 hover:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <NumberField
                                  label="Sets"
                                  value={item.target_sets}
                                  min={1}
                                  onChange={(value) =>
                                    updateBuilderExercise(
                                      item.exercise.id,
                                      "target_sets",
                                      value,
                                    )
                                  }
                                />
                                <NumberField
                                  label="Reps"
                                  value={item.target_reps}
                                  min={1}
                                  onChange={(value) =>
                                    updateBuilderExercise(
                                      item.exercise.id,
                                      "target_reps",
                                      value,
                                    )
                                  }
                                />
                                <NumberField
                                  label="Rest (sec)"
                                  value={item.rest_time_seconds}
                                  min={0}
                                  step={15}
                                  onChange={(value) =>
                                    updateBuilderExercise(
                                      item.exercise.id,
                                      "rest_time_seconds",
                                      value,
                                    )
                                  }
                                />
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-10 text-center">
                        <Dumbbell className="mx-auto h-5 w-5 text-white/25" />
                        <p className="mt-3 text-sm text-white/35">
                          Search above to add your first exercise.
                        </p>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {formError ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        role="alert"
                        className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 p-3.5 text-sm text-red-100"
                      >
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {formError}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-6">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving || isCreatingExercise}
                    className="min-h-11 rounded-2xl px-4 text-sm font-medium text-white/50 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSaving || isCreatingExercise}
                    className="inline-flex min-h-11 min-w-36 items-center justify-center gap-2 rounded-2xl bg-violet-400 px-5 text-sm font-semibold text-neutral-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        {editingRoutineId
                          ? "Save Changes"
                          : "Save Routine"}
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

type RoutineMenuButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

function RoutineMenuButton({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: RoutineMenuButtonProps) {
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

type NumberFieldProps = {
  label: string;
  value: number | "";
  min: number;
  step?: number;
  onChange: (value: number | "") => void;
};

function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: NumberFieldProps) {
  return (
    <label>
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-white/35">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        step={step}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? ""
              : Number(event.target.value),
          )
        }
        className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-violet-300/40 focus:ring-4 focus:ring-violet-400/10"
      />
    </label>
  );
}
