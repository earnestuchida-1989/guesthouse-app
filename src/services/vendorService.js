import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';

const VENDORS_COLLECTION = 'vendors';
const ASSIGNMENTS_COLLECTION = 'propertyAssignments';

// 協力業者一覧をリアルタイム監視
export const onVendorsChange = (callback) => {
  return onSnapshot(collection(db, VENDORS_COLLECTION), (snapshot) => {
    const vendors = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(vendors);
  });
};

// 協力業者を追加
export const addVendor = async ({ name, color }) => {
  const ref = doc(collection(db, VENDORS_COLLECTION));
  await setDoc(ref, {
    name,
    color: color || '#6366F1',
    active: true,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
};

// 協力業者を更新（名前・色・有効状態）
export const updateVendor = async (vendorId, data) => {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorId), data);
};

// 協力業者を削除
export const deleteVendor = async (vendorId) => {
  await deleteDoc(doc(db, VENDORS_COLLECTION, vendorId));
};

// 物件ごとの担当業者割り当てをリアルタイム監視
// 戻り値: { [propertyName]: vendorId }
export const onPropertyAssignmentsChange = (callback) => {
  return onSnapshot(collection(db, ASSIGNMENTS_COLLECTION), (snapshot) => {
    const map = {};
    snapshot.docs.forEach((d) => {
      map[d.id] = d.data().vendorId || null;
    });
    callback(map);
  });
};

// 1件取得（初期表示等で使う場合）
export const getAllPropertyAssignments = async () => {
  const snapshot = await getDocs(collection(db, ASSIGNMENTS_COLLECTION));
  const map = {};
  snapshot.docs.forEach((d) => {
    map[d.id] = d.data().vendorId || null;
  });
  return map;
};

// 物件の担当業者を設定（vendorId=nullで未割当に戻す）
export const setPropertyAssignment = async (propertyName, vendorId) => {
  const ref = doc(db, ASSIGNMENTS_COLLECTION, propertyName);
  if (!vendorId) {
    await setDoc(ref, { vendorId: null, updatedAt: new Date().toISOString() });
  } else {
    await setDoc(ref, { vendorId, updatedAt: new Date().toISOString() });
  }
};
