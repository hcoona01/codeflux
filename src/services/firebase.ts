import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { getFirestore, setLogLevel, type Firestore } from 'firebase/firestore'

try {
  setLogLevel('silent')
} catch {
  // ignore
}

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCbVD4VJU3Ut6RRDuMw6rkXpdH8or1wBOc',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'vertos-omniroute.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vertos-omniroute',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'vertos-omniroute.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '489464686555',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:489464686555:web:35118029e2953fea0c29fe',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-2NFVJVYE05',
}

// Initialize Firebase client instance
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
export const auth = getAuth(app)

let dbInstance: Firestore | null = null
try {
  if (firebaseConfig.projectId && firebaseConfig.projectId !== 'your_firebase_project_id') {
    dbInstance = getFirestore(app)
  }
} catch (err) {
  console.warn('[Firebase] Firestore init skipped/error:', err)
}

export const db = dbInstance

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), pass)
  return credential.user
}

export async function registerWithEmail(email: string, pass: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass)
  return credential.user
}

export async function logoutUser(): Promise<void> {
  await signOut(auth)
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export async function getCurrentUserToken(): Promise<string | null> {
  if (!auth.currentUser) return null
  try {
    return await auth.currentUser.getIdToken()
  } catch (err) {
    console.error('Error fetching ID token:', err)
    return null
  }
}
