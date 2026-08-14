import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const PROPERTIES_COLLECTION = 'properties';
const DIRECTORY_COLLECTION = 'propertyDirectory';

/**
 * Firestoreの物件マスタ（properties コレクション、doc ID=物件名）をリアルタイム監視。
 * 戻り値: { [propertyName]: { cleaningPrice, customerId, propertyId, ... } }
 * マスタ未取り込みの物件は含まれないため、呼び出し側は static な propertyPrices.js への
 * フォールバックと併用すること。
 */
export const onPropertiesChange = (callback) => {
  return onSnapshot(collection(db, PROPERTIES_COLLECTION), (snapshot) => {
    const map = {};
    snapshot.docs.forEach((d) => {
      map[d.id] = d.data();
    });
    callback(map);
  });
};

// 物件名が既に存在するか確認（新規作成時の重複チェック用）
export const propertyExists = async (propertyName) => {
  const snap = await getDoc(doc(db, PROPERTIES_COLLECTION, propertyName));
  return snap.exists();
};

// propertyDirectory（物件名→顧客名・有効状態の軽量コピー、スタッフ・協力業者も読める）を同期更新。
// 清掃予定作成の物件選択リストなど、properties（管理者限定）を直接読めない画面はこちらを使う。
const syncPropertyDirectory = async (propertyName, customerId, customerName, active) => {
  await setDoc(doc(db, DIRECTORY_COLLECTION, propertyName), {
    customerId: customerId || '',
    customerName: customerId ? (customerName || customerId) : '',
    active: active !== false,
    updatedAt: new Date().toISOString(),
  });
};

// マスタデータ管理画面用：物件を新規作成（doc ID=物件名。作成後は物件名を変更しない運用とする。
// 予約データ等が物件名の文字列で紐付いているため、リネームすると既存の予約と紐付かなくなる）
export const addProperty = async (propertyName, data, customerName) => {
  await setDoc(doc(db, PROPERTIES_COLLECTION, propertyName), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  await syncPropertyDirectory(propertyName, data.customerId, customerName, data.active);
  return propertyName;
};

// 既存の物件情報を更新
export const updateProperty = async (propertyName, data, customerName) => {
  await updateDoc(doc(db, PROPERTIES_COLLECTION, propertyName), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  await syncPropertyDirectory(propertyName, data.customerId, customerName, data.active);
};

// 物件を削除（物件ディレクトリも合わせて削除。清掃予定・担当割り当ては削除しないので、
// 削除前に既存の予約・割り当てがないか呼び出し側で確認すること）
export const deleteProperty = async (propertyName) => {
  await deleteDoc(doc(db, PROPERTIES_COLLECTION, propertyName));
  await deleteDoc(doc(db, DIRECTORY_COLLECTION, propertyName));
};
