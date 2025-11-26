import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyASupJlog6NfalUgW05WxUY08kuH6ZFJPg",
  authDomain: "sap-tracker-5576b.firebaseapp.com",
  projectId: "sap-tracker-5576b",
  storageBucket: "sap-tracker-5576b.firebasestorage.app",
  messagingSenderId: "620881158186",
  appId: "1:620881158186:web:21d0a2076141852009a353",
  measurementId: "G-VGCK5JMT50"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);