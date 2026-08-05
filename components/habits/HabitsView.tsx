"use client";

import {
  eachDayOfInterval,
  format,
  getDay,
  isBefore,
  isSameDay,
  startOfDay,
  subDays,
} from "date-fns";
import {
  Check,
  CircleAlert,
  Flame,
  LoaderCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

type HabitCompletion = {
  id: string;
  completed_date: string;
};

type Habit = {
  id: string;
  name: string;
  created_at: string;
  habit_completions: HabitCompletion[];
};

const trackedDayCount = 90;

function isAbortError(error: unknown) {
  return (
    error instanceof Error && error.name === "AbortError"
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function calculateCurrentStreak(
  completionDates: Set<string>,
  today: Date,
) {
  let streak = 0;

  for (let offset = 0; offset < trackedDayCount; offset += 1) {
    const dateKey = format(subDays(today, offset), "yyyy-MM-dd");

    if (!completionDates.has(dateKey)) {
      break;
    }

    streak += 1;
  }

  return streak;
}

export function HabitsView() {
  const supabase = useMemo(() => createClient(), []);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabitName, setNewHabitName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [togglingHabitId, setTogglingHabitId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = format(today, "yyyy-MM-dd");
  const firstTrackedDay = subDays(today, trackedDayCount - 1);
  const gridStart = subDays(firstTrackedDay, getDay(firstTrackedDay));
  const gridDays = eachDayOfInterval({
    start: gridStart,
    end: today,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHabits() {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: habitsError } = await supabase
          .from("habits")
          .select(
            `
              id,
              name,
              created_at,
              habit_completions (
                id,
                completed_date
              )
            `,
          )
          .order("created_at", { ascending: true })
          .abortSignal(controller.signal);

        if (habitsError) {
          throw habitsError;
        }

        setHabits((data ?? []) as unknown as Habit[]);
      } catch (loadError) {
        if (controller.signal.aborted || isAbortError(loadError)) {
          return;
        }

        setError(
          getErrorMessage(
            loadError,
            "Your habits could not be loaded.",
          ),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadHabits();

    return () => controller.abort();
  }, [supabase]);

  const createHabit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newHabitName.trim();

    if (!name || isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);

    const { data, error: createError } = await supabase
      .from("habits")
      .insert({ name })
      .select("id, name, created_at")
      .single();

    if (createError || !data) {
      setError(
        createError?.message ?? "The habit could not be created.",
      );
      setIsCreating(false);
      return;
    }

    setHabits((current) => [
      ...current,
      {
        ...(data as {
          id: string;
          name: string;
          created_at: string;
        }),
        habit_completions: [],
      },
    ]);
    setNewHabitName("");
    setIsCreating(false);
  };

  const toggleToday = async (habit: Habit) => {
    if (togglingHabitId) {
      return;
    }

    const existingCompletion = habit.habit_completions.find(
      (completion) => completion.completed_date === todayKey,
    );
    setTogglingHabitId(habit.id);
    setError(null);

    if (existingCompletion) {
      const { error: deleteError } = await supabase
        .from("habit_completions")
        .delete()
        .eq("id", existingCompletion.id);

      if (deleteError) {
        setError(deleteError.message);
        setTogglingHabitId(null);
        return;
      }

      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? {
                ...item,
                habit_completions:
                  item.habit_completions.filter(
                    (completion) =>
                      completion.id !== existingCompletion.id,
                  ),
              }
            : item,
        ),
      );
    } else {
      const { data, error: insertError } = await supabase
        .from("habit_completions")
        .insert({
          habit_id: habit.id,
          completed_date: todayKey,
        })
        .select("id, completed_date")
        .single();

      if (insertError || !data) {
        setError(
          insertError?.message ??
            "Today’s completion could not be saved.",
        );
        setTogglingHabitId(null);
        return;
      }

      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? {
                ...item,
                habit_completions: [
                  ...item.habit_completions,
                  data as HabitCompletion,
                ],
              }
            : item,
        ),
      );
    }

    setTogglingHabitId(null);
  };

  return (
    <div className="mt-8 space-y-5">
      <form
        onSubmit={createHabit}
        className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="new-habit"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35"
          >
            Add a daily habit
          </label>
          <input
            id="new-habit"
            value={newHabitName}
            onChange={(event) =>
              setNewHabitName(event.target.value)
            }
            maxLength={120}
            placeholder="e.g., review notes for 20 minutes"
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/35 focus:ring-4 focus:ring-emerald-400/[0.07]"
          />
        </div>
        <button
          type="submit"
          disabled={!newHabitName.trim() || isCreating}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 sm:self-end"
        >
          {isCreating ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {isCreating ? "Adding…" : "Add Habit"}
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-44 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && habits.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
          <Sparkles className="mx-auto size-6 text-emerald-300/60" />
          <h2 className="mt-4 font-semibold text-white">
            Build your first streak
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
            Add one habit above. Each completed day becomes a green
            square in your contribution grid.
          </p>
        </div>
      ) : null}

      {!isLoading
        ? habits.map((habit) => {
            const completionDates = new Set(
              habit.habit_completions.map(
                (completion) => completion.completed_date,
              ),
            );
            const trackedCompletions = gridDays.filter(
              (date) =>
                !isBefore(date, firstTrackedDay) &&
                completionDates.has(format(date, "yyyy-MM-dd")),
            ).length;
            const streak = calculateCurrentStreak(
              completionDates,
              today,
            );
            const isToggling = togglingHabitId === habit.id;

            return (
              <article
                key={habit.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/15 backdrop-blur-xl"
              >
                <header className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-white/90">
                      {habit.name}
                    </h2>
                    <p className="mt-1 text-xs text-white/30">
                      {trackedCompletions} completions in the last 90
                      days
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-orange-300/15 bg-orange-300/[0.07] px-2.5 py-1 text-xs text-orange-200/70">
                    <Flame className="size-3.5" />
                    {streak} day streak
                  </span>
                </header>

                <div className="p-5">
                  <div className="overflow-x-auto pb-2">
                    <div className="flex min-w-max items-start gap-3">
                      <div className="grid grid-rows-7 gap-1.5 pt-0 text-[9px] text-white/25">
                        {["Sun", "", "Tue", "", "Thu", "", "Sat"].map(
                          (label, index) => (
                            <span
                              key={`${label}-${index}`}
                              className="flex h-4 items-center"
                            >
                              {label}
                            </span>
                          ),
                        )}
                      </div>
                      <div
                        className="grid min-w-max grid-flow-col grid-rows-7 gap-1.5"
                        aria-label={`${habit.name} completion grid for the last 90 days`}
                      >
                        {gridDays.map((date) => {
                          const dateKey = format(date, "yyyy-MM-dd");
                          const isTracked = !isBefore(
                            date,
                            firstTrackedDay,
                          );
                          const isCompleted =
                            completionDates.has(dateKey);
                          const isToday = isSameDay(date, today);
                          const squareClassName = `size-4 rounded-[4px] border transition ${
                            !isTracked
                              ? "invisible"
                              : isCompleted
                                ? "border-emerald-300/35 bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.16)]"
                                : isToday
                                  ? "border-emerald-300/40 bg-emerald-300/[0.08] hover:bg-emerald-300/15"
                                  : "border-white/[0.07] bg-white/[0.035]"
                          }`;
                          const label = `${format(date, "MMM d, yyyy")}: ${
                            isCompleted
                              ? "completed"
                              : "not completed"
                          }`;

                          return isToday ? (
                            <button
                              key={dateKey}
                              type="button"
                              title={`${label}. Tap to toggle today.`}
                              aria-label={`${label}. Toggle today's completion for ${habit.name}.`}
                              aria-pressed={isCompleted}
                              disabled={isToggling}
                              onClick={() => void toggleToday(habit)}
                              className={`${squareClassName} grid place-items-center disabled:cursor-wait`}
                            >
                              {isToggling ? (
                                <LoaderCircle className="size-2.5 animate-spin text-emerald-100" />
                              ) : isCompleted ? (
                                <Check className="size-2.5 text-emerald-950" />
                              ) : null}
                            </button>
                          ) : (
                            <span
                              key={dateKey}
                              title={label}
                              className={squareClassName}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-white/25">
                    Tap today&apos;s outlined square to update your
                    streak.
                  </p>
                </div>
              </article>
            );
          })
        : null}
    </div>
  );
}
