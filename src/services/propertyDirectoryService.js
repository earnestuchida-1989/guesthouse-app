import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const COLLECTION = 'propertyDirectory';

/**
 * 物件名→顧客名の軽量な対応表をリアルタイム監視。
 * 「桜」「櫻」のような同名・紛らわしい物件名を、顧客名付きで区別するために使う。
 * 住所・単価等の機微情報は含まない（properties自体は管理者専用のため、
 * スタッフ・協力業者も含めて読めるようこちらを別コレクションとして用意している）。
 * 戻り値: { [propertyName]: { customerId, customerName } }
 */
export const onPropertyDirectoryChange = (callback) => {
  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const map = {};
    snapshot.docs.forEach((d) => {
      map[d.id] = d.data();
    });
    callback(map);
  });
};
