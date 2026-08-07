import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "guesthouse-schedule-app.firebaseapp.com",
  projectId: "guesthouse-schedule-app",
  storageBucket: "guesthouse-schedule-app.firebasestorage.app",
  messagingSenderId: "297795687377",
  appId: "1:297795687377:web:f0dd1b50931696f65746f0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
