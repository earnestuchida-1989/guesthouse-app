import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';

const RESERVATIONS_COLLECTION = 'reservations';

// 予約を追加
export const addReservation = async (reservationData) => {
  try {
    const docRef = await addDoc(collection(db, RESERVATIONS_COLLECTION), {
      ...reservationData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return docRef.id;
  } catch (error) {
    console.error('予約追加エラー:', error);
    throw error;
  }
};

// すべての予約を取得
export const getAllReservations = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, RESERVATIONS_COLLECTION));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('予約取得エラー:', error);
    throw error;
  }
};

// リアルタイム監視
export const onReservationsChange = (callback) => {
  const unsubscribe = onSnapshot(collection(db, RESERVATIONS_COLLECTION), (snapshot) => {
    const reservations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(reservations);
  });
  return unsubscribe;
};

// 予約を更新
export const updateReservation = async (id, reservationData) => {
  try {
    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), {
      ...reservationData,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('予約更新エラー:', error);
    throw error;
  }
};

// 予約を削除
export const deleteReservation = async (id) => {
  try {
    await deleteDoc(doc(db, RESERVATIONS_COLLECTION, id));
  } catch (error) {
    console.error('予約削除エラー:', error);
    throw error;
  }
};
