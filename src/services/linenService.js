import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(undefined, 'asia-northeast1');

// 清掃予定の「リネン準備OK」チェックを切り替える（在庫管理している物件は自動で在庫を増減）
export const applyLinenCheck = async (reservationId, checked) => {
  const fn = httpsCallable(functions, 'applyLinenCheck');
  await fn({ reservationId, checked });
};
