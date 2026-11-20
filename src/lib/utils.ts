import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a timestamp as a short, locale-aware time (e.g. "3:42 PM"). */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Lightweight, dependency-free unique id for client-side message keys. */
export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}
