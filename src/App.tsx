/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Flame, 
  CheckCircle2, 
  Terminal, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Lock, 
  Sparkles, 
  AlertTriangle,
  ExternalLink,
  Clipboard,
  CheckCircle,
  Compass,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { DayName, Habits, WeeklyData, LifetimeData, Foundation } from "./types";
import { isFirebaseConfigured } from "./firebaseConfig";
import { 
  DAYS, 
  FOUNDATIONS, 
  REWARDS, 
  createEmptyWeeklyData, 
  DEFAULT_LIFETIME_DATA, 
  getWeekKey, 
  formatWeekRange 
} from "./defaultData";
import { 
  authenticateUser, 
  subscribeToWeek, 
  subscribeToLifetime, 
  updateWeeklyData, 
  updateLifetimeData 
} from "./firebaseService";
import { calculateGymStreak, calculateWeeklyCleanDaysCount } from "./trackerLogic";

export default function App() {
  // Current viewed week date (defaults to today)
  const [viewedDate, setViewedDate] = useState<Date>(new Date());
  const activeWeekKey = getWeekKey(viewedDate);

  // Authentication & Session
  const [userId, setUserId] = useState<string | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [, setAuthLoading] = useState<boolean>(true);

  // Database States
  const [weeklyDataMap, setWeeklyDataMap] = useState<Record<string, WeeklyData>>({});
  const [lifetimeData, setLifetimeData] = useState<LifetimeData>(DEFAULT_LIFETIME_DATA);

  // UI States
  const [isRewardsExpanded, setIsRewardsExpanded] = useState<boolean>(true);
  const [editingThemeDay, setEditingThemeDay] = useState<DayName | null>(null);
  const [tempThemeValue, setTempThemeValue] = useState<string>("");
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Today marker
  const realCurrentDate = new Date();
  const currentWeekKey = getWeekKey(realCurrentDate);
  const realDayNames: DayName[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const realTodayName = realDayNames[realCurrentDate.getDay()];

  // Active weekly data for the current viewed week
  const activeWeeklyData = weeklyDataMap[activeWeekKey] || createEmptyWeeklyData();

  // Get date strings for each column header
  const getHeaderDateString = (dayName: DayName) => {
    const monday = new Date(viewedDate.getTime());
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff); // Now monday is Monday of the viewed week

    const dayOffsets: Record<DayName, number> = {
      Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6
    };
    const targetDate = new Date(monday.getTime());
    targetDate.setDate(monday.getDate() + dayOffsets[dayName]);
    return targetDate.getDate();
  };

  // Firebase integration initialization
  useEffect(() => {
    setAuthLoading(true);
    const configured = isFirebaseConfigured();
    setIsFirebaseConnected(configured);

    authenticateUser((uid, authenticatedViaFirebase) => {
      setUserId(uid);
      setIsFirebaseConnected(authenticatedViaFirebase);
      setAuthLoading(false);
    });
  }, []);

  // Listen to viewed week changes under current user
  useEffect(() => {
    if (!userId) return;

    // Subscribe to viewed week data
    const unsubPromise = subscribeToWeek(userId, activeWeekKey, (data) => {
      setWeeklyDataMap((prev) => ({
        ...prev,
        [activeWeekKey]: data
      }));
    });

    // Also subscribe to other weeks to compute streaks accurately
    const pastWeeks = [
      getWeekKey(new Date(viewedDate.getTime() - 7 * 24 * 60 * 60 * 1000)),
      getWeekKey(new Date(viewedDate.getTime() - 14 * 24 * 60 * 60 * 1000)),
      getWeekKey(new Date(viewedDate.getTime() - 21 * 24 * 60 * 60 * 1000)),
      getWeekKey(new Date(viewedDate.getTime() - 28 * 24 * 60 * 60 * 1000)),
    ];

    pastWeeks.forEach((wKey) => {
      subscribeToWeek(userId, wKey, (wData) => {
        setWeeklyDataMap((prev) => ({
          ...prev,
          [wKey]: wData
        }));
      });
    });

    // Subscribe to lifetime metrics
    const unsubLifetimePromise = subscribeToLifetime(userId, (data) => {
      setLifetimeData(data || DEFAULT_LIFETIME_DATA);
    });

    return () => {
      unsubPromise.then((unsub) => unsub());
      unsubLifetimePromise.then((unsub) => unsub());
    };
  }, [userId, activeWeekKey, viewedDate]);

  // Handle cell checking and synchronize lifetime counts
  const handleHabitToggle = async (day: DayName, habitId: keyof Habits) => {
    if (!userId) return;
    if (day === "Sun" && habitId === "movement") return; // Sunday Movement is locked

    const currentChecks = activeWeeklyData.checks[day] || {
      movement: false, substance: false, french: false, poetry: false, meditation: false
    };

    const wasChecked = currentChecks[habitId];
    const isNowChecked = !wasChecked;

    let lifetimeGymDelta = 0;
    let cleanDaysDelta = 0;

    // 1. Gym Days calculation (Mon to Sat only)
    if (habitId === "movement" && day !== "Sun") {
      lifetimeGymDelta = isNowChecked ? 1 : -1;
    }

    // 2. Clean Days calculation. A clean day = 4 or more checked out of 5.
    const getCheckedCount = (checks: Habits) => {
      return Object.values(checks).filter(Boolean).length;
    };

    const prevCheckedCount = getCheckedCount(currentChecks);
    const updatedChecks: Habits = { 
      ...currentChecks, 
      [habitId]: isNowChecked 
    };
    const nextCheckedCount = getCheckedCount(updatedChecks);

    const wasClean = prevCheckedCount >= 4;
    const isNowClean = nextCheckedCount >= 4;

    if (!wasClean && isNowClean) {
      cleanDaysDelta = 1;
    } else if (wasClean && !isNowClean) {
      cleanDaysDelta = -1;
    }

    // Create updated weekly data
    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      checks: {
        ...activeWeeklyData.checks,
        [day]: updatedChecks
      }
    };

    // Prepare updated lifetime data
    const updatedLifetime: LifetimeData = {
      lifetimeGym: Math.max(0, lifetimeData.lifetimeGym + lifetimeGymDelta),
      cleanDaysTotal: Math.max(0, lifetimeData.cleanDaysTotal + cleanDaysDelta),
      bossChain: lifetimeData.bossChain
    };

    // Save changes
    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
    await updateLifetimeData(userId, updatedLifetime);
  };

  // Toggle Boss Battle Completion
  const handleToggleBossDefeated = async () => {
    if (!userId) return;

    const currentDefeated = activeWeeklyData.bossDefeated;
    const isNowDefeated = !currentDefeated;

    let nextBossChainValue = lifetimeData.bossChain;
    if (isNowDefeated) {
      nextBossChainValue += 1;
    } else {
      nextBossChainValue = 0; // Reset as per rule
    }

    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      bossDefeated: isNowDefeated
    };

    const updatedLifetime: LifetimeData = {
      ...lifetimeData,
      bossChain: nextBossChainValue
    };

    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
    await updateLifetimeData(userId, updatedLifetime);
  };

  // Save Boss Outcome text
  const handleBossNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    if (!userId) return;
    const value = e.target.value;
    if (value === activeWeeklyData.bossBattle) return;

    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      bossBattle: value
    };
    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
  };

  const handleBossNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  // Toggle Finance Checked
  const handleToggleFinanceChecked = async () => {
    if (!userId) return;

    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      financeChecked: !activeWeeklyData.financeChecked
    };
    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
  };

  // Save Theme text
  const startEditingTheme = (day: DayName, currentValue: string) => {
    setEditingThemeDay(day);
    setTempThemeValue(currentValue);
  };

  const saveThemeText = async (day: DayName) => {
    if (!userId) return;
    setEditingThemeDay(null);
    if (tempThemeValue === activeWeeklyData.themes[day]) return;

    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      themes: {
        ...activeWeeklyData.themes,
        [day]: tempThemeValue
      }
    };
    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
  };

  const handleThemeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, day: DayName) => {
    if (e.key === "Enter") {
      saveThemeText(day);
    } else if (e.key === "Escape") {
      setEditingThemeDay(null);
    }
  };

  // Save Notes textarea
  const handleNotesBlur = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!userId) return;
    const value = e.target.value;
    if (value === activeWeeklyData.notes) return;

    const updatedWeekly: WeeklyData = {
      ...activeWeeklyData,
      notes: value
    };
    await updateWeeklyData(userId, activeWeekKey, updatedWeekly);
  };

  // Week reset
  const handleResetCurrentWeek = async () => {
    if (!userId) return;
    
    const resetWeekly = createEmptyWeeklyData();
    resetWeekly.themes = { ...activeWeeklyData.themes };

    await updateWeeklyData(userId, activeWeekKey, resetWeekly);
    setShowResetConfirm(false);
  };

  // Cycle weeks
  const navigateWeek = (weeksToShift: number) => {
    const nextDate = new Date(viewedDate.getTime());
    nextDate.setDate(viewedDate.getDate() + weeksToShift * 7);
    setViewedDate(nextDate);
  };

  // Skip back to current week
  const jumpToCurrentWeek = () => {
    setViewedDate(new Date());
  };

  // Compute stats
  const activeGymStreak = calculateGymStreak(weeklyDataMap, realCurrentDate);
  const weeklyCleanDays = calculateWeeklyCleanDaysCount(activeWeeklyData);

  // Rewards layout: Find next threshold
  const getNextRewardThreshold = () => {
    const sortedThresholds = [...REWARDS].sort((a, b) => a.days - b.days);
    const next = sortedThresholds.find(t => t.days > activeGymStreak);
    return next || sortedThresholds[sortedThresholds.length - 1];
  };

  const nextReward = getNextRewardThreshold();
  const currentStreakPercent = Math.min(100, Math.round((activeGymStreak / nextReward.days) * 100));

  const copyConfigSnippet = () => {
    const snippet = `const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN",
  databaseURL: "PASTE_YOUR_DATABASE_URL",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};`;
    navigator.clipboard.writeText(snippet);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-[#e0e0e0] font-mono select-none px-4 py-8 md:p-10 flex flex-col justify-between max-w-7xl mx-auto">
      
      {/* 1. Header Block */}
      <motion.header 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-[#1e1e35] pb-6 gap-5"
        id="app_header"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold font-sans tracking-tight text-white mb-0 uppercase" id="title_la_cuadricula">
              La Cuadrícula
            </h1>
            <span className="text-[9px] tracking-widest px-2.5 py-1.5 border border-[#00ff88]/30 bg-[#00ff88]/5 text-[#00ff88] rounded-md font-bold uppercase shadow-[0_0_10px_rgba(0,255,136,0.05)]">
              The Grid
            </span>
          </div>
          
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
            <Calendar className="w-4 h-4 text-gray-600" />
            <span className="font-semibold text-gray-400">
              {formatWeekRange(viewedDate)}
            </span>
            {activeWeekKey !== currentWeekKey && (
              <button 
                onClick={jumpToCurrentWeek}
                className="ml-2 text-[10px] text-[#00ff88] hover:text-[#00ff88]/80 font-bold hover:underline underline-offset-4 flex items-center gap-1 cursor-pointer transition-colors"
              >
                [Return to Current Week]
              </button>
            )}
          </div>
        </div>

        {/* Console Sync State & Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Week Selector Toggle Nav */}
          <div className="flex border border-[#1e1e35] bg-[#0c0c16] rounded-lg overflow-hidden shadow-sm">
            <button 
              onClick={() => navigateWeek(-1)}
              className="px-3 py-2 hover:bg-[#15152a] text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Previous Week"
              id="btn_prev_week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 py-2 text-[10px] text-gray-400 font-extrabold border-x border-[#1e1e35] bg-[#07070f] tracking-wider font-mono">
              WEEK INDEX
            </div>
            <button 
              onClick={() => navigateWeek(1)}
              className="px-3 py-2 hover:bg-[#15152a] text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Next Week"
              id="btn_next_week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Connected state indicators */}
          {isFirebaseConnected ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#00ff88]/30 bg-[#00ff88]/5 text-xs text-[#00ff88] font-bold tracking-wider shadow-[0_0_12px_rgba(0,255,136,0.05)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff88]"></span>
              </span>
              SYNCED ON CLOUD
            </div>
          ) : (
            <button 
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#88aaff]/30 bg-[#88aaff]/5 text-xs text-[#88aaff] hover:border-[#88aaff]/80 hover:bg-[#88aaff]/10 transition-all font-bold tracking-wider shadow-sm cursor-pointer"
              id="btn_cloud_config"
            >
              <Terminal className="w-3.5 h-3.5" />
              LOCAL PREVIEW [CLICK SETUP]
            </button>
          )}
        </div>
      </motion.header>

      {/* 2. Stats Bento Row (Stagger delay 0.4s) */}
      <motion.section 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        id="stats_row"
      >
        {/* Stat 1: Gym Streak */}
        <div className="bg-gradient-to-b from-[#0f0f1c] to-[#07070e] border border-[#1e1e35] p-5 rounded-2xl flex items-center justify-between group overflow-hidden relative transition-all duration-300 hover:border-[#ffaa44]/50 hover:shadow-[0_0_20px_rgba(255,170,68,0.04)]">
          <div className="absolute right-[-10px] top-[-10px] rotate-12 opacity-[0.03] group-hover:scale-110 group-hover:opacity-[0.06] transition-all duration-500">
            <Flame className="w-24 h-24 text-[#ffaa44]" />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold font-mono">Gym Streak</div>
            <div className="text-3xl font-extrabold font-sans text-[#ffaa44] flex items-baseline gap-1" id="stat_gym_streak">
              {activeGymStreak} <span className="text-xs font-mono font-normal text-gray-500">days</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-2 font-bold tracking-tight">Active consec. days Mon-Sat</div>
          </div>
          <div className="bg-[#ffaa44]/5 p-2.5 rounded-xl border border-[#ffaa44]/20 group-hover:border-[#ffaa44]/40 transition-colors">
            <Flame className="w-5 h-5 text-[#ffaa44] animate-pulse" />
          </div>
        </div>

        {/* Stat 2: Clean Days Week */}
        <div className="bg-gradient-to-b from-[#0f0f1c] to-[#07070e] border border-[#1e1e35] p-5 rounded-2xl flex items-center justify-between group overflow-hidden relative transition-all duration-300 hover:border-[#88aaff]/50 hover:shadow-[0_0_20px_rgba(136,170,255,0.04)]">
          <div className="absolute right-[-10px] top-[-10px] rotate-12 opacity-[0.03] group-hover:scale-110 group-hover:opacity-[0.06] transition-all duration-500">
            <CheckCircle2 className="w-24 h-24 text-[#88aaff]" />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold font-mono">Week Clean</div>
            <div className="text-3xl font-extrabold font-sans text-[#88aaff] flex items-baseline gap-1" id="stat_weekly_clean">
              {weeklyCleanDays} <span className="text-xs font-mono font-normal text-gray-500">/ 7 days</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-2 font-bold tracking-tight">Days with 4+ Checked habits</div>
          </div>
          <div className="bg-[#88aaff]/5 p-2.5 rounded-xl border border-[#88aaff]/20 group-hover:border-[#88aaff]/40 transition-colors">
            <CheckCircle2 className="w-5 h-5 text-[#88aaff]" />
          </div>
        </div>

        {/* Stat 3: Boss Chain */}
        <div className="bg-gradient-to-b from-[#0f0f1c] to-[#07070e] border border-[#1e1e35] p-5 rounded-2xl flex items-center justify-between group overflow-hidden relative transition-all duration-300 hover:border-[#ff44aa]/50 hover:shadow-[0_0_20px_rgba(255,68,170,0.04)]">
          <div className="absolute right-[-10px] top-[-10px] rotate-12 opacity-[0.02] group-hover:scale-110 group-hover:opacity-[0.05] transition-all duration-500">
            <Sparkles className="w-24 h-24 text-[#ff44aa]" />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold font-mono">Boss Chain</div>
            <div className="text-3xl font-extrabold font-sans text-[#ff44aa]" id="stat_boss_chain">
              {lifetimeData.bossChain} <span className="text-xs font-mono font-normal text-gray-500">weeks</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-2 font-bold tracking-tight">Consecutive boss defeats</div>
          </div>
          <div className="bg-[#ff44aa]/5 p-2.5 rounded-xl border border-[#ff44aa]/20 group-hover:border-[#ff44aa]/40 transition-colors">
            <Sparkles className="w-5 h-5 text-[#ff44aa]" />
          </div>
        </div>

        {/* Stat 4: Clean Days Lifetime */}
        <div className="bg-gradient-to-b from-[#0f0f1c] to-[#07070e] border border-[#1e1e35] p-5 rounded-2xl flex items-center justify-between group overflow-hidden relative transition-all duration-300 hover:border-[#00ff88]/50 hover:shadow-[0_0_20px_rgba(0,255,136,0.04)]">
          <div className="absolute right-[-10px] top-[-10px] rotate-12 opacity-[0.02] group-hover:scale-110 group-hover:opacity-[0.05] transition-all duration-500">
            <Compass className="w-24 h-24 text-[#00ff88]" />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold font-mono">Lifetime</div>
            <div className="text-3xl font-extrabold font-sans text-[#00ff88]" id="stat_lifetime_clean">
              {lifetimeData.cleanDaysTotal} <span className="text-xs font-mono font-normal text-gray-500">clean</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-2 font-bold tracking-tight">Gym total: {lifetimeData.lifetimeGym} sessions</div>
          </div>
          <div className="bg-[#00ff88]/5 p-2.5 rounded-xl border border-[#00ff88]/20 group-hover:border-[#00ff88]/40 transition-colors">
            <Compass className="w-5 h-5 text-[#00ff88]" />
          </div>
        </div>
      </motion.section>

      {/* Rewards Milestones Section (Stagger 0.7s) */}
      <motion.section 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mb-8"
        id="rewards_section"
      >
        <div className="border border-[#1e1e35] rounded-2xl overflow-hidden bg-[#07070e] shadow-lg">
          <button 
            onClick={() => setIsRewardsExpanded(!isRewardsExpanded)}
            className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#0a0a14] to-[#07070e] border-b border-[#1e1e35] hover:from-[#111124] hover:to-[#0c0c16] transition-colors cursor-pointer"
            id="btn_toggle_rewards"
          >
            <div className="flex items-center gap-2.5">
              <span className={`text-[9px] text-[#88aaff] transition-transform duration-200 ${isRewardsExpanded ? 'rotate-90' : 'rotate-0'}`}>
                ▼
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-[#88aaff] font-mono">
                STREAK MILESTONES
              </span>
              <span className="text-[10px] text-gray-500 font-medium">
                (Streak: {activeGymStreak} days)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 w-48 text-right">
                <span className="text-[10px] text-gray-500 font-mono">Next: {nextReward.days}d</span>
                <div className="w-24 bg-[#141426] h-2 rounded-full overflow-hidden border border-[#1e1e35]">
                  <div 
                    className="bg-gradient-to-r from-[#00ff88] to-[#00ffbf] h-full shadow-[0_0_8px_rgba(0,255,136,0.3)]"
                    style={{ width: `${currentStreakPercent}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-[#00ff88] font-bold font-mono">{currentStreakPercent}%</span>
              </div>
            </div>
          </button>

          <AnimatePresence initial={false}>
            {isRewardsExpanded && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden bg-[#07070e]"
              >
                <div className="p-5">
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                    {REWARDS.map((reward, idx) => {
                      const isEarned = activeGymStreak >= reward.days;
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border text-xs min-w-[142px] flex-1 max-w-[220px] transition-all duration-300 ${
                            isEarned 
                              ? "bg-[#00ff88]/[0.02] border-[#00ff88]/30 text-white shadow-[0_0_15px_rgba(0,255,136,0.02)] hover:border-[#00ff88]/60" 
                              : "bg-[#050508]/60 border-[#1e1e35]/50 text-gray-500 hover:border-[#1e1e35]"
                          }`}
                        >
                          <span className={`text-lg transition-transform duration-300 ${isEarned ? 'grayscale-0 scale-110' : 'grayscale'}`}>
                            {reward.icon}
                          </span>
                          <div className="flex-1 overflow-hidden">
                            <div className={`font-bold truncate text-[10px] tracking-tight ${isEarned ? 'text-white' : 'text-gray-500'}`}>
                              {reward.reward}
                            </div>
                            <div className="text-[8px] text-gray-600 font-bold mt-1 tracking-wider uppercase">
                              {reward.days} DAYS GOAL
                            </div>
                          </div>
                          {isEarned ? (
                            <div className="bg-[#00ff88]/15 border border-[#00ff88]/40 text-[#00ff88] rounded-full p-0.5">
                              <Check className="w-2.5 h-2.5" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="border border-[#1e1e35] text-gray-600 rounded-full p-0.5">
                              <Lock className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* 4. Core Terminal Grid (Stagger delay 0.5s) */}
      <motion.section 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="mb-8 flex-1 overflow-x-auto min-w-full rounded-2xl border border-[#1e1e35] bg-[#07070e] p-3 md:p-4 shadow-xl"
        id="habits_grid_container"
      >
        <div className="min-w-[640px]">
          <table className="w-full border-collapse separate" style={{ borderSpacing: "6px" }}>
            <thead>
              <tr>
                <th className="w-[180px] text-left p-3.5 bg-[#050508] rounded-xl border border-[#1e1e35]">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#88aaff] font-bold uppercase tracking-widest font-mono">
                    <Terminal className="w-4 h-4 text-[#88aaff]" />
                    FOUNDATIONS
                  </div>
                  <div className="text-[8px] text-gray-500 mt-1 uppercase tracking-wider font-bold">Daily Binary Metrics</div>
                </th>

                {DAYS.map((dayName) => {
                  const dayOffset = getHeaderDateString(dayName);
                  const isTodayActive = (activeWeekKey === currentWeekKey) && (dayName === realTodayName);
                  
                  return (
                    <th 
                      key={dayName}
                      className={`text-center p-2.5 rounded-xl border transition-all duration-300 ${
                        isTodayActive 
                          ? "bg-[#00ff88]/[0.03] border-[#00ff88]/40 shadow-[0_0_12px_rgba(0,255,136,0.05)]" 
                          : "bg-[#050508] border border-[#1e1e35]"
                      }`}
                    >
                      <div className={`text-xs font-bold leading-none uppercase tracking-wider font-mono ${isTodayActive ? "text-[#00ff88]" : "text-white"}`}>
                        {dayName.toUpperCase()}
                      </div>
                      <div className={`text-[9px] font-bold font-mono mt-1 ${isTodayActive ? "text-[#00ff88]/70" : "text-gray-500"}`}>
                        DATE {dayOffset}
                      </div>
                      {isTodayActive && (
                        <div className="text-[7.5px] text-[#00ff88] mt-1 font-extrabold tracking-widest uppercase">
                          [TODAY]
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {FOUNDATIONS.map((f: Foundation) => {
                const checkedToday = activeWeeklyData.checks[realTodayName]?.[f.id] || false;
                const isSundayMovement = realTodayName === "Sun" && f.id === "movement";
                return (
                  <tr key={f.id}>
                    <td 
                      onClick={() => !isSundayMovement && handleHabitToggle(realTodayName, f.id)}
                      className={`p-3.5 border rounded-xl cursor-pointer transition-all duration-300 select-none ${
                        isSundayMovement 
                          ? "bg-[#050508]/20 border-[#1e1e35]/30 cursor-not-allowed opacity-40" 
                          : checkedToday
                            ? "bg-[#0e2c1e]/40 border-[#00ff88]/30 hover:border-[#00ff88]/60 hover:bg-[#0e2c1e]/60"
                            : "bg-[#050508]/60 border-[#1e1e35] hover:border-[#88aaff]/50 hover:bg-[#0c0c1b]"
                      }`}
                      title={isSundayMovement ? "Sunday Movement is locked/rest day" : `Click to toggle today's (${realTodayName}) check`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base scale-110">{f.icon}</span>
                        <div className="overflow-hidden">
                          <div className={`text-xs font-bold tracking-tight leading-none uppercase font-mono ${checkedToday ? "text-[#00ff88]" : "text-white"}`}>
                            {f.label}
                          </div>
                          <div className="text-[9px] text-gray-500 font-bold mt-1.5 truncate leading-none uppercase tracking-wide">
                            {f.description}
                          </div>
                        </div>
                      </div>
                    </td>

                    {DAYS.map((dayName) => {
                      const isSundayMovement = dayName === "Sun" && f.id === "movement";
                      const checked = activeWeeklyData.checks[dayName]?.[f.id] || false;
                      const isTodayActive = (activeWeekKey === currentWeekKey) && (dayName === realTodayName);

                      if (isSundayMovement) {
                        return (
                          <td 
                            key={dayName}
                            className="bg-[#050508]/10 border border-[#1e1e35]/30 p-0 text-center select-none rounded-xl cursor-not-allowed opacity-25 relative overflow-hidden"
                          >
                            <div className="w-full h-10 flex items-center justify-center text-[9px] font-bold text-gray-600 uppercase tracking-widest bg-dashed">
                              rest
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td 
                          key={dayName}
                          onClick={() => handleHabitToggle(dayName, f.id)}
                          className={`p-0 text-center transition-all duration-300 cursor-pointer rounded-xl relative ${
                            checked 
                              ? "bg-gradient-to-b from-[#0e2c1e] to-[#05140e] border-2 border-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.18)]" 
                              : isTodayActive
                                ? "bg-[#00ff88]/[0.01] border border-[#00ff88]/35 hover:border-[#00ff88] hover:bg-[#00ff88]/5"
                                : "bg-[#050508]/80 border border-[#1e1e35] hover:border-gray-500 hover:bg-[#0c0c16]"
                          }`}
                        >
                          <div className="w-full h-10 flex items-center justify-center relative">
                            {checked ? (
                              <motion.div
                                initial={{ scale: 0.7, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                              >
                                <Check className="w-4.5 h-4.5 text-[#00ff88]" strokeWidth={4} />
                              </motion.div>
                            ) : (
                              <div className="opacity-0 hover:opacity-15 transition-opacity">
                                <Check className="w-4.5 h-4.5 text-white/30" strokeWidth={3} />
                              </div>
                            )}

                            {isTodayActive && !checked && (
                              <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#00ff88]/50 animate-ping"></div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              <tr>
                <td className="p-3 bg-[#050508]/60 border border-[#1e1e35] rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">⚡</span>
                    <div>
                      <div className="text-[10px] font-extrabold text-[#88aaff] tracking-widest uppercase leading-none font-mono">
                        DAY THEME
                      </div>
                      <div className="text-[8px] text-gray-500 font-bold mt-1.5 uppercase leading-none">
                        EDITABLE TAGS
                      </div>
                    </div>
                  </div>
                </td>

                {DAYS.map((dayName) => {
                  const themeVal = activeWeeklyData.themes[dayName] || "";
                  const isEditing = editingThemeDay === dayName;
                  const isTodayActive = (activeWeekKey === currentWeekKey) && (dayName === realTodayName);

                  return (
                    <td 
                      key={dayName}
                      className={`p-1.5 text-center rounded-xl border transition-all duration-300 ${
                        isTodayActive 
                          ? "bg-[#00ff88]/[0.01] border-[#00ff88]/25 hover:border-[#00ff88]/50" 
                          : "bg-[#050508]/40 border border-[#1e1e35] hover:border-gray-700"
                      }`}
                    >
                      {isEditing ? (
                        <input
                           type="text"
                           autoFocus
                           value={tempThemeValue}
                           onChange={(e) => setTempThemeValue(e.target.value)}
                           onBlur={() => saveThemeText(dayName)}
                           onKeyDown={(e) => handleThemeKeyDown(e, dayName)}
                           className="w-full text-[9px] bg-[#121226] border border-[#00ff88]/80 text-[#00ff88] py-0.5 px-1 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ff88] text-center font-mono font-bold"
                           maxLength={32}
                        />
                      ) : (
                        <div 
                          onClick={() => startEditingTheme(dayName, themeVal)}
                          className={`text-[9px] font-bold font-mono cursor-pointer transition-colors max-w-[80px] mx-auto truncate leading-tight ${
                            themeVal 
                              ? isTodayActive 
                                ? "text-[#00ff88]/90 hover:text-[#00ff88]" 
                                : "text-gray-500 hover:text-white" 
                              : "text-gray-700 italic hover:text-gray-500 font-normal"
                          }`}
                          title="Click to edit theme tag"
                        >
                          {themeVal || "[Empty]"}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* 5. Boss Fight + Finance Column Panel (Stagger delay 0.6s) */}
      <motion.section 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8"
        id="boss_finance_container"
      >
        <div 
          className="border rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,68,170,0.03)]"
          style={{
            background: "linear-gradient(135deg, #09030c 0%, #070712 100%)",
            borderColor: activeWeeklyData.bossDefeated ? "#00ff88" : "#2a153d"
          }}
          id="boss_battle_card"
        >
          <div className="absolute right-0 bottom-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#ff44aa] via-transparent to-transparent w-full h-full"></div>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">👾</span>
              <div>
                <h3 className="text-xs font-bold text-[#ff44aa] uppercase tracking-widest leading-none font-mono">
                  Boss Fight
                </h3>
                <p className="text-[8px] text-gray-500 font-bold mt-1.5 uppercase leading-none tracking-wide">
                  A measurable objective each week
                </p>
              </div>
            </div>

            {activeWeeklyData.bossDefeated && (
              <span className="text-[8px] tracking-widest px-2.5 py-1 bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/40 rounded-md font-bold uppercase shadow-[0_0_10px_rgba(0,255,136,0.1)]">
                Defeated
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Declare measurable target metric..."
                value={activeWeeklyData.bossBattle}
                onChange={(e) => {
                  setWeeklyDataMap(prev => ({
                    ...prev,
                    [activeWeekKey]: {
                      ...activeWeeklyData,
                      bossBattle: e.target.value
                    }
                  }));
                }}
                onBlur={handleBossNameBlur}
                onKeyDown={handleBossNameKeyDown}
                className="w-full bg-[#050508]/95 border border-[#2a133d] text-white py-2.5 px-3.5 text-xs placeholder-gray-600 rounded-xl focus:outline-none focus:border-[#ff44aa]/80 focus:ring-1 focus:ring-[#ff44aa]/30 transition-all pr-10 font-mono font-bold"
                id="boss_text_input"
              />
              <span className="absolute right-3.5 top-3 text-[9px] text-gray-500 font-extrabold tracking-wider font-mono">
                WEEKLY
              </span>
            </div>

            <button
              onClick={handleToggleBossDefeated}
              disabled={!activeWeeklyData.bossBattle.trim()}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                !activeWeeklyData.bossBattle.trim()
                  ? "bg-[#0a070e] border border-dashed border-[#1f152d] text-gray-700 cursor-not-allowed"
                  : activeWeeklyData.bossDefeated
                    ? "bg-[#00ff88]/10 border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/20 shadow-[0_0_15px_rgba(0,255,136,0.08)]"
                    : "bg-[#ff44aa]/5 border border-[#ff44aa]/30 text-[#ff44aa] hover:border-[#ff44aa] hover:bg-[#ff44aa]/12 hover:shadow-[0_0_15px_rgba(255,68,170,0.08)]"
              }`}
            >
              {activeWeeklyData.bossDefeated ? (
                <>
                  <CheckCircle className="w-4.5 h-4.5 text-[#00ff88]" />
                  BOSS DEFEATED [+1 BOSS CHAIN]
                </>
              ) : (
                <>
                  <span>⚔️</span>
                  MARK GOAL [DEFEATED]
                </>
              )}
            </button>
          </div>

          {lifetimeData.bossChain >= 4 && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-4 bg-gradient-to-r from-[#ff44aa]/10 to-[#88aaff]/10 border border-[#ff44aa]/30 rounded-xl p-3 text-center"
            >
              <div className="text-[9px] text-white font-extrabold tracking-widest uppercase flex items-center justify-center gap-1.5 font-mono">
                <span>🏆</span> MONTHLY REWARD ACHIEVED <span>🏆</span>
              </div>
              <div className="text-[8px] text-[#88aaff] font-bold mt-1 uppercase tracking-wide">
                Consecutive 4-week boss kill streak maintained!
              </div>
            </motion.div>
          )}
        </div>

        <div 
          className="border rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:shadow-[0_0_20px_rgba(136,170,255,0.03)]"
          style={{
            background: "linear-gradient(135deg, #040814 0%, #070712 100%)",
            borderColor: activeWeeklyData.financeChecked ? "#88aaff" : "#1a253d"
          }}
          id="finance_card"
        >
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="text-xs font-bold text-[#88aaff] uppercase tracking-widest leading-none font-mono">
                    Finance Check-In
                  </h3>
                  <p className="text-[8px] text-gray-500 font-bold mt-1.5 uppercase leading-none tracking-wide">
                    Keep your finances tracked
                  </p>
                </div>
              </div>

              {activeWeeklyData.financeChecked && (
                <span className="text-[8px] tracking-widest px-2.5 py-1 bg-[#88aaff]/10 text-[#88aaff] border border-[#88aaff]/30 rounded-md font-bold uppercase shadow-[0_0_10px_rgba(136,170,255,0.1)]">
                  COMPLETED
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-dashed border-[#1e253d] bg-[#050508]/40">
              <button
                onClick={handleToggleFinanceChecked}
                className={`px-5 py-3 rounded-xl text-xs font-bold w-full transition-all duration-300 hover:scale-[1.01] flex items-center justify-center gap-2 cursor-pointer ${
                  activeWeeklyData.financeChecked
                    ? "bg-[#88aaff]/10 border border-[#88aaff]/40 text-[#88aaff] hover:bg-[#88aaff]/20 shadow-[0_0_15px_rgba(136,170,255,0.08)]"
                    : "bg-[#050508]/80 border border-[#1e253d] text-gray-500 hover:border-[#88aaff] hover:text-white"
                }`}
                id="btn_finance_toggle"
              >
                {activeWeeklyData.financeChecked ? (
                  <>
                    <CheckCircle className="w-4.5 h-4.5 text-[#88aaff]" />
                    Done this week
                  </>
                ) : (
                  "Tap when you've looked at it"
                )}
              </button>
              
              <div className="text-center w-full mt-1">
                <div className="text-[9px] text-[#ff44aa]/85 font-bold uppercase flex items-center justify-center gap-1.5 tracking-wider font-mono">
                  <AlertTriangle className="w-4 h-4 text-[#ff44aa]" />
                  Skip 2 weeks → becomes boss battle
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 6. Weekly Notes Section (Stagger delay 0.8s) */}
      <motion.section 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className="mb-8"
        id="notes_section"
      >
        <div className="bg-gradient-to-b from-[#0f0f1c] to-[#07070e] border border-[#1e1e35] rounded-2xl p-6 shadow-md hover:border-[#88aaff]/30 transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">📝</span>
            <span className="text-xs font-bold text-[#88aaff] uppercase tracking-widest font-mono">
              WEEKLY SOMATIC SIGNALS & NOTES
            </span>
          </div>
          
          <textarea
            placeholder="Somatic signals, wins, adjustments, feelings, blockers..."
            defaultValue={activeWeeklyData.notes}
            onBlur={handleNotesBlur}
            className="w-full bg-[#050508]/90 border border-[#1e1e35] text-[#e0e0e0] p-4 text-xs h-[100px] rounded-xl focus:outline-none focus:border-[#88aaff]/80 focus:ring-1 focus:ring-[#88aaff]/30 resize-none font-mono placeholder-gray-600 transition-all"
            id="notes_textarea"
          ></textarea>
        </div>
      </motion.section>

      {/* 7. Footer Panel */}
      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.6 }}
        className="mt-8 border-t border-[#1e1e35] pt-6 flex items-center justify-between text-xs text-gray-500 gap-4"
        id="app_footer"
      >
        <div className="text-[10px] text-gray-600 font-extrabold uppercase tracking-widest font-mono select-none">
          la cuadrícula v1.5 // sleek
        </div>

        <button 
          onClick={() => setShowResetConfirm(true)}
          className="px-3.5 py-2 font-bold border border-[#2d1212] text-[#8c3535] hover:border-[#ff4444] hover:text-[#ff4444] hover:bg-[#ff4444]/5 rounded-lg transition-all text-[11px] cursor-pointer tracking-widest font-mono"
          id="btn_reset_week"
        >
          RESET WEEK
        </button>
      </motion.footer>

      {/* dialog / popups */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0e0709] border border-[#ff4444]/40 max-w-sm w-full rounded-2xl p-6 shadow-[0_0_30px_rgba(255,68,68,0.12)]"
            >
              <div className="flex items-center gap-2 text-[#ff4444] mb-3">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                <h3 className="font-mono font-extrabold uppercase text-xs text-white tracking-widest">
                  Confirm Week Reset
                </h3>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-5 font-mono font-medium">
                This will clear all 5 habit checks, notes, boss battle status, and finance check-ins for the active week (<span className="text-[#88aaff] font-bold">{activeWeekKey}</span>). 
                <br /><br />
                <span className="text-white font-bold uppercase tracking-wider text-[10px]">Preserved elements:</span>
                <br />
                - Theme tags on columns
                <br />
                - Lifetime accumulators (clean/gym days, bossChain)
              </p>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 bg-[#171725] hover:bg-[#202035] text-gray-400 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-[#26263f]"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleResetCurrentWeek}
                  className="flex-1 py-2.5 bg-[#ff4444]/15 border border-[#ff4444] text-[#ff4444] hover:bg-[#ff4444]/20 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(255,68,68,0.1)]"
                >
                  RESET NOW
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showConfigModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#070712]/95 border border-[#1e294b] max-w-lg w-full rounded-2xl p-6 shadow-[0_0_40px_rgba(136,170,255,0.12)] relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowConfigModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors cursor-pointer text-xs font-bold p-1 font-mono"
              >
                [CLOSE_X]
              </button>

              <div className="flex items-center gap-2 mb-4 text-[#88aaff]">
                <Terminal className="w-5 h-5 text-[#88aaff]" />
                <h3 className="font-mono font-extrabold uppercase text-xs text-white tracking-widest">
                  How to Sync with Firebase
                </h3>
              </div>

              <div className="space-y-4 text-xs leading-relaxed text-gray-400 font-mono font-medium">
                <p>
                  To sync data in real time between your laptop and phone with no setup limits, follow these simple steps:
                </p>

                <div className="space-y-4 bg-[#050508]/80 p-5 rounded-xl border border-[#1e294b]/60 text-[11px] font-sans">
                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider mb-1 font-mono text-[10px]">
                      1. Create Free Firebase Project
                    </h4>
                    <p className="text-gray-400 font-medium font-sans">
                      Go to the {" "}
                      <a 
                        href="https://console.firebase.google.com/" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[#00ff88] hover:underline inline-flex items-center gap-1 font-bold"
                      >
                        Firebase Console <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      , click "Add Project", and create one named <code className="text-white bg-[#15152a] px-1 rounded-md font-mono font-bold">la-cuadricula</code>.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider mb-1 font-mono text-[10px]">
                      2. Enable Anonymous Authentication
                    </h4>
                    <p className="text-gray-400 font-medium font-sans">
                      In the Firebase sidebar, go to <strong>Build &gt; Authentication</strong>. Click "Get Started". Select the <strong>Sign-in method</strong> tab, choose <strong>Anonymous</strong>, switch it on, and click "Save".
                    </p>
                  </div>

                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider mb-1 font-mono text-[10px]">
                      3. Create a Realtime Database and Rules
                    </h4>
                    <p className="text-gray-400 font-medium leading-relaxed font-sans">
                      Go to <strong>Build &gt; Realtime Database</strong>. Click "Create Database". Select "Configure Security Rules" as "Start in Locked Mode". Once created, click on the "Rules" tab and paste this secure schema:
                    </p>
                    <pre className="mt-2.5 p-3.5 bg-[#030305] border border-[#1e1e35] text-[#ff44aa] rounded-xl overflow-auto font-mono text-[9.5px] leading-relaxed select-all">
{`{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}`}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider mb-1 font-mono text-[10px]">
                      4. Paste configuration inside project code
                    </h4>
                    <p className="text-gray-400 font-medium font-sans">
                      In Firebase Overview, register a Web app (click the <code className="text-white bg-[#15152a] px-1.5 py-0.5 rounded-md font-mono font-bold">&lt;/&gt;</code> web icon). Copy the config JSON snippet, open the project file <code className="text-[#88aaff] font-mono font-bold">/src/firebaseConfig.ts</code> and paste it in.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 font-sans font-bold text-xs">
                  <button 
                    onClick={copyConfigSnippet}
                    className="flex-1 py-2.5 bg-[#171a2e] text-white hover:bg-[#1f223f] rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#1e294b]"
                  >
                    <Clipboard className="w-4 h-4" />
                    {copySuccess ? "COPIED SNIPPET!" : "COPY CONFIG SNIPPET"}
                  </button>
                  <button 
                    onClick={() => setShowConfigModal(false)}
                    className="flex-1 py-1.5 bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/20 rounded-lg font-bold transition-all cursor-pointer shadow-sm shadow-[#0a1a15]"
                  >
                    DISMISS CONSOLE
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
