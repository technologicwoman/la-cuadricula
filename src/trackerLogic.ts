/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DayName, WeeklyData } from "./types";
import { getWeekKey, getMondayOfDate } from "./defaultData";

/**
 * Returns a list of day indices in Javascript format (0 = Sun, 1 = Mon, ..., 6 = Sat)
 */
export const DAY_STRING_TO_INDEX: Record<DayName, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const INDEX_TO_DAY_STRING: DayName[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Computes the consecutive gym (movement) days streak backwards from today.
 * Sunday is skipped.
 * 
 * @param allWeeks Map of week keys to WeeklyData
 * @param realToday The actual real-world today's date
 */
export function calculateGymStreak(allWeeks: Record<string, WeeklyData>, realToday: Date): number {
  // Let's find out the starting point.
  // Gym days are Monday (1) to Saturday (6). Sunday (0) is a rest day.
  const todayDayIndex = realToday.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  
  // Create a list of the past gym days we need to verify, from newest to oldest
  const gymDaysToCheck: { date: Date; weekKey: string; dayKey: DayName }[] = [];
  
  // We want to generate the list of Mon-Sat dates backwards starting from either today or yesterday
  const cursorDate = new Date(realToday.getTime());
  
  // If we are currently on a day, does the streak start today or yesterday?
  // Let's look up to 40 calendar days back to find our streak
  for (let i = 0; i < 40; i++) {
    const checkDate = new Date(realToday.getTime() - i * 24 * 60 * 60 * 1000);
    const dayOfWeek = checkDate.getDay();
    
    // Ignore Sundays completely
    if (dayOfWeek === 0) {
      continue;
    }
    
    const wKey = getWeekKey(checkDate);
    const dKey = INDEX_TO_DAY_STRING[dayOfWeek];
    
    gymDaysToCheck.push({
      date: checkDate,
      weekKey: wKey,
      dayKey: dKey,
    });
  }

  if (gymDaysToCheck.length === 0) return 0;

  // Let's check status of the very first gym day (which is today, or Saturday if today is Sunday)
  const firstCheck = gymDaysToCheck[0];
  const firstWeekData = allWeeks[firstCheck.weekKey];
  const isFirstChecked = firstWeekData?.checks?.[firstCheck.dayKey]?.movement || false;

  let streak = 0;
  let startIndex = 0;

  // If the newest gym day is NOT checked, let's see if that day is strictly "today".
  // If it is today (or Saturday if today is Sunday), we allow starting the streak from yesterday
  // to avoid breaking the streak before the user has gone to the gym today.
  const isTodayFirst = firstCheck.date.toDateString() === realToday.toDateString();
  const isSunday = todayDayIndex === 0;

  if (!isFirstChecked && (isTodayFirst || isSunday)) {
    // Check if the SECOND newest gym day (yesterday/previous Gym day) is checked
    if (gymDaysToCheck.length > 1) {
      const secondCheck = gymDaysToCheck[1];
      const secondWeekData = allWeeks[secondCheck.weekKey];
      const isSecondChecked = secondWeekData?.checks?.[secondCheck.dayKey]?.movement || false;
      
      if (isSecondChecked) {
        // Start counting backwards from the second gym day!
        startIndex = 1;
      } else {
        // Yesterday was also missed, streak is broken / 0
        return 0;
      }
    } else {
      return 0;
    }
  }

  // Iterate backwards from the determined startIndex
  for (let i = startIndex; i < gymDaysToCheck.length; i++) {
    const item = gymDaysToCheck[i];
    const weekData = allWeeks[item.weekKey];
    const isChecked = weekData?.checks?.[item.dayKey]?.movement || false;
    
    if (isChecked) {
      streak++;
    } else {
      // Habit missed! Break the streak.
      break;
    }
  }

  return streak;
}

/**
 * Calculates how many days this week are "clean days" (4 or more foundations checked)
 */
export function calculateWeeklyCleanDaysCount(weekData: WeeklyData): number {
  let count = 0;
  const days: DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
  days.forEach((day) => {
    const checks = weekData.checks[day];
    if (checks) {
      const checkedCount = Object.values(checks).filter(Boolean).length;
      if (checkedCount >= 4) {
        count++;
      }
    }
  });
  
  return count;
}
