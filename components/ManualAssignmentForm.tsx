"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";

type ManualAssignmentFormProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Feedback =
  | { type: "idle"; message: "" }
  | { type: "success" | "error"; message: string };

const initialFeedback: Feedback = { type: "idle", message: "" };

export function ManualAssignmentForm({
  isOpen,
  onClose,
}: ManualAssignmentFormProps) {
  const [assignmentName, setAssignmentName] = useState("");
  const [course, setCourse] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  const dismiss = () => {
    if (isSubmitting) return;
    setFeedback(initialFeedback);
    onClose();
  };

  const clearFeedback = () => {
    if (feedback.type !== "idle") {
      setFeedback(initialFeedback);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanTitle = assignmentName.trim();
    const cleanCourse = course.trim();

    if (!cleanTitle || !cleanCourse || !dueDate) {
      setFeedback({
        type: "error",
        message: "Complete all three fields before saving.",
      });
      return;
    }

    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      setFeedback({
        type: "error",
        message: "Choose a valid due date and time.",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(initialFeedback);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("assignments").insert({
        title: cleanTitle,
        course: cleanCourse,
        due_date: parsedDueDate.toISOString(),
        source: "manual",
      });

      if (error) throw error;

      setAssignmentName("");
      setCourse("");
      setDueDate("");
      setFeedback({
        type: "success",
        message: "Assignment added successfully.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the assignment.";

      setFeedback({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-assignment-title"
            className="relative w-full max-w-lg overflow-hidden rounded-t-[2rem] border border-white/10 bg-neutral-950/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-8"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-indigo-500/10 blur-3xl"
            />

            <div className="relative flex items-start justify-between gap-6">
              <div>
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
                  <CalendarClock aria-hidden="true" className="size-5" />
                </div>
                <h2
                  id="manual-assignment-title"
                  className="text-2xl font-semibold tracking-[-0.035em] text-white"
                >
                  New assignment
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Add the details now. You can organize it further later.
                </p>
              </div>

              <button
                type="button"
                onClick={dismiss}
                disabled={isSubmitting}
                aria-label="Close assignment form"
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="relative mt-8 space-y-5">
              <div>
                <label
                  htmlFor="assignment-name"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500"
                >
                  Assignment name
                </label>
                <input
                  id="assignment-name"
                  type="text"
                  autoFocus
                  required
                  value={assignmentName}
                  onChange={(event) => {
                    setAssignmentName(event.target.value);
                    clearFeedback();
                  }}
                  placeholder="e.g., Statics Design Problem 3.2"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 hover:border-white/15 focus:border-indigo-400/50 focus:bg-white/[0.065] focus:ring-4 focus:ring-indigo-400/10"
                />
              </div>

              <div>
                <label
                  htmlFor="assignment-course"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500"
                >
                  Course
                </label>
                <input
                  id="assignment-course"
                  type="text"
                  required
                  value={course}
                  onChange={(event) => {
                    setCourse(event.target.value);
                    clearFeedback();
                  }}
                  placeholder="e.g., ENGL 221"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 hover:border-white/15 focus:border-indigo-400/50 focus:bg-white/[0.065] focus:ring-4 focus:ring-indigo-400/10"
                />
              </div>

              <div>
                <label
                  htmlFor="assignment-due-date"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500"
                >
                  Due date
                </label>
                <input
                  id="assignment-due-date"
                  type="datetime-local"
                  required
                  value={dueDate}
                  onChange={(event) => {
                    setDueDate(event.target.value);
                    clearFeedback();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition [color-scheme:dark] hover:border-white/15 focus:border-indigo-400/50 focus:bg-white/[0.065] focus:ring-4 focus:ring-indigo-400/10"
                />
              </div>

              <div aria-live="polite" className="min-h-6">
                <AnimatePresence mode="wait" initial={false}>
                  {feedback.type !== "idle" && (
                    <motion.p
                      key={feedback.type + feedback.message}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className={`flex items-center gap-2 text-sm ${
                        feedback.type === "success"
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }`}
                    >
                      {feedback.type === "success" ? (
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                      ) : (
                        <CircleAlert aria-hidden="true" className="size-4" />
                      )}
                      {feedback.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileHover={isSubmitting ? undefined : { y: -2 }}
                whileTap={isSubmitting ? undefined : { scale: 0.985 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-black/20 outline-none transition-colors hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Saving assignment…
                  </>
                ) : (
                  <>
                    <Plus aria-hidden="true" className="size-4" />
                    Add assignment
                  </>
                )}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
