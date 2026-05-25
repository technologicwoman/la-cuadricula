/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface Habits {
  movement: boolean;
  substance: boolean;
  french: boolean;
  poetry: boolean;
  meditation: boolean;
}

export interface WeeklyData {
  checks: Record<DayName, Habits>;
  bossBattle: string;
  bossDefeated: boolean;
  financeChecked: boolean;
  themes: Record<DayName, string>;
  notes: string;
}

export interface LifetimeData {
  lifetimeGym: number;
  cleanDaysTotal: number;
  bossChain: number;
}

export interface Foundation {
  id: keyof Habits;
  label: string;
  icon: string;
  description: string;
}

export interface RewardThreshold {
  days: number;
  reward: string;
  icon: string;
  description: string;
}
