import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * 清掃完了報告の写真をアップロードし、ダウンロードURLを返す。
 */
export const uploadReservationPhoto = async (reservationId, file) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `reservations/${reservationId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

/**
 * 複数枚まとめてアップロード
 */
export const uploadReservationPhotos = async (reservationId, files) => {
  const urls = [];
  for (const file of files) {
    const url = await uploadReservationPhoto(reservationId, file);
    urls.push(url);
  }
  return urls;
};
