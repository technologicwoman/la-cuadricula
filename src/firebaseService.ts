/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";
import { WeeklyData, LifetimeData } from "./types";
import { createEmptyWeeklyData, DEFAULT_LIFETIME_DATA } from "./defaultData";

// Core exports that will be initialized conditionally
let appInstance: any = null;
let authInstance: any = null;
let dbInstance: any = null;

let isInitialized = false;

export async function initializeFirebaseApp() {
  if (isInitialized) return { auth: authInstance, db: dbInstance };

  if (isFirebaseConfigured()) {
    try {
      // Lazy load SDKs to prevent compile crashes if config isn't loaded:
      const { initializeApp } = await import("firebase/app");
      const { getAuth } = await import("firebase/auth");
      const { getDatabase } = await import("firebase/database");

      appInstance = initializeApp(firebaseConfig);
      authInstance = getAuth(appInstance);
      dbInstance = getDatabase(appInstance);
      isInitialized = true;
      console.log("Firebase initialized successfully with project id:", firebaseConfig.projectId);
    } catch (err) {
      console.error("Failed to initialize Firebase SDK:", err);
    }
  } else {
    console.warn("Firebase not configured. Running in local fallback mode.");
  }

  return { auth: authInstance, db: dbInstance };
}

/**
 * Signs in the user anonymously if Firebase is active.
 * In local mode, returns a mock user ID.
 */
export async function authenticateUser(onUserReady: (uid: string, isAnonymous: boolean) => void) {
  const { auth } = await initializeFirebaseApp();

  if (auth) {
    const { signInAnonymously, onAuthStateChanged } = await import("firebase/auth");

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        onUserReady(user.uid, true);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Anonymous authentication failed:", err);
          // Fallback to local user ID on database connection issues
          onUserReady("local-user-fallback", false);
        }
      }
    });
  } else {
    // Fake anonymous logging
    setTimeout(() => {
      onUserReady("local-user-device", false);
    }, 150);
  }
}

/**
 * Realtime subscription to a week's habit data.
 */
export async function subscribeToWeek(
  uid: string,
  weekKey: string,
  onData: (data: WeeklyData) => void
): Promise<() => void> {
  const { db } = await initializeFirebaseApp();

  if (db) {
    const { ref, onValue, off } = await import("firebase/database");
    const weekRef = ref(db, `users/${uid}/weeks/${weekKey}`);

    const unsubscribe = onValue(weekRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        // Ensure any structural integrity (e.g. nested objects are fully populated)
        const defaults = createEmptyWeeklyData();
        const merged: WeeklyData = {
          checks: { ...defaults.checks, ...val.checks },
          bossBattle: val.bossBattle ?? "",
          bossDefeated: !!val.bossDefeated,
          financeChecked: !!val.financeChecked,
          themes: { ...defaults.themes, ...val.themes },
          notes: val.notes ?? "",
        };
        onData(merged);
      } else {
        // If no data exists in DB yet, serve empty structure
        onData(createEmptyWeeklyData());
      }
    });

    return () => off(weekRef, "value", unsubscribe);
  } else {
    // Local fallback: read local storage and trigger callback
    const localKey = `la_cuadricula_${uid}_${weekKey}`;
    const localStr = localStorage.getItem(localKey);
    if (localStr) {
      try {
        const parsed = JSON.parse(localStr);
        onData(parsed);
      } catch (e) {
        onData(createEmptyWeeklyData());
      }
    } else {
      onData(createEmptyWeeklyData());
    }

    // Return dummy unsubscribing agent
    return () => {};
  }
}

/**
 * Realtime subscription to lifetime data.
 */
export async function subscribeToLifetime(
  uid: string,
  onData: (data: LifetimeData) => void
): Promise<() => void> {
  const { db } = await initializeFirebaseApp();

  if (db) {
    const { ref, onValue, off } = await import("firebase/database");
    const lifetimeRef = ref(db, `users/${uid}/lifetime`);

    const unsubscribe = onValue(lifetimeRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        onData({
          lifetimeGym: Number(val.lifetimeGym ?? 0),
          cleanDaysTotal: Number(val.cleanDaysTotal ?? 0),
          bossChain: Number(val.bossChain ?? 0),
        });
      } else {
        onData(DEFAULT_LIFETIME_DATA);
      }
    });

    return () => off(lifetimeRef, "value", unsubscribe);
  } else {
    const localKey = `la_cuadricula_${uid}_lifetime`;
    const localStr = localStorage.getItem(localKey);
    if (localStr) {
      try {
        onData(JSON.parse(localStr));
      } catch (e) {
        onData(DEFAULT_LIFETIME_DATA);
      }
    } else {
      onData(DEFAULT_LIFETIME_DATA);
    }
    return () => {};
  }
}

/**
 * Saves weekly data.
 */
export async function updateWeeklyData(uid: string, weekKey: string, data: WeeklyData) {
  const { db } = await initializeFirebaseApp();

  if (db) {
    const { ref, set } = await import("firebase/database");
    const weekRef = ref(db, `users/${uid}/weeks/${weekKey}`);
    await set(weekRef, data);
  } else {
    // Local Storage save
    const localKey = `la_cuadricula_${uid}_${weekKey}`;
    localStorage.setItem(localKey, JSON.stringify(data));
    // Trigger custom storage event for multi-tab sync locally
    window.dispatchEvent(new Event("storage"));
  }
}

/**
 * Saves lifetime data.
 */
export async function updateLifetimeData(uid: string, data: LifetimeData) {
  const { db } = await initializeFirebaseApp();

  if (db) {
    const { ref, set } = await import("firebase/database");
    const lifetimeRef = ref(db, `users/${uid}/lifetime`);
    await set(lifetimeRef, data);
  } else {
    const localKey = `la_cuadricula_${uid}_lifetime`;
    localStorage.setItem(localKey, JSON.stringify(data));
    window.dispatchEvent(new Event("storage"));
  }
}
