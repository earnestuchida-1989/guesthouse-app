import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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

// Firestoreのオフラインキャッシュを有効化。
// 現場（電波が悪いゲストハウス）で一度読み込んだ清掃予定を、オフライン時も表示できるようにする。
// 複数タブを開いても1つのキャッシュを共有する設定（persistentMultipleTabManager）。
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// 清掃完了報告の写真保存用
export const storage = getStorage(app);
