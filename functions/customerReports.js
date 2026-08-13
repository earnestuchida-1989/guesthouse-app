const { onCall, HttpsError } = require('firebase-functions/v2/https');

/**
 * 顧客アカウント向け：自分の物件の「完了報告」だけを返す。
 *
 * 物件マスタ（properties）は管理者以外読み取り不可（住所・清掃単価・マネージャー連絡先などを
 * 含むため）にしたので、顧客ポータル（CustomerReports.jsx）はクライアントから直接
 * properties/reservations を読まず、この関数経由で必要最小限のフィールドだけを取得する。
 */
function makeGetMyCustomerReports(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerDoc.exists ? callerDoc.data() : null;
    if (!callerData || callerData.role !== 'customer' || !callerData.customerId) {
      throw new HttpsError('permission-denied', '顧客アカウントのみ利用できます');
    }
    const customerId = callerData.customerId;

    // 自社の物件一覧を取得
    const propsSnap = await db
      .collection('properties')
      .where('customerId', '==', customerId)
      .get();
    const propertyNames = propsSnap.docs.map((d) => d.id);
    if (propertyNames.length === 0) {
      return { reports: [] };
    }

    // 完了報告済みの予定のみ、必要なフィールドだけを抜き出して返す
    const reservationsSnap = await db
      .collection('reservations')
      .where('completed', '==', true)
      .get();

    const reports = reservationsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => propertyNames.includes(r.propertyName || r.guestName))
      .map((r) => ({
        id: r.id,
        propertyName: r.propertyName || r.guestName,
        cleaningDate: r.cleaningDate || r.checkOut || '',
        completedAt: r.completedAt || null,
        photoUrls: r.photoUrls || [],
        reportNote: r.reportNote || '',
        customerFeedback: r.customerFeedback || '',
        customerFeedbackAt: r.customerFeedbackAt || null,
        customerFeedbackPhotos: r.customerFeedbackPhotos || [],
      }));

    return { reports };
  });
}

module.exports = { makeGetMyCustomerReports };
