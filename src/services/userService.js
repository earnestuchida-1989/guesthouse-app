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

// 新規スタッフ/管理者/協力業者/顧客アカウントを作成（管理者専用、Cloud Function経由）
export const createStaffAccount = async ({ email, displayName, role, vendorId, customerId, employeeId }) => {
  const fn = httpsCallable(functions, 'createStaffAccount');
  const res = await fn({ email, displayName, role, vendorId, customerId, employeeId });
  return res.data; // { uid, email, tempPassword }
};

// ロール変更（管理者専用）
export const setUserRole = async (uid, role, vendorId, customerId) => {
  const fn = httpsCallable(functions, 'setUserRole');
  await fn({ uid, role, vendorId, customerId });
};

// 従業員マスタとの紐付けを設定/解除（管理者専用）
export const setUserEmployeeLink = async (uid, employeeId) => {
  const fn = httpsCallable(functions, 'setUserEmployeeLink');
  await fn({ uid, employeeId });
};

// 有効/無効切り替え（管理者専用）
export const setUserActive = async (uid, active) => {
  const fn = httpsCallable(functions, 'setUserActive');
  await fn({ uid, active });
};

// パスワード再発行（管理者専用、Cloud Function経由）
export const resetUserPassword = async (uid) => {
  const fn = httpsCallable(functions, 'resetUserPassword');
  const res = await fn({ uid });
  return res.data; // { uid, email, tempPassword }
};
