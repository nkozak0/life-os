"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CircleAlert,
  LoaderCircle,
  Send,
  Sparkles,
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "yo what are we locking in today\ncoursework workouts or job stuff",
  },
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
  const [messages, setMessages] =
    useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [isSending, messages]);

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
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.message?.trim()) {
        throw new Error(
          result.error ?? "The assistant could not respond.",
        );
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
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not respond.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/30 backdrop-blur-2xl lg:min-h-[calc(100dvh-6rem)]">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/10 px-4 py-4 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
            <Bot className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-semibold tracking-tight">
                Life OS Agent
              </h1>
              <Sparkles className="h-3.5 w-3.5 text-violet-300/70" />
            </div>
            <p className="mt-0.5 text-xs text-white/35">
              coursework · career · training
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-200/70">
          online
        </span>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5"
        aria-live="polite"
      >
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
                messageIndex === 0
                  ? ""
                  : senderChanged
                    ? "mt-6"
                    : "mt-2"
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
            Message Life OS Agent
          </label>
          <textarea
            id="agent-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            maxLength={4000}
            disabled={isSending}
            placeholder="what are we working on"
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
          enter to send · shift + enter for a new line
        </p>
      </div>
    </section>
  );
}
