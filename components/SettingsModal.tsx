"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onHistoryCleared: () => void;
};

type SettingsResponse = {
  settings?: {
    preferred_name?: string;
    current_focus?: string;
  };
  error?: string;
};

const subscribeToClient = () => () => undefined;

export default function SettingsModal({
  isOpen,
  onClose,
  onHistoryCleared,
}: SettingsModalProps) {
  const router = useRouter();
  const preferredNameRef = useRef<HTMLInputElement>(null);
  const isMounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const [preferredName, setPreferredName] = useState("");
  const [currentFocus, setCurrentFocus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isBusyRef = useRef(false);

  useEffect(() => {
    isBusyRef.current = isSaving || isClearing;
  }, [isClearing, isSaving]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      preferredNameRef.current?.focus();
    }, 100);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isBusyRef.current) {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();

    async function loadSettings() {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const response = await fetch("/api/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result =
          (await response.json().catch(() => ({}))) as SettingsResponse;

        if (!response.ok) {
          throw new Error(
            result.error ?? "Settings could not be loaded.",
          );
        }

        setPreferredName(
          result.settings?.preferred_name ?? "",
        );
        setCurrentFocus(
          result.settings?.current_focus ?? "",
        );
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Settings could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      controller.abort();
    };
  }, [isOpen]);

  const saveSettings = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (isSaving || isClearing) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferred_name: preferredName,
          current_focus: currentFocus,
        }),
      });
      const result =
        (await response.json().catch(() => ({}))) as SettingsResponse;

      if (!response.ok) {
        throw new Error(
          result.error ?? "Settings could not be saved.",
        );
      }

      setPreferredName(
        result.settings?.preferred_name ?? "",
      );
      setCurrentFocus(
        result.settings?.current_focus ?? "",
      );
      setSuccess("Settings saved");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const clearChatHistory = async () => {
    if (
      isSaving ||
      isClearing ||
      !window.confirm(
        "Clear your entire chat history? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsClearing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
      });
      const result =
        (await response.json().catch(() => ({}))) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          result.error ?? "Chat history could not be cleared.",
        );
      }

      onHistoryCleared();
      router.refresh();
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Chat history could not be cleared.",
      );
    } finally {
      setIsClearing(false);
    }
  };

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !isSaving &&
              !isClearing
            ) {
              onClose();
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950/95 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-3xl"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 320,
            }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-neutral-950/80 px-5 py-5 backdrop-blur-xl sm:px-6">
              <div>
                <h2
                  id="settings-title"
                  className="text-lg font-semibold tracking-tight text-white"
                >
                  Agent Settings
                </h2>
                <p className="mt-1 text-sm text-white/40">
                  Give your copilot better context
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isClearing}
                aria-label="Close settings"
                className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={saveSettings}
              className="space-y-5 px-5 py-6 sm:px-6"
            >
              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm leading-5 text-red-200"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              {success ? (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </p>
              ) : null}

              <div>
                <label
                  htmlFor="preferred-name"
                  className="mb-2 block text-sm font-medium text-white/75"
                >
                  Preferred Name
                </label>
                <input
                  ref={preferredNameRef}
                  id="preferred-name"
                  value={preferredName}
                  onChange={(event) =>
                    setPreferredName(event.target.value)
                  }
                  maxLength={80}
                  disabled={isLoading || isSaving || isClearing}
                  placeholder="e.g., Nico"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/35 focus:ring-4 focus:ring-violet-400/[0.08] disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="current-focus"
                  className="mb-2 block text-sm font-medium text-white/75"
                >
                  Current Focus
                </label>
                <textarea
                  id="current-focus"
                  value={currentFocus}
                  onChange={(event) =>
                    setCurrentFocus(event.target.value)
                  }
                  rows={4}
                  maxLength={600}
                  disabled={isLoading || isSaving || isClearing}
                  placeholder="e.g., engineering student at Lee University balancing diff eq, work, and workouts"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/35 focus:ring-4 focus:ring-violet-400/[0.08] disabled:opacity-50"
                />
                <p className="mt-1.5 text-right text-[11px] text-white/25">
                  {currentFocus.length}/600
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || isSaving || isClearing}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-4 text-sm font-semibold text-neutral-950 shadow-lg shadow-violet-950/30 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "Saving…" : "Save Settings"}
              </button>
            </form>

            <div className="border-t border-red-400/15 bg-red-500/[0.035] px-5 py-6 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-300/80">
                Danger Zone
              </p>
              <p className="mt-2 text-sm leading-5 text-white/40">
                Permanently remove every saved conversation message
                from your account
              </p>
              <button
                type="button"
                onClick={clearChatHistory}
                disabled={isLoading || isSaving || isClearing}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:border-red-400/40 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isClearing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isClearing
                  ? "Clearing History…"
                  : "Clear Chat History"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
