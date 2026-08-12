import { db } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const functions = getFunctions(undefined, 'asia-northeast1');

// ユーザー一覧をリアルタイム監視
export const onUsersChange = (callback) => {
  return onSnapshot(collection(db, USERS_COLLECTION), (snapshot) => {
    const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(users);
  });
};

// 単一ユーザーのロール情報を取得（App.jsxでの権限判定用）
export const getUserDoc = async (uid) => {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snap.exists() ? snap.data() : null;
};

// 新規スタッフ/管理者アカウントを作成（管理者専用、Cloud Function経由）
export const createStaffAccount = async ({ email, displayName, role }) => {
  const fn = httpsCallable(functions, 'createStaffAccount');
  const res = await fn({ email, displayName, role });
  return res.data; // { uid, email, tempPassword }
};

// ロール変更（管理者専用）
export const setUserRole = async (uid, role) => {
  const fn = httpsCallable(functions, 'setUserRole');
  await fn({ uid, role });
};

// 有効/無効切り替え（管理者専用）
export const setUserActive = async (uid, active) => {
  const fn = httpsCallable(functions, 'setUserActive');
  await fn({ uid, active });
};
