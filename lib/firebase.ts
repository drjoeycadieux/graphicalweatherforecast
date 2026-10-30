import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only these values are required for Email/Password auth and Firestore.
// databaseURL, storageBucket, and messagingSenderId are optional in a
// Firebase web config, so they must not block initialization.
const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;

const missingConfigKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
const hasFirebaseConfig = missingConfigKeys.length === 0;

export const firebaseConfigMissingKeys: string[] = missingConfigKeys.map(
  (key) => `NEXT_PUBLIC_FIREBASE_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`,
);

const app = hasFirebaseConfig ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
