import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const EMPLOYEES_COLLECTION = 'employees';

// 従業員一覧をリアルタイム監視（マスタデータ管理・アカウント管理の紐付け選択で使用）
export const onEmployeesChange = (callback) => {
  return onSnapshot(collection(db, EMPLOYEES_COLLECTION), (snapshot) => {
    const employees = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(employees);
  });
};

// マスタデータ管理画面用：従業員IDを指定して新規作成（importMasterData.js の従業員マスタと同じ項目構成）
export const createEmployee = async (id, data) => {
  await setDoc(doc(db, EMPLOYEES_COLLECTION, id), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
};

// 既存の従業員情報を更新
export const updateEmployee = async (id, data) => {
  await updateDoc(doc(db, EMPLOYEES_COLLECTION, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

// 従業員を削除
export const deleteEmployee = async (id) => {
  await deleteDoc(doc(db, EMPLOYEES_COLLECTION, id));
};

// 従業員IDが既に存在するか確認（新規作成時の重複チェック用）
export const employeeExists = async (id) => {
  const snap = await getDoc(doc(db, EMPLOYEES_COLLECTION, id));
  return snap.exists();
};
