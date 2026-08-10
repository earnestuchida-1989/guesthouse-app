const { getSheetsClient, columnLetterToIndex, fetchSheetRows } = require('./sheetsClient');

/**
 * "2026/07/04" や "2026-07-04" を "YYYY-MM-DD" に正規化。パースできなければ null。
 */
function normalizeDate(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function sanitizeForId(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * 同期対象とする過去日数（これより古い清掃日は取り込まない）。
 * sheetConfig.syncPastDays で上書き可能。
 */
const DEFAULT_SYNC_PAST_DAYS = 7;

function getCutoffDate(syncPastDays) {
  const days = typeof syncPastDays === 'number' ? syncPastDays : DEFAULT_SYNC_PAST_DAYS;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * 1つのシート設定を処理し、Firestoreのreservationsコレクションへupsertする候補データを作る
 */
async function buildReservationsForConfig(sheets, config) {
  const rows = await fetchSheetRows(sheets, config.sheetId, config.tabName);
  const headerRow = config.headerRow || 1;
  const cutoffDate = getCutoffDate(config.syncPastDays);

  const checkInIdx = columnLetterToIndex(config.columns.checkIn);
  const checkOutIdx = columnLetterToIndex(config.columns.checkOut);
  const personsIdx = columnLetterToIndex(config.columns.persons);
  const notesIdx = config.columns.notes ? columnLetterToIndex(config.columns.notes) : -1;
  const propertyIdx =
    config.mode === 'multi' && config.propertyColumn ? columnLetterToIndex(config.propertyColumn) : -1;

  const stays = [];

  for (const row of rows) {
    if (row.rowIndex <= headerRow) continue;

    const checkInRaw = row.values[checkInIdx];
    const checkOutRaw = row.values[checkOutIdx];
    if (!checkInRaw && !checkOutRaw) continue; // 完全な空行はスキップ

    const notes = notesIdx >= 0 ? (row.values[notesIdx] || '').trim() : '';
    if (notes.startsWith('例') || notes.startsWith('例：')) continue; // シート内の入力例行をスキップ

    const checkIn = normalizeDate(checkInRaw);
    const checkOut = normalizeDate(checkOutRaw);
    if (!checkOut) continue; // 清掃日の元になるチェックアウト日がなければスキップ

    const personsRaw = personsIdx >= 0 ? row.values[personsIdx] : '';
    const persons = parseInt(personsRaw, 10) || null;

    const propertyName =
      config.mode === 'multi'
        ? (row.values[propertyIdx] || '').trim() || config.clientName || '不明'
        : config.propertyName;

    // キャンセル判定: 取り消し線 or 赤字 or セル内に「キャンセル」の文字列
    const rowHasStrike = row.strikethrough.some((v) => v);
    const rowHasCancelText = row.values.some((v) => (v || '').includes('キャンセル'));
    const cancelled = rowHasStrike || rowHasCancelText;

    stays.push({
      rowIndex: row.rowIndex,
      propertyName,
      checkIn,
      checkOut,
      persons,
      notes,
      cancelled,
    });
  }

  // 物件ごとにグルーピングし、「あるステイのチェックアウト日 == 別ステイのチェックイン日」なら hasCheckIn = true
  // ※ hasCheckIn の判定は日付フィルタ前の全データを対象にする（境界付近の見落とし防止）
  const checkInDatesByProperty = {};
  for (const stay of stays) {
    if (!stay.checkIn) continue;
    if (!checkInDatesByProperty[stay.propertyName]) {
      checkInDatesByProperty[stay.propertyName] = new Set();
    }
    checkInDatesByProperty[stay.propertyName].add(stay.checkIn);
  }

  const reservations = stays
    .filter((stay) => stay.checkOut >= cutoffDate) // 古すぎる予約は取り込まない
    .map((stay) => {
      const hasCheckIn =
        !!checkInDatesByProperty[stay.propertyName] &&
        checkInDatesByProperty[stay.propertyName].has(stay.checkOut);

      return {
        docId: `sheet_${sanitizeForId(config.sheetId)}_${sanitizeForId(config.tabName)}_row${stay.rowIndex}`,
        data: {
          propertyName: stay.propertyName,
          cleaningDate: stay.checkOut,
          checkInDate: stay.checkIn || null,
          persons: stay.persons,
          notes: stay.notes,
          status: stay.cancelled ? 'cancelled' : 'confirmed',
          hasCheckIn,
          checkInTime: '',
          source: 'sheet',
          sheetId: config.sheetId,
          sheetConfigId: config.id,
          sourceRow: stay.rowIndex,
        },
      };
    });

  return reservations;
}

/**
 * 全アクティブ設定を同期。db: Firestore admin instance, serviceAccountKeyJson: サービスアカウントJSON文字列
 */
async function syncAllSheets(db, serviceAccountKeyJson) {
  const sheets = getSheetsClient(serviceAccountKeyJson);
  const configsSnap = await db.collection('sheetConfigs').where('active', '==', true).get();

  const results = [];

  for (const doc of configsSnap.docs) {
    const config = { id: doc.id, ...doc.data() };
    try {
      const reservations = await buildReservationsForConfig(sheets, config);
      const batch = db.batch();
      reservations.forEach((r) => {
        const ref = db.collection('reservations').doc(r.docId);
        batch.set(
          ref,
          {
            ...r.data,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      results.push({ sheetConfigId: config.id, clientName: config.clientName, count: reservations.length, ok: true });
    } catch (err) {
      results.push({ sheetConfigId: config.id, clientName: config.clientName, ok: false, error: err.message });
    }
  }

  return results;
}

module.exports = { syncAllSheets, buildReservationsForConfig, normalizeDate };
