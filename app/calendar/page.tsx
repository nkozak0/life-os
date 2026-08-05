"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { createClient } from "@/lib/supabase/client";

type CalendarView = "day" | "week" | "month";

type EventDateValue =
  | string
  | {
      date?: string;
      dateTime?: string;
      timeZone?: string;
    };

type CalendarEvent = {
  id: string;
  title?: string;
  summary?: string;
  start?: EventDateValue;
  end?: EventDateValue;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  allDay?: boolean;
  calendarId?: string;
  calendarName?: string;
  calendarColor?: string;
  htmlLink?: string;
};

type CalendarPayload = {
  events?: CalendarEvent[];
  error?: string;
  code?: string;
};

type CalendarOption = {
  name: string;
  color?: string;
};

const HOUR_HEIGHT = 64;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const VIEW_OPTIONS: CalendarView[] = ["day", "week", "month"];
const FALLBACK_CALENDAR = "Google Calendar";
const FALLBACK_COLOR = "#818cf8";
const GOOGLE_CALENDAR_RECONNECT_REQUIRED = "GOOGLE_CALENDAR_RECONNECT_REQUIRED";
const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

class CalendarRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CalendarRequestError";
  }
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError")
  );
}

function getDateValue(value?: EventDateValue) {
  if (!value) return undefined;
  if (typeof value === "string") return value;

  return value.dateTime ?? value.date;
}

function getEventStart(event: CalendarEvent) {
  return event.startTime ?? getDateValue(event.start);
}

function getEventEnd(event: CalendarEvent) {
  return event.endTime ?? getDateValue(event.end);
}

function getCalendarName(event: CalendarEvent) {
  return event.calendarName?.trim() || FALLBACK_CALENDAR;
}

function isAllDayEvent(event: CalendarEvent) {
  if (typeof event.isAllDay === "boolean") return event.isAllDay;
  if (typeof event.allDay === "boolean") return event.allDay;

  if (typeof event.start === "object" && event.start) {
    return Boolean(event.start.date && !event.start.dateTime);
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(getEventStart(event) ?? "");
}

function toDate(value?: string) {
  if (!value) return null;

  const date =
    value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventStartDate(event: CalendarEvent) {
  return toDate(getEventStart(event));
}

function getEventTitle(event: CalendarEvent) {
  return event.title?.trim() || event.summary?.trim() || "Untitled event";
}

function formatEventTime(event: CalendarEvent) {
  if (isAllDayEvent(event)) return "All Day";

  const date = getEventStartDate(event);
  if (!date) return "Time TBD";

  return format(date, "h:mm a");
}

function normalizeColor(color?: string) {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

function eventBlockStyle(color?: string): CSSProperties {
  const safeColor = normalizeColor(color) ?? FALLBACK_COLOR;

  return {
    borderColor: `${safeColor}a6`,
    backgroundColor: `${safeColor}2b`,
    boxShadow: `inset 3px 0 0 ${safeColor}`,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Your calendars could not be loaded. Please try again.";
}

function CalendarSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading calendar">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
        {Array.from({ length: 28 }, (_, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(index * 0.018, 0.3) }}
            className="h-28 bg-neutral-950/70 p-3"
          >
            <div className="size-5 animate-pulse rounded-full bg-white/[0.08]" />
            {index % 3 === 0 && (
              <div className="mt-5 h-5 animate-pulse rounded-md bg-white/[0.06]" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CalendarSidebar({
  calendars,
  activeCalendars,
  isLoading,
  onToggle,
  onToggleAll,
}: {
  calendars: CalendarOption[];
  activeCalendars: Set<string>;
  isLoading: boolean;
  onToggle: (name: string) => void;
  onToggleAll: () => void;
}) {
  const allActive =
    calendars.length > 0 &&
    calendars.every((calendar) => activeCalendars.has(calendar.name));

  return (
    <aside className="w-full shrink-0 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg lg:w-60">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            My calendars
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Filter what is visible
          </p>
        </div>
        {calendars.length > 0 && (
          <button
            type="button"
            onClick={onToggleAll}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            {allActive ? "Hide all" : "Show all"}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        {isLoading &&
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-2.5"
            >
              <span className="size-4 rounded bg-white/[0.08]" />
              <span className="h-3 flex-1 rounded-full bg-white/[0.06]" />
            </div>
          ))}

        {!isLoading && calendars.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs leading-5 text-neutral-600">
            Connected calendars will appear here.
          </p>
        )}

        {!isLoading &&
          calendars.map((calendar) => {
            const active = activeCalendars.has(calendar.name);
            const safeColor = normalizeColor(calendar.color) ?? FALLBACK_COLOR;

            return (
              <motion.button
                key={calendar.name}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => onToggle(calendar.name)}
                whileTap={{ scale: 0.98 }}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded border transition-all"
                  style={{
                    borderColor: safeColor,
                    backgroundColor: active ? safeColor : "transparent",
                    color: active ? "#0a0a0a" : safeColor,
                  }}
                >
                  {active && (
                    <Check
                      aria-hidden="true"
                      className="size-3"
                      strokeWidth={3}
                    />
                  )}
                </span>
                <span
                  className={`min-w-0 truncate text-sm transition-colors ${
                    active ? "text-neutral-200" : "text-neutral-600"
                  }`}
                >
                  {calendar.name}
                </span>
              </motion.button>
            );
          })}
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-4">
        <div className="flex items-start gap-2.5 px-1">
          <Sparkles
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-indigo-300"
          />
          <p className="text-[11px] leading-5 text-neutral-600">
            Changes here only affect this view. Your Google calendars remain
            untouched.
          </p>
        </div>
      </div>
    </aside>
  );
}

function MonthView({
  currentDate,
  events,
  onSelectDay,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectDay: (date: Date) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(currentDate));
  const gridEnd = endOfWeek(endOfMonth(currentDate));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdayLabels = days.slice(0, 7);

  return (
    <div className="overflow-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-7 border-b border-white/10 bg-black/10">
          {weekdayLabels.map((day) => (
            <div
              key={day.toISOString()}
              className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500"
            >
              {format(day, "EEE")}
            </div>
          ))}
        </div>

        <div className="grid min-h-[690px] grid-cols-7 auto-rows-fr bg-white/10">
          {days.map((day) => {
            const dayEvents = events.filter((event) => {
              const eventDate = getEventStartDate(event);
              return eventDate ? isSameDay(eventDate, day) : false;
            });

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelectDay(day)}
                className={`group min-h-28 border-b border-r border-neutral-950/80 p-2 text-left outline-none transition-colors hover:bg-white/[0.045] focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70 ${
                  isSameMonth(day, currentDate)
                    ? "bg-neutral-950/75"
                    : "bg-neutral-950/90"
                }`}
              >
                <span
                  className={`ml-auto flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                    isToday(day)
                      ? "bg-indigo-400 text-neutral-950 shadow-lg shadow-indigo-500/20"
                      : isSameMonth(day, currentDate)
                        ? "text-neutral-300"
                        : "text-neutral-700"
                  }`}
                >
                  {format(day, "d")}
                </span>

                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((event, index) => (
                    <motion.div
                      key={`${getCalendarName(event)}-${event.id}-${index}`}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.03, 0.09) }}
                      className="flex items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-1 text-[10px] font-medium text-neutral-100 backdrop-blur-sm"
                      style={eventBlockStyle(event.calendarColor)}
                    >
                      {!isAllDayEvent(event) && (
                        <span className="shrink-0 opacity-70">
                          {formatEventTime(event)}
                        </span>
                      )}
                      <span className="truncate">{getEventTitle(event)}</span>
                    </motion.div>
                  ))}

                  {dayEvents.length > 3 && (
                    <p className="px-1 text-[10px] font-medium text-neutral-500">
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeGridView({
  currentDate,
  view,
  events,
  onSelectDay,
}: {
  currentDate: Date;
  view: "day" | "week";
  events: CalendarEvent[];
  onSelectDay: (date: Date) => void;
}) {
  const days =
    view === "week"
      ? eachDayOfInterval({
          start: startOfWeek(currentDate),
          end: endOfWeek(currentDate),
        })
      : [startOfDay(currentDate)];
  const columnTemplate = `4rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto">
      <div className="w-full min-w-0">
        <div
          className="sticky top-0 z-30 grid w-full min-w-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur-xl"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          <div className="w-16 border-r border-white/10" />
          {days.map((day) => (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className="min-w-0 border-r border-white/[0.07] px-1 py-3 text-center outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70 sm:px-2"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                {format(day, "EEE")}
              </span>
              <span
                className={`mx-auto mt-1 flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                  isToday(day)
                    ? "bg-indigo-400 text-neutral-950"
                    : "text-neutral-200"
                }`}
              >
                {format(day, "d")}
              </span>
            </button>
          ))}
        </div>

        <div
          className="grid min-h-14 w-full min-w-0 border-b border-white/10 bg-black/10"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          <div className="flex w-16 items-center justify-end border-r border-white/10 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-600">
            All day
          </div>
          {days.map((day) => {
            const allDayEvents = events.filter((event) => {
              const eventDate = getEventStartDate(event);
              return (
                eventDate && isAllDayEvent(event) && isSameDay(eventDate, day)
              );
            });

            return (
              <div
                key={day.toISOString()}
                className="min-h-14 min-w-0 space-y-1 overflow-hidden border-r border-white/[0.07] p-1"
              >
                {allDayEvents.map((event, index) => (
                  <motion.div
                    key={`${getCalendarName(event)}-${event.id}-${index}`}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="truncate rounded-md border px-2 py-1 text-[10px] font-medium text-neutral-100"
                    style={eventBlockStyle(event.calendarColor)}
                    title={getEventTitle(event)}
                  >
                    {getEventTitle(event)}
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="relative" style={{ height: DAY_HEIGHT }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="pointer-events-none absolute inset-x-0"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2.5 left-0 w-16 pr-2 text-right text-[10px] text-neutral-600">
                {format(setHours(startOfDay(currentDate), hour), "h a")}
              </span>
              <div className="ml-16 border-t border-white/[0.065]" />
            </div>
          ))}

          <div
            className="absolute inset-y-0 left-16 right-0 grid min-w-0"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            {days.map((day) => {
              const timedEvents = events.filter((event) => {
                const eventDate = getEventStartDate(event);
                return (
                  eventDate &&
                  !isAllDayEvent(event) &&
                  isSameDay(eventDate, day)
                );
              });

              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-r border-white/[0.07] ${
                    isToday(day) ? "bg-indigo-400/[0.018]" : ""
                  }`}
                >
                  {isToday(day) && <CurrentTimeLine />}

                  {timedEvents.map((event, index) => {
                    const start = getEventStartDate(event);
                    if (!start) return null;

                    const end = toDate(getEventEnd(event));
                    const startMinutes =
                      getHours(start) * 60 + getMinutes(start);
                    const rawDuration = end
                      ? differenceInMinutes(end, start)
                      : 60;
                    const duration = Math.max(
                      30,
                      Math.min(rawDuration, 24 * 60 - startMinutes),
                    );
                    const top = (startMinutes / 60) * HOUR_HEIGHT;
                    const height = Math.max((duration / 60) * HOUR_HEIGHT, 30);

                    return (
                      <motion.div
                        key={`${getCalendarName(event)}-${event.id}-${index}`}
                        initial={{ opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          delay: Math.min(index * 0.035, 0.24),
                          duration: 0.28,
                        }}
                        className="absolute left-1 right-1 z-10 overflow-hidden rounded-lg border px-2 py-1.5 text-neutral-100 shadow-lg shadow-black/15 backdrop-blur-sm"
                        style={{
                          ...eventBlockStyle(event.calendarColor),
                          top,
                          height,
                        }}
                        title={`${getEventTitle(event)} · ${formatEventTime(event)}`}
                      >
                        <p className="truncate text-[11px] font-semibold leading-4">
                          {getEventTitle(event)}
                        </p>
                        {height >= 44 && (
                          <p className="mt-0.5 truncate text-[10px] leading-3 text-neutral-300/75">
                            {formatEventTime(event)}
                          </p>
                        )}
                        {height >= 68 && (
                          <p className="mt-1 truncate text-[9px] font-medium uppercase tracking-[0.08em] text-neutral-300/55">
                            {getCalendarName(event)}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const now = new Date();
  const minutes = getHours(now) * 60 + getMinutes(now);
  const top = (minutes / 60) * HOUR_HEIGHT;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 border-t border-rose-400/80"
      style={{ top }}
    >
      <span className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
    </div>
  );
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresGoogleReconnect, setRequiresGoogleReconnect] = useState(false);
  const [isReconnectingGoogle, setIsReconnectingGoogle] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [activeCalendars, setActiveCalendars] = useState<Set<string>>(
    () => new Set(),
  );
  const knownCalendarsRef = useRef<Set<string>>(new Set());

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
            default_calendar_view?: CalendarView;
          };
        };
      })
      .then((payload) => {
        const defaultView = payload?.settings?.default_calendar_view;

        if (
          !controller.signal.aborted &&
          defaultView &&
          VIEW_OPTIONS.includes(defaultView)
        ) {
          setView(defaultView);
        }
      })
      .catch((settingsError) => {
        if (!isAbortError(settingsError)) {
          console.error("Default calendar view lookup failed:", settingsError);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const fetchCalendar = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/calendar", {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as
        CalendarPayload | CalendarEvent[];

      if (!response.ok) {
        const message = Array.isArray(payload)
          ? "Your calendars could not be loaded."
          : payload.error;

        throw new CalendarRequestError(
          message ?? "Your calendars could not be loaded. Please try again.",
          Array.isArray(payload) ? undefined : payload.code,
        );
      }

      const nextEvents = Array.isArray(payload)
        ? payload
        : (payload.events ?? []);

      return [...nextEvents].sort((left, right) => {
        const leftDate = toDate(getEventStart(left))?.getTime() ?? 0;
        const rightDate = toDate(getEventStart(right))?.getTime() ?? 0;

        return leftDate - rightDate;
      });
    } catch (fetchError) {
      // React Strict Mode mounts, cleans up, and mounts again in development.
      // Its cleanup abort is expected and must not become a visible UI error.
      if (isAbortError(fetchError)) {
        return null;
      }

      throw fetchError;
    }
  }, []);

  const syncCalendarFilters = useCallback((nextEvents: CalendarEvent[]) => {
    const availableCalendars = new Set(
      nextEvents.map((event) => getCalendarName(event)),
    );
    const newCalendars = [...availableCalendars].filter(
      (name) => !knownCalendarsRef.current.has(name),
    );

    knownCalendarsRef.current = availableCalendars;

    setActiveCalendars((current) => {
      const next = new Set(
        [...current].filter((name) => availableCalendars.has(name)),
      );
      newCalendars.forEach((name) => next.add(name));
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetchCalendar(controller.signal)
      .then((nextEvents) => {
        if (controller.signal.aborted || nextEvents === null) return;

        setEvents(nextEvents);
        syncCalendarFilters(nextEvents);
        setError(null);
        setRequiresGoogleReconnect(false);
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted || isAbortError(fetchError)) return;

        setError(getErrorMessage(fetchError));
        setRequiresGoogleReconnect(
          fetchError instanceof CalendarRequestError &&
            fetchError.code === GOOGLE_CALENDAR_RECONNECT_REQUIRED,
        );
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [fetchCalendar, syncCalendarFilters]);

  const refreshCalendar = () => {
    setIsLoading(true);
    setError(null);
    setRequiresGoogleReconnect(false);

    void fetchCalendar()
      .then((nextEvents) => {
        if (nextEvents === null) return;

        setEvents(nextEvents);
        syncCalendarFilters(nextEvents);
        setError(null);
        setRequiresGoogleReconnect(false);
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (isAbortError(fetchError)) return;

        setError(getErrorMessage(fetchError));
        setRequiresGoogleReconnect(
          fetchError instanceof CalendarRequestError &&
            fetchError.code === GOOGLE_CALENDAR_RECONNECT_REQUIRED,
        );
        setIsLoading(false);
      });
  };

  const reconnectGoogleCalendar = async () => {
    if (isReconnectingGoogle) {
      return;
    }

    setIsReconnectingGoogle(true);
    setError(null);

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/calendar");

      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: GOOGLE_CALENDAR_SCOPE,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (reconnectError) {
      setError(
        reconnectError instanceof Error
          ? reconnectError.message
          : "Google Calendar could not be reconnected.",
      );
      setRequiresGoogleReconnect(true);
      setIsReconnectingGoogle(false);
    }
  };

  const calendars = useMemo(() => {
    const calendarMap = new Map<string, CalendarOption>();

    events.forEach((event) => {
      const name = getCalendarName(event);
      const existing = calendarMap.get(name);

      if (!existing || (!existing.color && event.calendarColor)) {
        calendarMap.set(name, {
          name,
          color: normalizeColor(event.calendarColor),
        });
      }
    });

    return [...calendarMap.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [events]);

  const visibleEvents = useMemo(
    () => events.filter((event) => activeCalendars.has(getCalendarName(event))),
    [activeCalendars, events],
  );

  const periodLabel = useMemo(() => {
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (view === "month") return format(currentDate, "MMMM yyyy");

    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);

    return isSameMonth(weekStart, weekEnd)
      ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "d, yyyy")}`
      : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
  }, [currentDate, view]);

  const navigate = (direction: -1 | 1) => {
    setCurrentDate((date) => {
      if (view === "day") {
        return direction === 1 ? addDays(date, 1) : subDays(date, 1);
      }
      if (view === "week") {
        return direction === 1 ? addWeeks(date, 1) : subWeeks(date, 1);
      }

      return direction === 1 ? addMonths(date, 1) : subMonths(date, 1);
    });
  };

  const toggleCalendar = (name: string) => {
    setActiveCalendars((current) => {
      const next = new Set(current);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  };

  const toggleAllCalendars = () => {
    const allActive = calendars.every((calendar) =>
      activeCalendars.has(calendar.name),
    );

    setActiveCalendars(
      allActive
        ? new Set()
        : new Set(calendars.map((calendar) => calendar.name)),
    );
  };

  const selectDay = (date: Date) => {
    setCurrentDate(date);
    setView("day");
  };

  return (
    <section aria-labelledby="calendar-heading">
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.9)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Your schedule
              </p>
            </div>
            <h1
              id="calendar-heading"
              className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl"
            >
              Calendar
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-neutral-300 backdrop-blur-lg transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              Today
            </button>

            <div className="flex overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label={`Previous ${view}`}
                className="flex size-10 items-center justify-center text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label={`Next ${view}`}
                className="flex size-10 items-center justify-center border-l border-white/10 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>

            <motion.button
              type="button"
              onClick={refreshCalendar}
              disabled={isLoading}
              whileHover={isLoading ? undefined : { y: -2 }}
              whileTap={isLoading ? undefined : { scale: 0.97 }}
              aria-label="Refresh calendars"
              className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-400 backdrop-blur-lg transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </motion.button>

            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-lg">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={`relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                    view === option
                      ? "text-white"
                      : "text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  {view === option && (
                    <motion.span
                      layoutId="calendar-view"
                      className="absolute inset-0 rounded-lg border border-white/10 bg-white/10 shadow-inner shadow-white/5"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{option}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <CalendarDays aria-hidden="true" className="size-4 text-indigo-300" />
          <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-200 sm:text-xl">
            {periodLabel}
          </h2>
          {!isLoading && !error && (
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">
              {visibleEvents.length} visible
            </span>
          )}
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row">
        <CalendarSidebar
          calendars={calendars}
          activeCalendars={activeCalendars}
          isLoading={isLoading}
          onToggle={toggleCalendar}
          onToggleAll={toggleAllCalendars}
        />

        <div className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-lg">
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <CalendarSkeleton />
              </motion.div>
            )}

            {!isLoading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="m-4 flex min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-rose-400/10 bg-rose-400/[0.035] px-6 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.08] text-rose-300">
                  <AlertTriangle aria-hidden="true" className="size-5" />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  Calendar unavailable
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
                  {error}
                </p>
                <motion.button
                  type="button"
                  onClick={
                    requiresGoogleReconnect
                      ? reconnectGoogleCalendar
                      : refreshCalendar
                  }
                  disabled={isReconnectingGoogle}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {requiresGoogleReconnect ? (
                    <CalendarCheck2
                      aria-hidden="true"
                      className={`size-4 ${
                        isReconnectingGoogle ? "animate-pulse" : ""
                      }`}
                    />
                  ) : (
                    <RefreshCw aria-hidden="true" className="size-4" />
                  )}
                  {requiresGoogleReconnect
                    ? isReconnectingGoogle
                      ? "Opening Google…"
                      : "Reconnect Google Calendar"
                    : "Try again"}
                </motion.button>
              </motion.div>
            )}

            {!isLoading && !error && visibleEvents.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300">
                  <CalendarCheck2 aria-hidden="true" className="size-5" />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  Your schedule is clear
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-400">
                  No events are visible. Try enabling another calendar from the
                  sidebar.
                </p>
              </motion.div>
            )}

            {!isLoading && !error && visibleEvents.length > 0 && (
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                {view === "month" ? (
                  <MonthView
                    currentDate={currentDate}
                    events={visibleEvents}
                    onSelectDay={selectDay}
                  />
                ) : (
                  <TimeGridView
                    currentDate={currentDate}
                    view={view}
                    events={visibleEvents}
                    onSelectDay={selectDay}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[11px] text-neutral-600">
        <Clock3 aria-hidden="true" className="size-3.5" />
        Event times are displayed in your device&apos;s local time zone.
      </p>
    </section>
  );
}
