/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Paste your Firebase web app configuration here.
// You can get this from your Firebase Console under Project Settings > General > Your Apps.
export const firebaseConfig = {
  apiKey: "AIzaSyBMFn8TPDPsp-rIKbGY-xKErbblwarVFcY",
  authDomain: "life-management-75ada.firebaseapp.com",
  databaseURL: "https://life-management-75ada-default-rtdb.firebaseio.com",
  projectId: "life-management-75ada",
  storageBucket: "life-management-75ada.firebasestorage.app",
  messagingSenderId: "441749773941",
  appId: "1:441749773941:web:ed5dbd06fed6604730623c"
};

/**
 * Validates if the configuration has been updated with real values.
 */
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" &&
    firebaseConfig.apiKey !== "" &&
    firebaseConfig.projectId !== "YOUR_FIREBASE_PROJECT_ID" &&
    firebaseConfig.projectId !== ""
  );
}
