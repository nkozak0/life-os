"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const calendarScope =
  "https://www.googleapis.com/auth/calendar.readonly";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/calendar";
  }

  return value;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
      ? "Google sign-in could not be completed. Please try again."
      : null,
  );

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set(
        "next",
        safeNextPath(searchParams.get("next")),
      );

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: calendarScope,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (signInError) throw signInError;
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to start Google sign-in.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950 text-neutral-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_76%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[12%] top-[8%] size-[28rem] rounded-full bg-indigo-500/10 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[4%] right-[10%] size-80 rounded-full bg-emerald-400/[0.07] blur-[120px]"
      />

      <main className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-16 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-12">
        <motion.section
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:block"
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/[0.08] px-3 py-1.5 text-xs font-medium text-indigo-200 backdrop-blur-xl">
            <Sparkles aria-hidden="true" className="size-3.5" />
            A calmer way to run your week
          </div>
          <h1 className="max-w-2xl text-6xl font-semibold tracking-[-0.065em] text-white xl:text-7xl">
            Everything that matters, in one rhythm.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-400">
            Bring coursework, time, and training together without adding more
            noise to your day.
          </p>

          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            {[
              "Your calendar stays read-only",
              "Your data stays separated",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm text-neutral-300 backdrop-blur-xl"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: 0.08,
            duration: 0.65,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mx-auto w-full max-w-md"
        >
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-9">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] shadow-inner shadow-white/5">
                <CalendarDays
                  aria-hidden="true"
                  className="size-5 text-indigo-300"
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-white">
                  Life OS
                </p>
                <p className="text-xs text-neutral-500">Your day, connected</p>
              </div>
            </div>

            <div className="mt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Welcome
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-white">
                Sign in to continue
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Connect your Google account to see your upcoming calendar
                events alongside the rest of your life.
              </p>
            </div>

            <motion.button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              whileHover={isLoading ? undefined : { y: -2 }}
              whileTap={isLoading ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
              className="group mt-8 flex w-full items-center justify-between rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-neutral-950 shadow-xl shadow-black/20 outline-none transition-colors hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-65"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs font-bold text-blue-600">
                  G
                </span>
                {isLoading ? "Opening Google…" : "Sign in with Google"}
              </span>
              {isLoading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin text-neutral-500"
                />
              ) : (
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-neutral-500 transition-transform group-hover:translate-x-0.5"
                />
              )}
            </motion.button>

            <div aria-live="polite" className="mt-4 min-h-6">
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 text-sm leading-5 text-rose-300"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {error}
                </motion.p>
              )}
            </div>

            <div className="mt-6 flex items-start gap-3 border-t border-white/[0.08] pt-6">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-emerald-300"
              />
              <p className="text-xs leading-5 text-neutral-500">
                Calendar access is read-only. Life OS cannot create, edit, or
                delete your Google Calendar events.
              </p>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950">
      <LoaderCircle
        aria-label="Loading sign in"
        className="size-6 animate-spin text-indigo-300"
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
