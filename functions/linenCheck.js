const { onCall, HttpsError } = require('firebase-functions/v2/https');

// 品目の必要数＝基本数＋1人あたり×宿泊人数＋（◯名超過分の追加ルール）
// 例：タカのピロー（基本4、2名を超えたら1人あたり+1）なら、3名予約で5枚。
// 人数未定の予約は基本数（＋通常の1人あたり分）のみで計算し、超過ルールは適用しない。
function requiredQuantity(item, persons) {
  let total = (item.minQuantity || 0) + (item.perPerson || 0) * (persons || 0);
  if (typeof item.thresholdPersons === 'number' && typeof persons === 'number' && persons > item.thresholdPersons) {
    total += (item.extraPerPerson || 0) * (persons - item.thresholdPersons);
  }
  return total;
}

/**
 * 清掃予定の「リネン準備OK」チェックを更新する。
 * 物件マスタ（properties、管理者限定）の在庫を差し引く必要があるため、
 * スタッフ・協力業者からもこのCloud Function（Admin SDK経由）を通す。
 *
 * - 物件がリネン在庫を保管している（linenTracking.storesOnSite）場合：
 *   チェックON時に各品目の必要数（基本数＋1人あたり×人数）分だけ在庫を差し引く。
 *   差し引いた数量そのものを予約側（linenStockAppliedItems）に記録しておき、
 *   チェックOFF時はその記録値をそのまま在庫へ戻す（品目設定が後で変わっても
 *   チェック時点の数量で正しく戻せるようにするため。二重適用防止はlinenStockAppliedフラグ）。
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
        const appliedItems = items.map((it) => ({ name: it.name, qty: requiredQuantity(it, res.persons) }));
        const newItems = items.map((it) => {
          const qty = appliedItems.find((a) => a.name === it.name)?.qty || 0;
          return {
            ...it,
            currentStock: typeof it.currentStock === 'number' ? Math.max(0, it.currentStock - qty) : it.currentStock,
          };
        });
        tx.update(propRef, { 'linenTracking.items': newItems, updatedAt: now });
        tx.update(resRef, {
          linenChecked: true,
          linenStockApplied: true,
          linenStockAppliedItems: appliedItems,
          linenCheckedAt: now,
          linenCheckedBy: request.auth.uid,
        });
      } else if (storesOnSite && items.length > 0 && !checked && alreadyApplied) {
        const appliedItems = Array.isArray(res.linenStockAppliedItems)
          ? res.linenStockAppliedItems
          : items.map((it) => ({ name: it.name, qty: requiredQuantity(it, res.persons) }));
        const newItems = items.map((it) => {
          const qty = appliedItems.find((a) => a.name === it.name)?.qty || 0;
          return {
            ...it,
            currentStock: typeof it.currentStock === 'number' ? it.currentStock + qty : it.currentStock,
          };
        });
        tx.update(propRef, { 'linenTracking.items': newItems, updatedAt: now });
        tx.update(resRef, {
          linenChecked: false,
          linenStockApplied: false,
          linenStockAppliedItems: [],
          linenCheckedAt: now,
          linenCheckedBy: request.auth.uid,
        });
      } else {
        tx.update(resRef, { linenChecked: checked, linenCheckedAt: now, linenCheckedBy: request.auth.uid });
      }
    });

    return { ok: true };
  });
}

module.exports = { makeApplyLinenCheck };
