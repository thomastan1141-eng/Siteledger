import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:0:web:demo",
};

export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
);

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

function getFirebaseApp() {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export const auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    if (!authInstance) authInstance = getAuth(getFirebaseApp());
    const value = Reflect.get(authInstance, prop, receiver);
    return typeof value === "function" ? value.bind(authInstance) : value;
  },
});

export const db = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
    const value = Reflect.get(dbInstance, prop, receiver);
    return typeof value === "function" ? value.bind(dbInstance) : value;
  },
});

export const storage = new Proxy({} as FirebaseStorage, {
  get(_target, prop, receiver) {
    if (!storageInstance) storageInstance = getStorage(getFirebaseApp());
    const value = Reflect.get(storageInstance, prop, receiver);
    return typeof value === "function" ? value.bind(storageInstance) : value;
  },
});

export default getFirebaseApp;
