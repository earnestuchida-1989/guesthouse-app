import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const PROPERTIES_COLLECTION = 'properties';

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
