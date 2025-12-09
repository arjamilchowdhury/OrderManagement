import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// Cast import.meta to any to access env properties without missing type definitions
const env = (import.meta as any).env;

const firebaseConfig = {
  apiKey: env?.VITE_FIREBASE_API_KEY || "AIzaSyASupJlog6NfalUgW05WxUY08kuH6ZFJPg",
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || "sap-tracker-5576b.firebaseapp.com",
  // CRITICAL FIX: explicit databaseURL is required for custom domains
  databaseURL: env?.VITE_FIREBASE_DATABASE_URL || "https://sap-tracker-5576b-default-rtdb.firebaseio.com",
  projectId: env?.VITE_FIREBASE_PROJECT_ID || "sap-tracker-5576b",
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || "sap-tracker-5576b.firebasestorage.app",
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "620881158186",
  appId: env?.VITE_FIREBASE_APP_ID || "1:620881158186:web:21d0a2076141852009a353",
  measurementId: env?.VITE_FIREBASE_MEASUREMENT_ID || "G-VGCK5JMT50"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);