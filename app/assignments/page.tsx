"use client";

import { motion } from "framer-motion";
import { CheckSquare2, Flame, ListTodo, Plus } from "lucide-react";
import { useState } from "react";

import { AssignmentsView } from "@/components/assignments/AssignmentsView";
import { HabitsView } from "@/components/habits/HabitsView";
import { ManualAssignmentForm } from "@/components/ManualAssignmentForm";
import { TodosView } from "@/components/todos/TodosView";
import type { Assignment } from "@/lib/assignments/types";

type AssignmentsPageView = "assignments" | "habits" | "todos";

const viewDetails: Record<
  AssignmentsPageView,
  {
    eyebrow: string;
    title: string;
    description: string;
    dotClassName: string;
  }
> = {
  assignments: {
    eyebrow: "Coursework",
    title: "Assignments",
    description: "Keep every deadline visible and every next step clear.",
    dotClassName:
      "bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.9)]",
  },
  habits: {
    eyebrow: "Consistency",
    title: "Habits",
    description: "Build consistency one small square at a time.",
    dotClassName:
      "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]",
  },
  todos: {
    eyebrow: "Quick actions",
    title: "To-Do",
    description: "Capture the small tasks that keep everything moving.",
    dotClassName:
      "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]",
  },
};

export default function AssignmentsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [view, setView] = useState<AssignmentsPageView>("assignments");
  const [createdAssignment, setCreatedAssignment] =
    useState<Assignment | null>(null);
  const isAssignmentsView = view === "assignments";
  const activeView = viewDetails[view];

  return (
    <>
      <section aria-labelledby="assignments-heading">
        <div className="mb-7 grid w-full grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.045] p-1 backdrop-blur-xl sm:inline-grid sm:w-auto">
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
            {
              value: "todos" as const,
              label: "To-Do",
              icon: ListTodo,
            },
          ].map(({ value, label, icon: Icon }) => {
            const isActive = view === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={isActive}
                className={`relative inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium transition sm:gap-2 sm:px-4 sm:text-sm ${
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
                      : value === "todos" && isActive
                        ? "text-cyan-300"
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
              <span
                className={`size-1.5 rounded-full ${activeView.dotClassName}`}
              />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                {activeView.eyebrow}
              </p>
            </div>
            <h1
              id="assignments-heading"
              className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl"
            >
              {activeView.title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base">
              {activeView.description}
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

        {view === "assignments" ? (
          <AssignmentsView createdAssignment={createdAssignment} />
        ) : view === "habits" ? (
          <HabitsView />
        ) : (
          <TodosView />
        )}
      </section>

      <ManualAssignmentForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onCreated={setCreatedAssignment}
      />
    </>
  );
}
