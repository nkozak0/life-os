"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  CircleAlert,
  Dumbbell,
  House,
  ListTodo,
  LoaderCircle,
  Send,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import SettingsModal from "@/components/SettingsModal";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialMessages: ChatMessage[] = [];

const homeLinks = [
  {
    label: "Assignments",
    description: "Coursework",
    href: "/assignments",
    icon: ListTodo,
    color: "text-indigo-200",
  },
  {
    label: "Calendar",
    description: "Your schedule",
    href: "/calendar",
    icon: CalendarDays,
    color: "text-emerald-200",
  },
  {
    label: "Workouts",
    description: "Training",
    href: "/workouts",
    icon: Dumbbell,
    color: "text-cyan-200",
  },
];

const starterPrompts = [
  "Help me balance my coursework and workouts",
  "Prioritize my upcoming assignments",
  "Help me optimize this week",
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function splitAssistantMessage(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [isSending, messages]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const clearLocalChatHistory = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setMessages([...initialMessages]);
    setDraft("");
    setError(null);
    setIsSending(false);
  }, []);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();

    if (!content || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsSending(true);
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.message?.trim()) {
        throw new Error(result.error ?? "The assistant could not respond.");
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: result.message!,
        },
      ]);
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
          : "The assistant could not respond.",
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsSending(false);
      }
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const selectStarterPrompt = (prompt: string) => {
    setDraft(prompt);
    composerRef.current?.focus();
  };

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/[0.07] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-violet-200/75">
                <House className="size-3.5" />
                Life OS Home
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">
                Your command center
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">
                Plan the day, work through decisions, and keep every part of
                life moving.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-200/75">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
              Copilot online
            </span>
          </div>

          <nav
            aria-label="Life OS sections"
            className="mt-5 grid grid-cols-3 gap-2"
          >
            {homeLinks.map(
              ({ label, description, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 backdrop-blur-xl transition hover:border-white/15 hover:bg-white/[0.07] sm:px-4"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
                    <Icon className={`size-4 ${color}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-white/75 sm:text-sm">
                      {label}
                    </span>
                    <span className="hidden truncate text-[11px] text-white/30 sm:block">
                      {description}
                    </span>
                  </span>
                  <ArrowUpRight className="ml-auto hidden size-3.5 shrink-0 text-white/20 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/50 sm:block" />
                </Link>
              ),
            )}
          </nav>
        </header>

        <section className="flex min-h-[34rem] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/30 backdrop-blur-2xl lg:h-[calc(100dvh-20rem)] lg:min-h-[36rem]">
          <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/10 px-4 py-4 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold tracking-tight">
                    Life OS Copilot
                  </h2>
                  <Sparkles className="h-3.5 w-3.5 text-violet-300/70" />
                </div>
                <p className="mt-0.5 text-xs text-white/35">
                  plan / prioritize / stay accountable
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Open agent settings"
                aria-haspopup="dialog"
                className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition hover:border-white/15 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5"
            aria-live="polite"
          >
            {messages.length === 0 && !isSending ? (
              <div className="mx-auto max-w-2xl py-3 sm:py-8">
                <div className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-300/[0.09] via-white/[0.045] to-cyan-300/[0.04] p-5 shadow-2xl shadow-violet-950/20 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
                      <Bot className="size-5" />
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
                    </span>
                    <div>
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-200/75">
                        <Sparkles className="size-3" />
                        Synced context
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
                        Meet your Life OS Copilot
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        I can use your latest calendar, assignments, and workout
                        activity to help you make realistic plans—not generic
                        ones.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[
                      {
                        label: "Calendar",
                        icon: CalendarDays,
                        color: "text-emerald-200",
                      },
                      {
                        label: "Assignments",
                        icon: ListTodo,
                        color: "text-indigo-200",
                      },
                      {
                        label: "Workouts",
                        icon: Dumbbell,
                        color: "text-cyan-200",
                      },
                    ].map(({ label, icon: Icon, color }) => (
                      <div
                        key={label}
                        className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/15 px-2 py-3 text-center"
                      >
                        <Icon className={`size-4 ${color}`} />
                        <span className="truncate text-[11px] font-medium text-white/55 sm:text-xs">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-sm font-medium leading-6 text-white/80">
                      What are your primary goals right now, and how can I help
                      you optimize your schedule to accomplish them?
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => selectStarterPrompt(prompt)}
                        className="min-h-11 rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] px-3 py-2.5 text-left text-xs leading-5 text-violet-100/70 transition hover:border-violet-300/25 hover:bg-violet-300/[0.11] hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((message, messageIndex) => {
              const isAssistant = message.role === "assistant";
              const senderChanged =
                messageIndex === 0 ||
                messages[messageIndex - 1]?.role !== message.role;
              const segments = isAssistant
                ? splitAssistantMessage(message.content)
                : [message.content.trim()].filter(Boolean);

              if (segments.length === 0) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isAssistant ? "justify-start" : "justify-end"
                  } ${
                    messageIndex === 0 ? "" : senderChanged ? "mt-6" : "mt-2"
                  }`}
                >
                  <div
                    className={`flex max-w-[88%] items-end gap-2 sm:max-w-[76%] ${
                      isAssistant ? "" : "flex-row-reverse"
                    }`}
                  >
                    {isAssistant ? (
                      senderChanged ? (
                        <span className="mb-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-violet-200/70">
                          <Bot className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="w-7 shrink-0" />
                      )
                    ) : null}

                    <div className="flex flex-col gap-1">
                      {segments.map((segment, segmentIndex) => (
                        <div
                          key={`${message.id}-${segmentIndex}`}
                          className={`px-4 py-2.5 text-sm leading-5 shadow-lg ${
                            isAssistant
                              ? "rounded-[1.25rem] rounded-bl-md border border-white/10 bg-white/[0.07] text-white/80"
                              : "rounded-[1.25rem] rounded-br-md bg-violet-400 text-neutral-950 shadow-violet-950/20"
                          }`}
                        >
                          {segment}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending ? (
              <div className="mt-6 flex justify-start">
                <div className="flex items-end gap-2">
                  <span className="mb-0.5 grid h-7 w-7 place-items-center rounded-xl border border-white/10 bg-white/5 text-violet-200/70">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1 rounded-[1.25rem] rounded-bl-md border border-white/10 bg-white/[0.07] px-4 py-3">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/45"
                        style={{ animationDelay: `${dot * 140}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={scrollAnchorRef} />
          </div>

          <div className="border-t border-white/10 bg-neutral-950/45 p-3 backdrop-blur-2xl sm:p-4">
            {error ? (
              <p
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-200"
              >
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <form
              onSubmit={sendMessage}
              className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2 shadow-inner shadow-black/20 transition focus-within:border-violet-300/30 focus-within:ring-4 focus-within:ring-violet-400/[0.07]"
            >
              <label htmlFor="agent-message" className="sr-only">
                Message Life OS Copilot
              </label>
              <textarea
                ref={composerRef}
                id="agent-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                maxLength={4000}
                disabled={isSending}
                placeholder="ask your copilot anything"
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-5 text-white outline-none placeholder:text-white/25 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                aria-label="Send message"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-400 text-neutral-950 shadow-lg shadow-violet-950/30 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/25 disabled:shadow-none"
              >
                {isSending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] text-white/20">
              enter to send / shift + enter for a new line
            </p>
          </div>
        </section>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        onHistoryCleared={clearLocalChatHistory}
      />
    </>
  );
}
