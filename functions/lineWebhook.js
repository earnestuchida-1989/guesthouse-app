const crypto = require('crypto');
const { parseLineMessage } = require('./lineParser');

/**
 * LINE署名検証（HMAC-SHA256, base64）
 */
function verifySignature(rawBody, signature, channelSecret) {
  if (!signature) return false;
  const hash = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  return hash === signature;
}

function sanitizeForId(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * イベントのsourceからLINE側の識別子（グループ/ルーム/個人）を取得
 */
function getSourceId(event) {
  const s = event.source || {};
  return s.groupId || s.roomId || s.userId || 'unknown';
}

/**
 * 1件のLINE textメッセージイベントを処理し、該当するlineConfigがあれば
 * Firestoreのreservationsコレクションへupsertする。
 * lineConfigsコレクション: { id: sourceId, active, clientName, propertyAliases: {エイリアス: 正式物件名} }
 */
async function handleTextMessageEvent(db, event) {
  const sourceId = getSourceId(event);
  const text = event.message && event.message.text;
  const messageId = event.message && event.message.id;
  if (!text || !messageId) return { skipped: true, reason: 'no-text' };

  const configDoc = await db.collection('lineConfigs').doc(sourceId).get();
  if (!configDoc.exists) {
    return { skipped: true, reason: 'unregistered-source', sourceId, textPreview: text.slice(0, 80) };
  }
  const config = configDoc.data();
  if (!config.active) {
    return { skipped: true, reason: 'inactive-source', sourceId };
  }

  const entries = parseLineMessage(text, config.propertyAliases || {});
  if (entries.length === 0) {
    return { skipped: true, reason: 'no-entries-parsed', sourceId, textPreview: text.slice(0, 80) };
  }

  const batch = db.batch();
  entries.forEach((entry, idx) => {
    const notesLower = entry.notes || '';
    const cancelled = notesLower.includes('キャンセル');
    const noCleaningNeeded = !cancelled && notesLower.includes('清掃不要');

    const docId = `line_${sanitizeForId(messageId)}_${idx}`;
    const ref = db.collection('reservations').doc(docId);
    batch.set(
      ref,
      {
        propertyName: entry.propertyName,
        cleaningDate: entry.cleaningDate,
        checkInDate: null,
        persons: entry.persons,
        notes: entry.notes || '',
        status: cancelled ? 'cancelled' : noCleaningNeeded ? 'no_cleaning_needed' : 'confirmed',
        hasCheckIn: !!entry.hasCheckIn,
        checkInTime: '',
        source: 'line',
        lineSourceId: sourceId,
        lineMessageId: messageId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });
  await batch.commit();

  return { ok: true, sourceId, count: entries.length };
}

/**
 * Webhookのリクエストボディ全体（複数イベント）を処理
 */
async function processLineEvents(db, events) {
  const results = [];
  for (const event of events) {
    if (event.type === 'message' && event.message && event.message.type === 'text') {
      try {
        const r = await handleTextMessageEvent(db, event);
        results.push(r);
      } catch (err) {
        results.push({ error: err.message });
      }
    }
  }
  return results;
}

module.exports = { verifySignature, processLineEvents, getSourceId };
