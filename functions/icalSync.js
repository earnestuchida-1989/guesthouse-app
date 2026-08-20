const crypto = require('crypto');
const { parseIcs } = require('./icalParser');

function sanitizeForId(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

// Airbnb/Booking.com等が「オーナーが手動でブロックした日」をカレンダー上のダミー予定として
// 配信することがある（実際のゲスト予約ではない）。清掃予定を作る必要が無いため除外する。
const BLOCKED_SUMMARY_HINT = /not available|blocked|closed|ブロック/i;

/**
 * icalFeedsコレクション（{propertyName, url, active}）を全件見て、
 * アクティブなフィードだけURLを取得・解析し、reservationsへ同期する。
 *
 * 冪等性: ドキュメントIDはフィードID+イベントUIDのハッシュによる決定的なIDなので、
 * 同じ予約を何度同期しても重複しない（既存分はmergeで上書きされるだけ）。
 *
 * 制限: iCalフィードから消えた予約（＝キャンセルされた予約）を検知して自動削除する処理は
 * 未実装（Googleスプレッドシート同期と同じ制限。手動で消す運用）。
 */
async function syncIcalFeeds(db) {
  const feedsSnap = await db.collection('icalFeeds').where('active', '==', true).get();
  const results = [];

  for (const feedDoc of feedsSnap.docs) {
    const feedId = feedDoc.id;
    const feed = feedDoc.data();
    if (!feed.url || !feed.propertyName) {
      results.push({ feedId, error: 'missing url or propertyName' });
      continue;
    }

    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'guesthouse-app-ical-sync/1.0' } });
      if (!res.ok) {
        results.push({ feedId, propertyName: feed.propertyName, error: `HTTP ${res.status}` });
        continue;
      }
      const icsText = await res.text();
      const events = parseIcs(icsText);

      let created = 0;
      let skipped = 0;
      const batch = db.batch();
      for (const event of events) {
        if (BLOCKED_SUMMARY_HINT.test(event.summary || '')) {
          skipped += 1;
          continue;
        }
        const uidSource = event.uid || `${event.startDate}_${event.endDate}`;
        const hash = crypto.createHash('sha256').update(uidSource).digest('hex').slice(0, 16);
        const docId = `ical_${sanitizeForId(feedId)}_${hash}`;
        const ref = db.collection('reservations').doc(docId);
        batch.set(
          ref,
          {
            propertyName: feed.propertyName,
            cleaningDate: event.endDate,
            checkInDate: event.startDate,
            persons: null,
            notes: event.summary || '',
            status: 'confirmed',
            hasCheckIn: false,
            checkInTime: '',
            source: 'ical',
            icalFeedId: feedId,
            icalUid: uidSource,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        created += 1;
      }
      if (created > 0) {
        await batch.commit();
      }
      results.push({ feedId, propertyName: feed.propertyName, ok: true, eventCount: events.length, created, skipped });
    } catch (err) {
      results.push({ feedId, propertyName: feed.propertyName, error: err.message });
    }
  }

  return results;
}

module.exports = { syncIcalFeeds };
