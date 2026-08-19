const crypto = require('crypto');
const { buildGmailClient, fetchRecentMessages } = require('./gmailClient');
const { parseAirbnbEmail } = require('./emailParser');

function sanitizeForId(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * earnest.yoyaku@gmail.com の受信箱を直近分だけ確認し、Airbnb予約確定メールを
 * 解析してreservationsへ書き込む。
 *
 * 「処理済みかどうか」はGmail側のラベルではなく、Firestoreの
 * processedEmailMessages コレクション（ドキュメントID＝メッセージID）で管理する。
 * gmail.readonlyスコープのみで完結させるための設計（ラベル付与にはgmail.modify権限が
 * 別途必要で、その場合ユーザーに再度OAuth同意を取ってもらう手間が発生するため避けた）。
 *
 * listingAliases: { "Airbnb掲載名": "物件マスタの物件名", ... }（emailConfigs/airbnbから取得）
 */
async function syncAirbnbEmails(db, gmailCredentials, listingAliases) {
  const gmail = buildGmailClient(gmailCredentials);
  const messages = await fetchRecentMessages(gmail, { maxResults: 20 });

  const results = [];
  for (const msg of messages) {
    const processedRef = db.collection('processedEmailMessages').doc(msg.id);
    const processedDoc = await processedRef.get();
    if (processedDoc.exists) {
      continue; // 既に確認済みのメールはスキップ（ログに出さない、静かにスキップ）
    }

    try {
      const parsed = parseAirbnbEmail(msg, listingAliases, new Date());
      if (!parsed) {
        // Airbnb確定メールではない、または想定フォーマットから外れている
        await processedRef.set({ subject: msg.subject, reason: 'not-recognized', processedAt: new Date().toISOString() });
        results.push({ messageId: msg.id, skipped: true, reason: 'not-recognized', subject: msg.subject });
        continue;
      }

      if (!parsed.propertyName) {
        // リスティング名が未登録＝物件マッピングが無い。予約は作らず、要対応として記録だけする。
        await processedRef.set({
          subject: msg.subject,
          reason: 'unmapped-listing',
          checkOutDate: parsed.checkOutDate,
          processedAt: new Date().toISOString(),
        });
        results.push({
          messageId: msg.id,
          skipped: true,
          reason: 'unmapped-listing',
          subject: msg.subject,
          checkOutDate: parsed.checkOutDate,
        });
        continue;
      }

      const hash = crypto.createHash('sha256').update(msg.id).digest('hex').slice(0, 16);
      const docId = `email_${sanitizeForId(hash)}`;
      await db
        .collection('reservations')
        .doc(docId)
        .set(
          {
            propertyName: parsed.propertyName,
            cleaningDate: parsed.checkOutDate,
            checkInDate: parsed.checkInDate,
            persons: parsed.persons,
            notes: `Airbnb予約 / ゲスト:${parsed.guestName || '不明'} / 確認コード:${parsed.confirmationCode || '不明'} / チェックイン:${parsed.checkInDate} ${parsed.checkInTime} / チェックアウト:${parsed.checkOutDate} ${parsed.checkOutTime} / 人数:${parsed.guestCountRaw || ''}`,
            status: 'confirmed',
            hasCheckIn: false,
            checkInTime: '',
            source: 'email',
            emailMessageId: msg.id,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      await processedRef.set({
        subject: msg.subject,
        reason: 'ok',
        propertyName: parsed.propertyName,
        cleaningDate: parsed.checkOutDate,
        processedAt: new Date().toISOString(),
      });
      results.push({ messageId: msg.id, ok: true, propertyName: parsed.propertyName, cleaningDate: parsed.checkOutDate });
    } catch (err) {
      // エラー時はprocessedEmailMessagesに記録しない＝次回また再試行される
      results.push({ messageId: msg.id, error: err.message });
    }
  }

  return results;
}

module.exports = { syncAirbnbEmails };
