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

      // 確認コードが一致する予約が既にある場合（＝iCal同期が先に作成済み）は、
      // 新規レコードを作らず、その予約に人数などを追記するだけにする（重複防止）。
      let existingRef = null;
      if (parsed.confirmationCode) {
        const matchSnap = await db
          .collection('reservations')
          .where('confirmationCode', '==', parsed.confirmationCode)
          .limit(1)
          .get();
        if (!matchSnap.empty) {
          existingRef = matchSnap.docs[0].ref;
        }
      }

      const hash = crypto.createHash('sha256').update(msg.id).digest('hex').slice(0, 16);
      const docId = `email_${sanitizeForId(hash)}`;
      const ref = existingRef || db.collection('reservations').doc(docId);
      const notes = `Airbnb予約 / ゲスト:${parsed.guestName || '不明'} / 確認コード:${parsed.confirmationCode || '不明'} / チェックイン:${parsed.checkInDate} ${parsed.checkInTime} / チェックアウト:${parsed.checkOutDate} ${parsed.checkOutTime} / 人数:${parsed.guestCountRaw || ''}`;

      if (existingRef) {
        // 既存（iCal由来など）の予約に人数・備考だけ追記する。日付や物件名は上書きしない
        // （iCal側の方が今後も自動更新され続ける正のデータのため）。
        await existingRef.set(
          {
            persons: parsed.persons,
            notes,
            confirmationCode: parsed.confirmationCode,
            emailMessageId: msg.id,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await ref.set(
          {
            propertyName: parsed.propertyName,
            cleaningDate: parsed.checkOutDate,
            checkInDate: parsed.checkInDate,
            persons: parsed.persons,
            notes,
            status: 'confirmed',
            hasCheckIn: false,
            checkInTime: '',
            source: 'email',
            confirmationCode: parsed.confirmationCode,
            emailMessageId: msg.id,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      await processedRef.set({
        subject: msg.subject,
        reason: 'ok',
        propertyName: parsed.propertyName,
        cleaningDate: parsed.checkOutDate,
        mergedIntoExisting: !!existingRef,
        processedAt: new Date().toISOString(),
      });
      results.push({
        messageId: msg.id,
        ok: true,
        propertyName: parsed.propertyName,
        cleaningDate: parsed.checkOutDate,
        mergedIntoExisting: !!existingRef,
      });
    } catch (err) {
      // エラー時はprocessedEmailMessagesに記録しない＝次回また再試行される
      results.push({ messageId: msg.id, error: err.message });
    }
  }

  return results;
}

module.exports = { syncAirbnbEmails };
