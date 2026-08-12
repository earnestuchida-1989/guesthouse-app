const { getSheetsClient, columnLetterToIndex, fetchSheetRows } = require('./sheetsClient');

/**
 * 年なし日付("04/12"等)に、今日から見て最も近い年を推測して付与する。
 * 年またぎ（12月→1月など）でも自然に処理できる。
 */
function inferYearForMonthDay(month, day, now) {
  const base = now || new Date();
  const candidates = [-1, 0, 1].map((offset) => new Date(base.getFullYear() + offset, month - 1, day));
  let best = candidates[1];
  let bestDiff = Math.abs(candidates[1] - base);
  for (const c of candidates) {
    const diff = Math.abs(c - base);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best.getFullYear();
}

/**
 * "2026/07/04"（フル日付）や "04/12"（年なし。今日に最も近い年を自動推測）を
 * "YYYY-MM-DD" に正規化。パースできなければ null。
 */
function normalizeDate(raw, now) {
  if (!raw) return null;
  const trimmed = String(raw).trim();

  // フル日付: YYYY/MM/DD, YYYY-MM-DD
  let match = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 年なし: MM/DD
  match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const [, m, d] = match;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = inferYearForMonthDay(month, day, now);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * "16" や "16:30" のような入力を "HH:MM" 形式に正規化。
 */
function normalizeTime(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  let match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  match = trimmed.match(/^(\d{1,2})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:00`;
  }
  return trimmed;
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
  // notesは単一列("D")でも複数列(["D","E"])でも指定可能。複数の場合は結合する。
  const notesLetters = config.columns.notes
    ? Array.isArray(config.columns.notes)
      ? config.columns.notes
      : [config.columns.notes]
    : [];
  const notesIdxs = notesLetters.map((l) => columnLetterToIndex(l));
  const propertyIdx =
    config.mode === 'multi' && config.propertyColumn ? columnLetterToIndex(config.propertyColumn) : -1;
  // チェックイン時刻の専用列（あれば）
  const checkInTimeIdx = config.columns.checkInTime ? columnLetterToIndex(config.columns.checkInTime) : -1;
  // 清掃予定日の専用列（あれば。空欄ならチェックアウト日を使用）
  const cleaningDateIdx = config.columns.cleaningDate ? columnLetterToIndex(config.columns.cleaningDate) : -1;

  const stays = [];
  // 同一タブ内に複数物件が縦積みされている場合、行範囲を絞り込む
  const rowStart = config.rowRange && config.rowRange.start ? config.rowRange.start : null;
  const rowEnd = config.rowRange && config.rowRange.end ? config.rowRange.end : null;

  for (const row of rows) {
    if (row.rowIndex <= headerRow) continue;
    if (rowStart && row.rowIndex < rowStart) continue;
    if (rowEnd && row.rowIndex > rowEnd) continue;

    const checkInRaw = row.values[checkInIdx];
    const checkOutRaw = row.values[checkOutIdx];
    if (!checkInRaw && !checkOutRaw) continue; // 完全な空行はスキップ

    const notes = notesIdxs
      .map((idx) => (row.values[idx] || '').trim())
      .filter(Boolean)
      .join(' / ');
    if (notes.startsWith('例') || notes.startsWith('例：')) continue; // シート内の入力例行をスキップ

    const checkIn = normalizeDate(checkInRaw);
    const checkOut = normalizeDate(checkOutRaw);
    if (!checkOut) continue; // 清掃日の元になるチェックアウト日がなければスキップ

    // 清掃予定日の専用列があり値が入っていればそちらを優先、なければチェックアウト日を使用
    const cleaningDateRaw = cleaningDateIdx >= 0 ? row.values[cleaningDateIdx] : '';
    const cleaningDate = normalizeDate(cleaningDateRaw) || checkOut;

    const checkInTime = checkInTimeIdx >= 0 ? normalizeTime(row.values[checkInTimeIdx]) : '';

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
      cleaningDate,
      checkInTime,
      persons,
      notes,
      cancelled,
    });
  }

  // 物件ごとにグルーピングし、「あるステイの清掃日 == 別ステイのチェックイン日」なら hasCheckIn = true
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
    .filter((stay) => stay.cleaningDate >= cutoffDate) // 古すぎる予約は取り込まない
    .map((stay) => {
      const hasCheckIn =
        !!checkInDatesByProperty[stay.propertyName] &&
        checkInDatesByProperty[stay.propertyName].has(stay.cleaningDate);

      return {
        docId: `sheet_${sanitizeForId(config.sheetId)}_${sanitizeForId(config.tabName)}_row${stay.rowIndex}`,
        data: {
          propertyName: stay.propertyName,
          cleaningDate: stay.cleaningDate,
          checkInDate: stay.checkIn || null,
          persons: stay.persons,
          notes: stay.notes,
          status: stay.cancelled ? 'cancelled' : 'confirmed',
          hasCheckIn,
          checkInTime: stay.checkInTime || '',
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

module.exports = { syncAllSheets, buildReservationsForConfig, normalizeDate, normalizeTime };
