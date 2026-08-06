"use client";

import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  CircleAlert,
  ClipboardCheck,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Assignment } from "@/lib/assignments/types";

type AssignmentsViewProps = {
  createdAssignment: Assignment | null;
};

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort((left, right) => {
    if (left.is_completed !== right.is_completed) {
      return Number(left.is_completed) - Number(right.is_completed);
    }

    return (
      new Date(left.due_date).getTime() -
      new Date(right.due_date).getTime()
    );
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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

export function AssignmentsView({
  createdAssignment,
}: AssignmentsViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssignments() {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: assignmentsError } = await supabase
          .from("assignments")
          .select("id, title, course, due_date, is_completed, source")
          .order("due_date", { ascending: true })
          .abortSignal(controller.signal);

        if (assignmentsError) {
          throw assignmentsError;
        }

        setAssignments(sortAssignments((data ?? []) as Assignment[]));
      } catch (loadError) {
        if (controller.signal.aborted || isAbortError(loadError)) {
          return;
        }

        setError(
          getErrorMessage(loadError, "Assignments could not be loaded."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadAssignments();

    return () => controller.abort();
  }, [supabase]);

  const visibleAssignments = useMemo(() => {
    if (
      !createdAssignment ||
      assignments.some(
        (assignment) => assignment.id === createdAssignment.id,
      )
    ) {
      return assignments;
    }

    return sortAssignments([createdAssignment, ...assignments]);
  }, [assignments, createdAssignment]);

  const toggleAssignment = async (assignment: Assignment) => {
    if (updatingId) {
      return;
    }

    const nextCompleted = !assignment.is_completed;
    setUpdatingId(assignment.id);
    setError(null);
    setAssignments((current) =>
      sortAssignments(
        (
          current.some((item) => item.id === assignment.id)
            ? current
            : [assignment, ...current]
        ).map((item) =>
          item.id === assignment.id
            ? { ...item, is_completed: nextCompleted }
            : item,
        ),
      ),
    );

    const { error: updateError } = await supabase
      .from("assignments")
      .update({ is_completed: nextCompleted })
      .eq("id", assignment.id);

    if (updateError) {
      setAssignments((current) =>
        sortAssignments(
          current.map((item) =>
            item.id === assignment.id
              ? { ...item, is_completed: assignment.is_completed }
              : item,
          ),
        ),
      );
      setError(updateError.message);
    }

    setUpdatingId(null);
  };

  if (isLoading) {
    return (
      <div className="mt-8 space-y-3" aria-label="Loading assignments">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8">
      {error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {visibleAssignments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
          <ClipboardCheck className="mx-auto size-7 text-indigo-300/50" />
          <h2 className="mt-4 font-semibold text-white">
            No assignments yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
            Add your first deadline and it will appear here immediately.
          </p>
        </div>
      ) : (
        <motion.div layout className="space-y-3">
          {visibleAssignments.map((assignment) => {
            const isUpdating = updatingId === assignment.id;

            return (
              <motion.article
                layout
                key={assignment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-4 rounded-3xl border p-4 backdrop-blur-xl transition ${
                  assignment.is_completed
                    ? "border-emerald-300/10 bg-emerald-300/[0.035]"
                    : "border-white/10 bg-white/[0.045]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void toggleAssignment(assignment)}
                  disabled={Boolean(updatingId)}
                  aria-label={`${assignment.is_completed ? "Mark incomplete" : "Mark complete"}: ${assignment.title}`}
                  aria-pressed={assignment.is_completed}
                  className={`grid size-11 shrink-0 place-items-center rounded-2xl border transition ${
                    assignment.is_completed
                      ? "border-emerald-300/30 bg-emerald-400 text-emerald-950"
                      : "border-white/15 bg-white/5 text-white/25 hover:border-indigo-300/35 hover:text-indigo-200"
                  } disabled:cursor-wait disabled:opacity-50`}
                >
                  {isUpdating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`truncate font-medium ${
                        assignment.is_completed
                          ? "text-white/35 line-through"
                          : "text-white/85"
                      }`}
                    >
                      {assignment.title}
                    </h2>
                    <span className="rounded-full border border-indigo-300/15 bg-indigo-300/[0.07] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200/65">
                      {assignment.course}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/35">
                    <CalendarClock className="size-3.5" />
                    {format(
                      new Date(assignment.due_date),
                      "EEE, MMM d 'at' h:mm a",
                    )}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
