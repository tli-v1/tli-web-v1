import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase configuration is missing required fields');
}

const existingApps = getApps();
const app = existingApps.length ? existingApps[0]! : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
const storage = getStorage(app);
let analyticsInstance: Analytics | null = null;

try {
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    analyticsInstance = getAnalytics(app);
  }
} catch (error) {
  console.warn('Analytics not available:', error);
}

export { app, auth, db, functions, storage };
export const analytics = analyticsInstance;
