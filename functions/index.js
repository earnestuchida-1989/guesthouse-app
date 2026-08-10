const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const { syncAllSheets } = require('./sheetSync');

initializeApp();
const db = getFirestore();

const GOOGLE_SERVICE_ACCOUNT_KEY = defineSecret('GOOGLE_SERVICE_ACCOUNT_KEY');
const SYNC_SECRET = defineSecret('SYNC_SECRET');

// 1時間ごとに全アクティブシートを自動同期
exports.scheduledSheetSync = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [GOOGLE_SERVICE_ACCOUNT_KEY],
    region: 'asia-northeast1',
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
