const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const { syncAllSheets } = require('./sheetSync');
const { verifySignature, processLineEvents } = require('./lineWebhook');
const { makeParseLineNoteText } = require('./lineNoteImport');
const { syncAirbnbEmails } = require('./emailSync');
const { syncIcalFeeds } = require('./icalSync');
const { makeApplyLinenCheck } = require('./linenCheck');
const {
  makeCreateStaffAccount,
  makeClearMustChangePassword,
  makeSetUserRole,
  makeSetUserEmployeeLink,
  makeSetUserActive,
  makeResetUserPassword,
} = require('./userManagement');
const { makeGetMyCustomerReports } = require('./customerReports');

initializeApp();
const db = getFirestore();

exports.createStaffAccount = makeCreateStaffAccount(db);
exports.clearMustChangePassword = makeClearMustChangePassword(db);
exports.setUserRole = makeSetUserRole(db);
exports.setUserEmployeeLink = makeSetUserEmployeeLink(db);
exports.setUserActive = makeSetUserActive(db);
exports.resetUserPassword = makeResetUserPassword(db);
exports.getMyCustomerReports = makeGetMyCustomerReports(db);
exports.parseLineNoteText = makeParseLineNoteText(db);
exports.applyLinenCheck = makeApplyLinenCheck(db);

const GOOGLE_SERVICE_ACCOUNT_KEY = defineSecret('GOOGLE_SERVICE_ACCOUNT_KEY');
const SYNC_SECRET = defineSecret('SYNC_SECRET');
const LINE_CHANNEL_SECRET = defineSecret('LINE_CHANNEL_SECRET');
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');
const GMAIL_OAUTH_CLIENT_ID = defineSecret('GMAIL_OAUTH_CLIENT_ID');
const GMAIL_OAUTH_CLIENT_SECRET = defineSecret('GMAIL_OAUTH_CLIENT_SECRET');
const GMAIL_REFRESH_TOKEN = defineSecret('GMAIL_REFRESH_TOKEN');

// 1時間ごとに全アクティブシートを自動同期
exports.scheduledSheetSync = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [GOOGLE_SERVICE_ACCOUNT_KEY],
    region: 'asia-northeast1',
    timeoutSeconds: 300,
  },
  async () => {
    logger.info('scheduledSheetSync: start');
    const results = await syncAllSheets(db, GOOGLE_SERVICE_ACCOUNT_KEY.value());
    logger.info('scheduledSheetSync: done', { results });
  }
);

// 手動実行用エンドポイント（動作確認・即時反映したい時に使用）
// 呼び出し例: https://<region>-<project>.cloudfunctions.net/manualSheetSync?secret=XXXX
exports.manualSheetSync = onRequest(
  {
    secrets: [GOOGLE_SERVICE_ACCOUNT_KEY, SYNC_SECRET],
    region: 'asia-northeast1',
    timeoutSeconds: 300,
  },
  async (req, res) => {
    const provided = req.query.secret;
    if (!provided || provided !== SYNC_SECRET.value()) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      const results = await syncAllSheets(db, GOOGLE_SERVICE_ACCOUNT_KEY.value());
      res.status(200).json({ ok: true, results });
    } catch (err) {
      logger.error('manualSheetSync failed', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// LINE Messaging API Webhook
// 登録済みの lineConfigs（グループ/ルームID）からのメッセージのみ解析し、reservationsへ反映する
//
// minInstances: 1 は必須。しばらく呼び出しが無いとインスタンスが0までスケールダウンし、
// 次にLINEからメッセージが届いた瞬間にコールドスタートが発生する。LINEのWebhook配信は
// タイムアウトが短いため、起動が間に合わず「メッセージは届いたのに処理されない」事故に
// つながる（2026-08-17に実際に発生：3日間呼び出しが無く、直後の配信がタイムアウトした）。
exports.lineWebhook = onRequest(
  {
    secrets: [LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN],
    region: 'asia-northeast1',
    minInstances: 1,
  },
  async (req, res) => {
    const signature = req.get('x-line-signature');
    const rawBody = req.rawBody;

    if (!verifySignature(rawBody, signature, LINE_CHANNEL_SECRET.value())) {
      logger.warn('lineWebhook: invalid signature');
      res.status(403).send('invalid signature');
      return;
    }

    try {
      const events = (req.body && req.body.events) || [];
      logger.info(
        'lineWebhook: received',
        events.map((e) => ({
          type: e.type,
          messageType: e.message && e.message.type,
          sourceType: e.source && e.source.type,
          groupId: e.source && e.source.groupId,
          roomId: e.source && e.source.roomId,
          userId: e.source && e.source.userId,
        }))
      );
      const results = await processLineEvents(db, events);
      logger.info('lineWebhook: processed', { results });
      res.status(200).json({ ok: true, results });
    } catch (err) {
      logger.error('lineWebhook failed', err);
      // LINE側の再送を避けるため200を返す（エラーはログで確認）
      res.status(200).json({ ok: false, error: err.message });
    }
  }
);

/**
 * メールでの予約通知取込み（Airbnb予約確定メールをearnest.yoyaku@gmail.comへ転送してもらう運用）
 * emailConfigs/airbnb ドキュメントの listingAliases（Airbnb掲載名 → 物件マスタの物件名）を参照する。
 */
async function runEmailSync(db) {
  const configDoc = await db.collection('emailConfigs').doc('airbnb').get();
  const listingAliases = configDoc.exists ? configDoc.data().listingAliases || {} : {};
  return syncAirbnbEmails(
    db,
    {
      clientId: GMAIL_OAUTH_CLIENT_ID.value(),
      clientSecret: GMAIL_OAUTH_CLIENT_SECRET.value(),
      refreshToken: GMAIL_REFRESH_TOKEN.value(),
    },
    listingAliases
  );
}

// 30分ごとにAirbnb予約メールを自動取込み
exports.scheduledEmailSync = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_REFRESH_TOKEN],
    region: 'asia-northeast1',
    timeoutSeconds: 120,
  },
  async () => {
    logger.info('scheduledEmailSync: start');
    const results = await runEmailSync(db);
    logger.info('scheduledEmailSync: done', { results });
  }
);

// 手動実行用エンドポイント（動作確認・即時反映したい時に使用）
exports.manualEmailSync = onRequest(
  {
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SYNC_SECRET],
    region: 'asia-northeast1',
    timeoutSeconds: 120,
  },
  async (req, res) => {
    const provided = req.query.secret;
    if (!provided || provided !== SYNC_SECRET.value()) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      const results = await runEmailSync(db);
      res.status(200).json({ ok: true, results });
    } catch (err) {
      logger.error('manualEmailSync failed', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

/**
 * iCal（.ics）フィード同期。icalFeedsコレクション（{propertyName, url, active}）に
 * 登録された各URLを取得・解析し、reservationsへ反映する。
 * Airbnb/Booking.com等、ほとんどの予約サイトが提供する「カレンダー同期用URL」を想定。
 */
// 60分ごとに全アクティブなiCalフィードを自動同期
exports.scheduledIcalSync = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    timeoutSeconds: 300,
  },
  async () => {
    logger.info('scheduledIcalSync: start');
    const results = await syncIcalFeeds(db);
    logger.info('scheduledIcalSync: done', { results });
  }
);

// 手動実行用エンドポイント（動作確認・即時反映したい時に使用）
exports.manualIcalSync = onRequest(
  {
    secrets: [SYNC_SECRET],
    region: 'asia-northeast1',
    timeoutSeconds: 300,
  },
  async (req, res) => {
    const provided = req.query.secret;
    if (!provided || provided !== SYNC_SECRET.value()) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      const results = await syncIcalFeeds(db);
      res.status(200).json({ ok: true, results });
    } catch (err) {
      logger.error('manualIcalSync failed', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);
