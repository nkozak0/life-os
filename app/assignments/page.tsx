"use client";

import { motion } from "framer-motion";
import { CheckSquare2, Flame, Plus } from "lucide-react";
import { useState } from "react";

import { HabitsView } from "@/components/habits/HabitsView";
import { ManualAssignmentForm } from "@/components/ManualAssignmentForm";

export default function AssignmentsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [view, setView] = useState<"assignments" | "habits">(
    "assignments",
  );
  const isAssignmentsView = view === "assignments";

  return (
    <>
      <section aria-labelledby="assignments-heading">
        <div className="mb-7 inline-grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.045] p-1 backdrop-blur-xl">
          {[
            {
              value: "assignments" as const,
              label: "Assignments",
              icon: CheckSquare2,
            },
            {
              value: "habits" as const,
              label: "Habits",
              icon: Flame,
            },
          ].map(({ value, label, icon: Icon }) => {
            const isActive = view === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={isActive}
                className={`relative inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition ${
                  isActive
                    ? "text-white"
                    : "text-white/35 hover:text-white/65"
                }`}
              >
                {isActive ? (
                  <motion.span
                    layoutId="assignments-view-toggle"
                    className="absolute inset-0 rounded-xl border border-white/10 bg-white/10 shadow-sm"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32,
                    }}
                  />
                ) : null}
                <Icon
                  className={`relative z-10 size-4 ${
                    value === "habits" && isActive
                      ? "text-emerald-300"
                      : isActive
                        ? "text-indigo-300"
                        : ""
                  }`}
                />
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.9)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                {isAssignmentsView ? "Coursework" : "Consistency"}
              </p>
            </div>
            <h1
              id="assignments-heading"
              className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl"
            >
              {isAssignmentsView ? "Assignments" : "Habits"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base">
              {isAssignmentsView
                ? "Keep every deadline visible and every next step clear."
                : "Build consistency one small square at a time."}
            </p>
          </div>

          {isAssignmentsView ? (
            <motion.button
              type="button"
              onClick={() => setIsFormOpen(true)}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ y: 0, scale: 0.98 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 24,
              }}
              className="group inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/20 backdrop-blur-xl outline-none transition-colors hover:border-indigo-400/30 hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              <Plus
                aria-hidden="true"
                className="size-4 text-indigo-300 transition-transform duration-200 group-hover:rotate-90"
                strokeWidth={2}
              />
              New Assignment
            </motion.button>
          ) : null}
        </header>

        {isAssignmentsView ? (
          <div className="mt-8 min-h-80 rounded-3xl border border-dashed border-white/10 bg-white/[0.025]" />
        ) : (
          <HabitsView />
        )}
      </section>

      <ManualAssignmentForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
      />
    </>
  );
}
