"use client";

import { motion } from "framer-motion";
import {
  CalendarDays,
  ChartBar,
  Dumbbell,
  House,
  ListTodo,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { label: "Home", href: "/", icon: House },
  { label: "Assignments", href: "/assignments", icon: ListTodo },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Workouts", href: "/workouts", icon: Dumbbell },
  { label: "Analytics", href: "/analytics", icon: ChartBar },
  { label: "Chat", href: "/chat", icon: MessageCircle },
];

export function Navigation() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl lg:bottom-auto lg:left-5 lg:top-1/2 lg:w-auto lg:max-w-none lg:-translate-x-0 lg:-translate-y-1/2 lg:rounded-3xl lg:p-2"
    >
      <div className="flex items-center justify-between gap-1 lg:flex-col lg:gap-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className="group relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-neutral-500 outline-none transition-colors hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-400/70 lg:h-14 lg:w-14 lg:flex-none lg:px-0"
            >
              {isActive && (
                <motion.span
                  layoutId="active-navigation-item"
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}

              <Icon
                aria-hidden="true"
                strokeWidth={1.8}
                className={`relative z-10 size-5 transition-transform duration-200 group-hover:scale-105 ${
                  isActive ? "text-indigo-300" : ""
                }`}
              />
              <span
                className={`relative z-10 hidden truncate text-xs font-medium sm:block sm:text-sm lg:pointer-events-none lg:absolute lg:left-[4.5rem] lg:rounded-lg lg:border lg:border-white/10 lg:bg-neutral-900/90 lg:px-2.5 lg:py-1.5 lg:text-xs lg:opacity-0 lg:shadow-xl lg:backdrop-blur-xl lg:transition-all lg:duration-200 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 ${
                  isActive ? "text-neutral-100" : ""
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
