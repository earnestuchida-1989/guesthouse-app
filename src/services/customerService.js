import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const CUSTOMERS_COLLECTION = 'customers';

// 顧客一覧をリアルタイム監視（アカウント作成時の選択肢等で使用）
export const onCustomersChange = (callback) => {
  return onSnapshot(collection(db, CUSTOMERS_COLLECTION), (snapshot) => {
    const customers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(customers);
  });
};

// 顧客を簡易追加（マスタデータ未取り込みの段階でも、アカウント管理画面から即席で登録できるようにする）
export const addCustomer = async (name) => {
  const id = `customer_${Date.now()}`;
  await setDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    name,
    type: 'external',
    active: true,
    createdAt: new Date().toISOString(),
  });
  return id;
};

// マスタデータ管理画面用：顧客IDを指定して新規作成（importMasterData.js の顧客マスタと同じ項目構成）。
// 既存IDと重複していないかは呼び出し側（フォーム）で確認する。
export const createCustomer = async (id, data) => {
  await setDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
};

// 既存の顧客情報を更新
export const updateCustomer = async (id, data) => {
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

// 顧客を削除
export const deleteCustomer = async (id) => {
  await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
};

// 顧客IDが既に存在するか確認（新規作成時の重複チェック用）
export const customerExists = async (id) => {
  const snap = await getDoc(doc(db, CUSTOMERS_COLLECTION, id));
  return snap.exists();
};
