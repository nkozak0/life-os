import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Navigation } from "@/components/navigation";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Life OS",
    template: "%s · Life OS",
  },
  description: "One focused place for coursework, time, and training.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-50 antialiased">
        <div className="relative min-h-screen overflow-x-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none fixed -left-32 -top-32 size-96 rounded-full bg-indigo-500/[0.08] blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed -bottom-40 -right-24 size-96 rounded-full bg-emerald-400/[0.05] blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
          />

          <Navigation />

          <main className="relative min-h-screen px-5 pb-28 pt-8 sm:px-8 lg:ml-28 lg:px-12 lg:pb-12 lg:pt-12">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
