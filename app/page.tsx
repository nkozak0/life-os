import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function HomePage() {
  return (
    <section className="flex min-h-[calc(100vh-8rem)] items-center">
      <div className="max-w-3xl">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
          Life OS
        </p>
        <h1 className="text-5xl font-semibold tracking-[-0.055em] text-white sm:text-7xl">
          Your life, in focus.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
          A calm home for your coursework, schedule, and training.
        </p>
        <Link
          href="/assignments"
          className="mt-9 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          View assignments
          <ArrowUpRight aria-hidden="true" className="size-4 text-indigo-300" />
        </Link>
      </div>
    </section>
  );
}
