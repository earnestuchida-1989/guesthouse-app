const { onCall, HttpsError } = require('firebase-functions/v2/https');

/**
 * 清掃予定の「リネン準備OK」チェックを更新する。
 * 物件マスタ（properties、管理者限定）の在庫を差し引く必要があるため、
 * スタッフ・協力業者からもこのCloud Function（Admin SDK経由）を通す。
 *
 * - 物件がリネン在庫を保管している（linenTracking.storesOnSite）場合：
 *   チェックON時に各品目の最低枚数分だけ在庫を差し引き、チェックOFF時に戻す
 *   （linenStockAppliedフラグで二重適用を防ぐ）。
 * - 保管していない、またはリネン管理自体を使っていない物件は、単にチェック状態だけ記録する。
 */
function makeApplyLinenCheck(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    const { reservationId, checked } = request.data || {};
    if (!reservationId || typeof checked !== 'boolean') {
      throw new HttpsError('invalid-argument', 'reservationIdとcheckedは必須です');
    }

    const resRef = db.collection('reservations').doc(reservationId);

    await db.runTransaction(async (tx) => {
      const resSnap = await tx.get(resRef);
      if (!resSnap.exists) {
        throw new HttpsError('not-found', '予約が見つかりません');
      }
      const res = resSnap.data();
      const propertyName = res.propertyName || res.guestName;
      if (!propertyName) {
        throw new HttpsError('failed-precondition', '物件名が不明です');
      }

      const propRef = db.collection('properties').doc(propertyName);
      const propSnap = await tx.get(propRef);
      const linenTracking = propSnap.exists ? propSnap.data().linenTracking : null;
      const storesOnSite = !!(linenTracking && linenTracking.storesOnSite);
      const items = (linenTracking && Array.isArray(linenTracking.items)) ? linenTracking.items : [];
      const alreadyApplied = !!res.linenStockApplied;
      const now = new Date().toISOString();

      if (storesOnSite && items.length > 0 && checked && !alreadyApplied) {
        const newItems = items.map((it) => ({
          ...it,
          currentStock:
            typeof it.currentStock === 'number' ? Math.max(0, it.currentStock - (it.minQuantity || 0)) : it.currentStock,
        }));
        tx.update(propRef, { 'linenTracking.items': newItems, updatedAt: now });
        tx.update(resRef, { linenChecked: true, linenStockApplied: true, linenCheckedAt: now, linenCheckedBy: request.auth.uid });
      } else if (storesOnSite && items.length > 0 && !checked && alreadyApplied) {
        const newItems = items.map((it) => ({
          ...it,
          currentStock: typeof it.currentStock === 'number' ? it.currentStock + (it.minQuantity || 0) : it.currentStock,
        }));
        tx.update(propRef, { 'linenTracking.items': newItems, updatedAt: now });
        tx.update(resRef, { linenChecked: false, linenStockApplied: false, linenCheckedAt: now, linenCheckedBy: request.auth.uid });
      } else {
        tx.update(resRef, { linenChecked: checked, linenCheckedAt: now, linenCheckedBy: request.auth.uid });
      }
    });

    return { ok: true };
  });
}

module.exports = { makeApplyLinenCheck };
