import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const ICAL_FEEDS_COLLECTION = 'icalFeeds';

// iCalフィード一覧をリアルタイム監視
export const onIcalFeedsChange = (callback) => {
  return onSnapshot(collection(db, ICAL_FEEDS_COLLECTION), (snapshot) => {
    const feeds = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(feeds);
  });
};

// 新規フィードを追加（{ propertyName, url, label }）
export const addIcalFeed = async ({ propertyName, url, label }) => {
  await addDoc(collection(db, ICAL_FEEDS_COLLECTION), {
    propertyName,
    url,
    label: label || '',
    active: true,
    createdAt: new Date().toISOString(),
  });
};

// フィードを更新（有効/無効切り替え等）
export const updateIcalFeed = async (id, data) => {
  await updateDoc(doc(db, ICAL_FEEDS_COLLECTION, id), data);
};

// フィードを削除
export const deleteIcalFeed = async (id) => {
  await deleteDoc(doc(db, ICAL_FEEDS_COLLECTION, id));
};
