/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Foundation, Habits, RewardThreshold, DayName, WeeklyData, LifetimeData } from "./types";

export const DAYS: DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const FOUNDATIONS: Foundation[] = [
  {
    id: "movement",
    label: "Movement",
    icon: "🔥",
    description: "Gym 7:45 AM",
  },
  {
    id: "substance",
    label: "Substance",
    icon: "🌿",
    description: "No alcohol, weed after noon",
  },
  {
    id: "french",
    label: "Français",
    icon: "🇫🇷",
    description: "Any practice",
  },
  {
    id: "poetry",
    label: "Poetry",
    icon: "✒️",
    description: "Even 2 lines",
  },
  {
    id: "meditation",
    label: "Meditation",
    icon: "◉",
    description: "Not autopilot",
  },
];

export const REWARDS: RewardThreshold[] = [
  { days: 3, reward: "Starbucks coffee", icon: "☕", description: "3 Gym Days Reach" },
  { days: 6, reward: "New track / album", icon: "🎵", description: "6 Gym Days Perfect" },
  { days: 12, reward: "Wishlist reward", icon: "🎁", description: "12 Gym Days Elite" },
  { days: 18, reward: "Experience reward", icon: "✨", description: "18 Theme Warrior" },
  { days: 24, reward: "Major unlock", icon: "👑", description: "24 Legend status" },
];

export const DEFAULT_THEMES: Record<DayName, string> = {
  Mon: "BDO + Overflow",
  Tue: "THEM",
  Wed: "KonTech",
  Thu: "French Deep + Poetry",
  Fri: "Finance + Admin",
  Sat: "Creative / Flex",
  Sun: "Review + Plan",
};

export function createEmptyWeeklyData(): WeeklyData {
  const emptyChecks: Record<DayName, Habits> = {} as Record<DayName, Habits>;
  DAYS.forEach((day) => {
    emptyChecks[day] = {
      movement: false,
      substance: false,
      french: false,
      poetry: false,
      meditation: false,
    };
  });

  return {
    checks: emptyChecks,
    bossBattle: "",
    bossDefeated: false,
    financeChecked: false,
    themes: { ...DEFAULT_THEMES },
    notes: "",
  };
}

export const DEFAULT_LIFETIME_DATA: LifetimeData = {
  lifetimeGym: 0,
  cleanDaysTotal: 0,
  bossChain: 0,
};

/**
 * Calculates Monday of the given date's week and returns it as a Date object.
 */
export function getMondayOfDate(date: Date): Date {
  const newDate = new Date(date.getTime());
  const day = newDate.getDay();
  // Adjust so Monday is first day of week
  const diff = newDate.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(newDate.setDate(diff));
}

/**
 * Generates the week-YYYY-MM-DD key for a given date
 */
export function getWeekKey(date: Date): string {
  const monday = getMondayOfDate(date);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `week-${yyyy}-${mm}-${dd}`;
}

/**
 * Formatting dates for header: "May 18 — May 24, 2026" using en-CA locale as requested.
 */
export function formatWeekRange(date: Date): string {
  const monday = getMondayOfDate(date);
  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);

  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const formatter = new Intl.DateTimeFormat("en-CA", options);

  const startStr = formatter.format(monday);
  const endStr = formatter.format(sunday);
  const yearStr = monday.getFullYear();

  return `${startStr} — ${endStr}, ${yearStr}`;
}
