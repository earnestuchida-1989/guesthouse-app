import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * 画像をブラウザ上でリサイズ・再エンコードしてからアップロードする。
 * スマホで撮影した写真をまとめて（数十枚）アップロードする際、
 * 通信量・時間・Storage容量を大きく削減するために圧縮を必須で行う。
 * 圧縮に失敗した場合は元ファイルをそのまま使う（アップロード自体は止めない）。
 */
const compressImage = (file, maxSize = 1600, quality = 0.75) => {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
};

/**
 * 清掃完了報告・顧客フィードバックの写真をアップロードし、ダウンロードURLを返す。
 */
export const uploadReservationPhoto = async (reservationId, file) => {
  const compressed = await compressImage(file);
  const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '');
  const random = Math.random().toString(36).slice(2, 8);
  const path = `reservations/${reservationId}/${Date.now()}_${random}_${baseName}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
};

/**
 * 複数枚まとめてアップロード（同時3枚まで並列処理）。
 * onProgress(完了枚数, 総枚数) を渡すと進捗を通知する。
 * 現場で50枚前後の写真をまとめてアップロードするケースを想定した速度・UX対応。
 */
export const uploadReservationPhotos = async (reservationId, files, onProgress) => {
  const fileList = Array.from(files);
  const urls = new Array(fileList.length);
  let completed = 0;
  let nextIndex = 0;
  const concurrency = Math.min(3, fileList.length) || 1;

  const worker = async () => {
    while (nextIndex < fileList.length) {
      const current = nextIndex;
      nextIndex += 1;
      urls[current] = await uploadReservationPhoto(reservationId, fileList[current]);
      completed += 1;
      if (onProgress) onProgress(completed, fileList.length);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return urls;
};
