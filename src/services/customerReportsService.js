import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(undefined, 'asia-northeast1');

// 顧客アカウント本人の完了報告一覧を取得（Cloud Function経由）。
// properties/reservations を直接読まないため、物件マスタを管理者専用にしても影響を受けない。
export const getMyCustomerReports = async () => {
  const fn = httpsCallable(functions, 'getMyCustomerReports');
  const res = await fn();
  return res.data.reports || [];
};
