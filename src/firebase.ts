import { initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
function getApp() {
  if (!firebaseConfigured) throw new Error('Firebase is not configured (missing VITE_FIREBASE_* values).');
  if (!app) app = initializeApp(config);
  return app;
}
export const auth = (): Auth => getAuth(getApp());
export const db = (): Firestore => getFirestore(getApp());

export async function ensureAnonymousUser() {
  const a = auth();
  await a.authStateReady();
  if (!a.currentUser) await signInAnonymously(a);
  return a.currentUser!;
}

/** Admin allowlist, resolved at build time (see vite.config.ts). */
export const ADMIN_EMAILS: string[] = (__ADMIN_EMAILS__ as string)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Auth helpers used by the console (kept here so tests can swap this module for a fake).
export const watchAuth = (cb: (u: User | null) => void) => onAuthStateChanged(auth(), cb);
export const signInWithGoogle = () => signInWithPopup(auth(), new GoogleAuthProvider());
export const signOutUser = () => signOut(auth());
