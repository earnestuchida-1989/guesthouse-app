const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { parseLineMessage } = require('./lineParser');

function sanitizeForId(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * 呼び出し元がadminかどうかを判定（userManagement.jsのassertIsAdminと同ロジック）。
 */
async function assertIsAdmin(db, callerUid) {
  const usersSnap = await db.collection('users').limit(1).get();
  if (usersSnap.empty) {
    return; // ブートストラップ
  }
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }
}

/**
 * LINEの「ノート」等、Webhookで受け取れないテキストを手動貼り付けで取り込む。
 * lineParser.js（Webhookと共通のロジック）でパースし、
 * commit:false ならプレビューのみ、commit:true ならreservationsへ書き込む。
 *
 * configId は lineConfigs コレクションのドキュメントID。
 * 実際のLINEグループ用の設定を流用してもよいし、
 * ノート貼り付け専用の設定（Webhookには絶対来ないダミーID）を別途作ってもよい。
 *
 * 冪等性: 同じテキストを複数回貼り付けても、テキストのハッシュ由来の
 * 決定的なドキュメントIDで上書き（merge）されるだけなので、予約が重複しない。
 */
function makeParseLineNoteText(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    await assertIsAdmin(db, request.auth.uid);

    const { configId, text, commit } = request.data || {};
    if (!configId || !text || !text.trim()) {
      throw new HttpsError('invalid-argument', 'configIdとtextは必須です');
    }

    const configDoc = await db.collection('lineConfigs').doc(configId).get();
    if (!configDoc.exists) {
      throw new HttpsError('not-found', '指定された物件エイリアス設定が見つかりません');
    }
    const config = configDoc.data();
    const entries = parseLineMessage(text, config.propertyAliases || {}, new Date());

    if (!commit || entries.length === 0) {
      return { ok: true, committed: false, entries, clientName: config.clientName || '' };
    }

    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    const batch = db.batch();
    entries.forEach((entry, idx) => {
      const notesText = entry.notes || '';
      const cancelled = notesText.includes('キャンセル');
      const noCleaningNeeded = !cancelled && notesText.includes('清掃不要');

      const docId = `note_${sanitizeForId(configId)}_${hash}_${idx}`;
      const ref = db.collection('reservations').doc(docId);
      batch.set(
        ref,
        {
          propertyName: entry.propertyName,
          cleaningDate: entry.cleaningDate,
          checkInDate: null,
          persons: entry.persons,
          notes: notesText,
          status: cancelled ? 'cancelled' : noCleaningNeeded ? 'no_cleaning_needed' : 'confirmed',
          hasCheckIn: !!entry.hasCheckIn,
          checkInTime: '',
          source: 'line_note',
          lineSourceId: configId,
          lineMessageId: `note_${hash}`,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
    await batch.commit();

    return { ok: true, committed: true, entries, count: entries.length, clientName: config.clientName || '' };
  });
}

module.exports = { makeParseLineNoteText };
