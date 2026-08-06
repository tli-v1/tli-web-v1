import { getApps, initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

function normalizeAuthDomain(value: string | undefined): string | undefined {
  if (!value) return value;

  try {
    const withProtocol = value.includes('://') ? value : `https://${value}`;
    return new URL(withProtocol).hostname;
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: normalizeAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
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
let appCheckInstance: AppCheck | null = null;

try {
  const recaptchaEnterpriseSiteKey =
    import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
    || '6LdwunUtAAAAAH9joEv_Zff147zIVthbw8q831Vj';

  if (typeof window !== 'undefined' && recaptchaEnterpriseSiteKey) {
    if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
    }

    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (error) {
  console.warn('App Check not available:', error);
}

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

export { app, appCheckInstance as appCheck, auth, db, functions, storage };
export const analytics = analyticsInstance;
