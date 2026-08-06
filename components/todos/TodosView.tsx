"use client";

import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CircleAlert,
  ListChecks,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

type Todo = {
  id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
};

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

export function TodosView() {
  const supabase = useMemo(() => createClient(), []);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [task, setTask] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTodos() {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: todosError } = await supabase
          .from("todos")
          .select("id, user_id, title, is_completed, created_at")
          .order("is_completed", { ascending: true })
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal);

        if (todosError) {
          throw todosError;
        }

        setTodos((data ?? []) as Todo[]);
      } catch (loadError) {
        if (controller.signal.aborted || isAbortError(loadError)) {
          return;
        }

        setError(
          getErrorMessage(
            loadError,
            "Your to-do list could not be loaded.",
          ),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTodos();

    return () => controller.abort();
  }, [supabase]);

  const addTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTask = task.trim();

    if (!cleanTask || isAdding) {
      return;
    }

    setIsAdding(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message ?? "You must be signed in to add a task.");
      setIsAdding(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("todos")
      .insert({
        user_id: user.id,
        title: cleanTask,
        is_completed: false,
      })
      .select("id, user_id, title, is_completed, created_at")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "The task could not be added.");
      setIsAdding(false);
      return;
    }

    setTodos((current) => [data as Todo, ...current]);
    setTask("");
    setIsAdding(false);
  };

  const toggleTodo = async (todo: Todo) => {
    if (updatingId) {
      return;
    }

    const nextComplete = !todo.is_completed;
    setUpdatingId(todo.id);
    setError(null);
    setTodos((current) =>
      current.map((item) =>
        item.id === todo.id
          ? { ...item, is_completed: nextComplete }
          : item,
      ),
    );

    const { error: updateError } = await supabase
      .from("todos")
      .update({
        is_completed: nextComplete,
        updated_at: new Date().toISOString(),
      })
      .eq("id", todo.id);

    if (updateError) {
      setTodos((current) =>
        current.map((item) =>
          item.id === todo.id
            ? { ...item, is_completed: todo.is_completed }
            : item,
        ),
      );
      setError(updateError.message);
    }

    setUpdatingId(null);
  };

  return (
    <div className="mt-8 space-y-5">
      <form
        onSubmit={addTodo}
        className="flex gap-2 rounded-3xl border border-white/10 bg-white/[0.045] p-2 backdrop-blur-xl"
      >
        <label htmlFor="new-todo" className="sr-only">
          New to-do
        </label>
        <input
          id="new-todo"
          value={task}
          onChange={(event) => {
            setTask(event.target.value);
            setError(null);
          }}
          maxLength={240}
          placeholder="What needs to get done?"
          className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/25"
        />
        <button
          type="submit"
          disabled={!task.trim() || isAdding}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          {isAdding ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          <span className="hidden sm:inline">
            {isAdding ? "Adding" : "Add Task"}
          </span>
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
        <div className="space-y-3" aria-label="Loading to-do items">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && todos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
          <ListChecks className="mx-auto size-7 text-cyan-300/50" />
          <h2 className="mt-4 font-semibold text-white">Nothing pending</h2>
          <p className="mt-2 text-sm text-white/40">
            Add a quick task above and keep the list moving.
          </p>
        </div>
      ) : null}

      {!isLoading && todos.length > 0 ? (
        <motion.div layout className="space-y-2">
          <AnimatePresence initial={false}>
            {todos.map((todo) => {
              const isUpdating = updatingId === todo.id;

              return (
                <motion.article
                  layout
                  key={todo.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`flex items-center gap-3 rounded-3xl border p-3.5 backdrop-blur-xl transition ${
                    todo.is_completed
                      ? "border-emerald-300/10 bg-emerald-300/[0.035]"
                      : "border-white/10 bg-white/[0.045]"
                  }`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={todo.is_completed}
                    aria-label={`${todo.is_completed ? "Mark incomplete" : "Mark complete"}: ${todo.title}`}
                    disabled={Boolean(updatingId)}
                    onClick={() => void toggleTodo(todo)}
                    className={`grid size-11 shrink-0 place-items-center rounded-2xl border transition ${
                      todo.is_completed
                        ? "border-emerald-300/30 bg-emerald-400 text-emerald-950"
                        : "border-white/15 bg-white/5 text-transparent hover:border-cyan-300/35 hover:text-cyan-200/40"
                    } disabled:cursor-wait disabled:opacity-50`}
                  >
                    {isUpdating ? (
                      <LoaderCircle className="size-4 animate-spin text-current" />
                    ) : (
                      <Check className="size-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm leading-6 ${
                        todo.is_completed
                          ? "text-white/35 line-through"
                          : "text-white/80"
                      }`}
                    >
                      {todo.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/25">
                      Added{" "}
                      {formatDistanceToNow(new Date(todo.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </div>
  );
}
