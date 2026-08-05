"use client";

import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Dumbbell,
  Flame,
  LoaderCircle,
  LogOut,
  Save,
  Scale,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type RoastLevel = "gentle" | "standard" | "unhinged";
type CalendarView = "day" | "week" | "month";
type WeightUnit = "lbs" | "kg";

type SettingsFormState = {
  preferredName: string;
  currentFocus: string;
  roastLevel: RoastLevel;
  calendarView: CalendarView;
  semesterStart: string;
  semesterEnd: string;
  weightUnit: WeightUnit;
  defaultRestSeconds: string;
};

type SettingsApiResponse = {
  settings?: {
    preferred_name?: string;
    current_focus?: string;
    accountability_roast_level?: RoastLevel;
    default_calendar_view?: CalendarView;
    semester_start?: string;
    semester_end?: string;
    weight_unit?: WeightUnit;
    default_rest_seconds?: number;
  };
  error?: string;
};

type PushCapability = {
  checked: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  isSupported: boolean;
};

const initialSettings: SettingsFormState = {
  preferredName: "",
  currentFocus: "",
  roastLevel: "standard",
  calendarView: "month",
  semesterStart: "",
  semesterEnd: "",
  weightUnit: "lbs",
  defaultRestSeconds: "90",
};

const inputClassName =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-300/40 focus:ring-4 focus:ring-indigo-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  accentClassName = "border-indigo-300/15 bg-indigo-300/[0.08] text-indigo-200",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
  accentClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20 backdrop-blur-xl">
      <header className="flex items-start gap-3 border-b border-white/[0.08] px-4 py-5 sm:px-6">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${accentClassName}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-white/40">
            {description}
          </p>
        </div>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-sm font-medium text-white/70"
    >
      {children}
    </label>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-8 w-14 shrink-0 rounded-full border transition ${
        checked
          ? "border-emerald-300/30 bg-emerald-400/70"
          : "border-white/10 bg-white/10"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span
        className={`absolute top-1 size-6 rounded-full bg-white shadow-lg transition-[left] duration-200 ${
          checked ? "left-7" : "left-1"
        }`}
      />
    </button>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading settings">
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          className="animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-5"
        >
          <div className="h-5 w-40 rounded bg-white/10" />
          <div className="mt-3 h-4 w-64 max-w-full rounded bg-white/[0.06]" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="h-12 rounded-2xl bg-white/[0.06]" />
            <div className="h-12 rounded-2xl bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function detectPushCapability(): PushCapability {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;

  return {
    checked: true,
    isIOS,
    isStandalone,
    isSupported:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  };
}

function normalizeSettings(
  data: SettingsApiResponse["settings"],
): SettingsFormState {
  return {
    preferredName: data?.preferred_name ?? "",
    currentFocus: data?.current_focus ?? "",
    roastLevel: data?.accountability_roast_level ?? "standard",
    calendarView: data?.default_calendar_view ?? "month",
    semesterStart: data?.semester_start ?? "",
    semesterEnd: data?.semester_end ?? "",
    weightUnit: data?.weight_unit ?? "lbs",
    defaultRestSeconds: String(
      data?.default_rest_seconds ?? 90,
    ),
  };
}

export default function SettingsClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [settings, setSettings] =
    useState<SettingsFormState>(initialSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isClearingHistory, setIsClearingHistory] =
    useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pushCapability, setPushCapability] =
    useState<PushCapability>({
      checked: false,
      isIOS: false,
      isStandalone: false,
      isSupported: false,
    });
  const [notificationsEnabled, setNotificationsEnabled] =
    useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] =
    useState(true);
  const [notificationError, setNotificationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    async function loadPage() {
      setIsLoading(true);
      setPageError(null);

      try {
        const [userResult, settingsResponse] = await Promise.all([
          supabase.auth.getUser(),
          fetch("/api/settings", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (userResult.error || !userResult.data.user) {
          router.replace("/login");
          return;
        }

        const settingsResult =
          (await settingsResponse.json().catch(() => ({}))) as
            SettingsApiResponse;

        if (!settingsResponse.ok) {
          throw new Error(
            settingsResult.error ?? "Settings could not be loaded.",
          );
        }

        if (!isActive) {
          return;
        }

        setEmail(userResult.data.user.email ?? "Signed-in user");
        setSettings(normalizeSettings(settingsResult.settings));
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (isActive) {
          setPageError(
            error instanceof Error
              ? error.message
              : "Settings could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [router, supabase]);

  useEffect(() => {
    let isActive = true;

    async function initializePush() {
      const capability = detectPushCapability();
      setPushCapability(capability);
      setIsUpdatingNotifications(true);

      if (
        !capability.isSupported ||
        (capability.isIOS && !capability.isStandalone)
      ) {
        setIsUpdatingNotifications(false);
        return;
      }

      try {
        const registration =
          await navigator.serviceWorker.register("/sw.js");
        const subscription =
          await registration.pushManager.getSubscription();

        if (isActive) {
          setNotificationsEnabled(Boolean(subscription));
        }
      } catch (error) {
        if (isActive) {
          setNotificationError(
            error instanceof Error
              ? error.message
              : "Notification status could not be checked.",
          );
        }
      } finally {
        if (isActive) {
          setIsUpdatingNotifications(false);
        }
      }
    }

    void initializePush();

    return () => {
      isActive = false;
    };
  }, []);

  const updateSetting = <Key extends keyof SettingsFormState>(
    key: Key,
    value: SettingsFormState[Key],
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
    setNotice(null);
    setPageError(null);
  };

  const saveSettings = async () => {
    if (isSaving) {
      return;
    }

    const restSeconds = Number(settings.defaultRestSeconds);

    if (
      !Number.isInteger(restSeconds) ||
      restSeconds < 15 ||
      restSeconds > 900
    ) {
      setPageError(
        "Default rest timer must be between 15 and 900 seconds.",
      );
      return;
    }

    if (
      settings.semesterStart &&
      settings.semesterEnd &&
      settings.semesterEnd < settings.semesterStart
    ) {
      setPageError(
        "Semester end must be on or after semester start.",
      );
      return;
    }

    setIsSaving(true);
    setPageError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferred_name: settings.preferredName,
          current_focus: settings.currentFocus,
          accountability_roast_level: settings.roastLevel,
          default_calendar_view: settings.calendarView,
          semester_start: settings.semesterStart,
          semester_end: settings.semesterEnd,
          weight_unit: settings.weightUnit,
          default_rest_seconds: restSeconds,
        }),
      });
      const result =
        (await response.json().catch(() => ({}))) as
          SettingsApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ?? "Settings could not be saved.",
        );
      }

      setSettings(normalizeSettings(result.settings));
      setNotice("Your settings are up to date");
      router.refresh();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleNotifications = async () => {
    if (
      isUpdatingNotifications ||
      !pushCapability.isSupported ||
      (pushCapability.isIOS && !pushCapability.isStandalone)
    ) {
      return;
    }

    setIsUpdatingNotifications(true);
    setNotificationError(null);

    try {
      const registration =
        await navigator.serviceWorker.register("/sw.js");
      const existingSubscription =
        await registration.pushManager.getSubscription();

      if (notificationsEnabled) {
        if (existingSubscription) {
          const response = await fetch(
            "/api/push-subscriptions",
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                endpoint: existingSubscription.endpoint,
              }),
            },
          );
          const result = (await response
            .json()
            .catch(() => ({}))) as {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(
              result.error ??
                "Notifications could not be disabled.",
            );
          }

          await existingSubscription.unsubscribe();
        }

        setNotificationsEnabled(false);
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error(
          "Notification permission was not granted. You can change it in your browser settings.",
        );
      }

      const vapidPublicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        throw new Error(
          "Push notifications are not configured on this server.",
        );
      }

      let subscription = existingSubscription;
      let createdSubscription = false;

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(vapidPublicKey),
        });
        createdSubscription = true;
      }

      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription.toJSON()),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        if (createdSubscription) {
          await subscription.unsubscribe();
        }

        throw new Error(
          result.error ?? "Notifications could not be enabled.",
        );
      }

      setNotificationsEnabled(true);
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Notifications could not be updated.",
      );
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  const signOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setPageError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setPageError(error.message);
      setIsSigningOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  };

  const clearChatHistory = async () => {
    if (
      isClearingHistory ||
      !window.confirm(
        "Clear all AI chat history? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsClearingHistory(true);
    setPageError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ?? "Chat history could not be cleared.",
        );
      }

      setNotice("AI chat history cleared");
      router.refresh();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Chat history could not be cleared.",
      );
    } finally {
      setIsClearingHistory(false);
    }
  };

  const pushBlockedOnIOS =
    pushCapability.checked &&
    pushCapability.isIOS &&
    !pushCapability.isStandalone;
  const pushUnavailable =
    pushCapability.checked && !pushCapability.isSupported;

  return (
    <div className="mx-auto w-full max-w-4xl pb-8">
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/15 bg-indigo-300/[0.07] px-3 py-1.5 text-xs font-medium text-indigo-200/80">
            <Settings className="size-3.5" />
            Personalize Life OS
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">
            Tune your copilot, trackers, account, and device
            experience
          </p>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={isLoading || isSaving}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:w-auto"
        >
          {isSaving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {isSaving ? "Saving…" : "Save Changes"}
        </button>
      </header>

      <div aria-live="polite" className="mb-5 space-y-3">
        {pageError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {pageError}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            {notice}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <div className="space-y-5">
          <SectionCard
            icon={UserRound}
            title="Account & Profile"
            description="Your connected Google identity and session"
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/30">
                  Signed in as
                </p>
                <p className="mt-1.5 truncate text-sm font-medium text-white/80">
                  {email}
                </p>
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={isSigningOut}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {isSigningOut ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}
                {isSigningOut ? "Signing Out…" : "Sign Out"}
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={BellRing}
            title="Notifications & PWA"
            description="Receive accountability reminders on this device"
            accentClassName="border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-200"
          >
            {pushBlockedOnIOS ? (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100/85">
                <Smartphone className="mt-0.5 size-5 shrink-0 text-amber-200" />
                <p>
                  You must &apos;Add to Home Screen&apos; via Safari
                  to enable push notifications.
                </p>
              </div>
            ) : null}

            {pushUnavailable && !pushBlockedOnIOS ? (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100/85">
                <CircleAlert className="mt-0.5 size-5 shrink-0" />
                <p>
                  Web Push is not supported by this browser or
                  device.
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/80">
                  Web Push Notifications
                </p>
                <p className="mt-1 text-xs leading-5 text-white/35">
                  {notificationsEnabled
                    ? "Enabled for this device"
                    : "Get reminders even when Life OS is closed"}
                </p>
              </div>
              {isUpdatingNotifications ? (
                <span className="grid h-8 w-14 place-items-center">
                  <LoaderCircle className="size-4 animate-spin text-white/45" />
                </span>
              ) : (
                <ToggleSwitch
                  checked={notificationsEnabled}
                  disabled={
                    pushBlockedOnIOS || pushUnavailable
                  }
                  label="Toggle Web Push Notifications"
                  onChange={toggleNotifications}
                />
              )}
            </div>

            {notificationError ? (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 text-xs leading-5 text-red-300"
              >
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                {notificationError}
              </p>
            ) : null}

            {!pushBlockedOnIOS &&
            !pushUnavailable &&
            pushCapability.checked ? (
              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/30">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-300/65" />
                Permission is requested by your device only when you
                turn notifications on
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            icon={Bot}
            title="AI Copilot Preferences"
            description="Shape how your accountability partner talks to you"
            accentClassName="border-violet-300/15 bg-violet-300/[0.08] text-violet-200"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="settings-preferred-name">
                  Preferred Name
                </FieldLabel>
                <input
                  id="settings-preferred-name"
                  value={settings.preferredName}
                  onChange={(event) =>
                    updateSetting(
                      "preferredName",
                      event.target.value,
                    )
                  }
                  maxLength={80}
                  placeholder="e.g., Nico"
                  className={inputClassName}
                />
              </div>
              <div>
                <FieldLabel htmlFor="settings-roast-level">
                  Accountability Roast Level
                </FieldLabel>
                <div className="relative">
                  <select
                    id="settings-roast-level"
                    value={settings.roastLevel}
                    onChange={(event) =>
                      updateSetting(
                        "roastLevel",
                        event.target.value as RoastLevel,
                      )
                    }
                    className={`${inputClassName} appearance-none pr-11`}
                  >
                    <option value="gentle">Gentle</option>
                    <option value="standard">Standard</option>
                    <option value="unhinged">Unhinged</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="settings-current-focus">
                  Current Focus
                </FieldLabel>
                <textarea
                  id="settings-current-focus"
                  value={settings.currentFocus}
                  onChange={(event) =>
                    updateSetting(
                      "currentFocus",
                      event.target.value,
                    )
                  }
                  rows={4}
                  maxLength={600}
                  placeholder="e.g., engineering student at Lee University balancing diff eq, work, and workouts"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-indigo-300/40 focus:ring-4 focus:ring-indigo-400/[0.08]"
                />
                <p className="mt-1.5 text-right text-[11px] text-white/25">
                  {settings.currentFocus.length}/600
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-violet-300/10 bg-violet-300/[0.04] p-4">
              <Flame className="mt-0.5 size-4 shrink-0 text-violet-300/70" />
              <p className="text-xs leading-5 text-white/35">
                Unhinged increases the intensity and playful callouts,
                but never allows abusive or unsafe responses
              </p>
            </div>
          </SectionCard>

          <SectionCard
            icon={CalendarDays}
            title="Assignments & Calendar"
            description="Set the defaults for your academic timeline"
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <FieldLabel htmlFor="default-calendar-view">
                  Default Calendar View
                </FieldLabel>
                <div className="relative">
                  <select
                    id="default-calendar-view"
                    value={settings.calendarView}
                    onChange={(event) =>
                      updateSetting(
                        "calendarView",
                        event.target.value as CalendarView,
                      )
                    }
                    className={`${inputClassName} appearance-none pr-11`}
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="semester-start">
                  Semester Start
                </FieldLabel>
                <input
                  id="semester-start"
                  type="date"
                  value={settings.semesterStart}
                  onChange={(event) =>
                    updateSetting(
                      "semesterStart",
                      event.target.value,
                    )
                  }
                  className={`${inputClassName} [color-scheme:dark]`}
                />
              </div>
              <div>
                <FieldLabel htmlFor="semester-end">
                  Semester End
                </FieldLabel>
                <input
                  id="semester-end"
                  type="date"
                  min={settings.semesterStart || undefined}
                  value={settings.semesterEnd}
                  onChange={(event) =>
                    updateSetting(
                      "semesterEnd",
                      event.target.value,
                    )
                  }
                  className={`${inputClassName} [color-scheme:dark]`}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Dumbbell}
            title="Workout Tracker"
            description="Choose your preferred logging defaults"
            accentClassName="border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200"
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-white/70">
                  Preferred Weight Unit
                </p>
                <div
                  className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/15 p-1"
                  aria-label="Preferred weight unit"
                >
                  {(["lbs", "kg"] as WeightUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      aria-pressed={settings.weightUnit === unit}
                      onClick={() =>
                        updateSetting("weightUnit", unit)
                      }
                      className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold uppercase transition ${
                        settings.weightUnit === unit
                          ? "bg-white/10 text-cyan-200 shadow-sm"
                          : "text-white/35 hover:text-white/60"
                      }`}
                    >
                      <Scale className="size-3.5" />
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="default-rest-timer">
                  Default Rest Timer
                </FieldLabel>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                  <input
                    id="default-rest-timer"
                    type="number"
                    inputMode="numeric"
                    min={15}
                    max={900}
                    step={5}
                    value={settings.defaultRestSeconds}
                    onChange={(event) =>
                      updateSetting(
                        "defaultRestSeconds",
                        event.target.value,
                      )
                    }
                    className={`${inputClassName} pl-11 pr-20`}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30">
                    seconds
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          <section className="overflow-hidden rounded-3xl border border-red-400/20 bg-red-500/[0.045] shadow-xl shadow-black/20 backdrop-blur-xl">
            <header className="flex items-start gap-3 border-b border-red-400/15 px-4 py-5 sm:px-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-red-300/20 bg-red-300/[0.08] text-red-200">
                <CircleAlert className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold tracking-tight text-red-100">
                  Danger Zone
                </h2>
                <p className="mt-1 text-sm leading-5 text-red-100/45">
                  Permanent and account-level actions
                </p>
              </div>
            </header>
            <div className="divide-y divide-red-400/10">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="text-sm font-medium text-white/80">
                    Clear AI Chat History
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/35">
                    Permanently delete all saved conversations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearChatHistory}
                  disabled={isClearingHistory}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                >
                  {isClearingHistory ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {isClearingHistory
                    ? "Clearing…"
                    : "Clear History"}
                </button>
              </div>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="text-sm font-medium text-white/80">
                    Delete Account
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/35">
                    Account deletion is not available yet
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  title="Account deletion is coming soon"
                  className="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[0.04] px-4 py-2.5 text-sm font-semibold text-red-200/35 sm:w-auto"
                >
                  <Trash2 className="size-4" />
                  Delete Account
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
