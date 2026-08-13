import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

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
