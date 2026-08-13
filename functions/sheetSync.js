const { getSheetsClient, columnLetterToIndex, fetchSheetRows } = require('./sheetsClient');
const { getDriveClient, fetchExcelRows } = require('./excelClient');
const { getCalendarClient, fetchCalendarEvents } = require('./calendarClient');

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

  // 日本語表記: "2026年7月20日"（年あり）
  match = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 日本語表記: "7月20日"（年なし。今日に最も近い年を自動推測）
  match = trimmed.match(/^(\d{1,2})月(\d{1,2})日/);
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
 * 部屋×日付のグリッド形式（PMS/チャンネルマネージャー等の自動出力）を解析する。
 * - 1行目: 月ラベル（例: "2026年7月"）が列をまたいで断続的に出現
 * - 2行目: 日にち（1,2,3...）
 * - 3行目: 曜日（未使用）
 * - dataRowStart〜dataRowEnd: 部屋ごとの行。セルに数字があれば「その日が清掃（チェックアウト）日、値=人数」
 * このグリッドにはチェックイン日の情報がないため checkInDate は null、hasCheckIn は常に false。
 */
function buildGridReservationsForConfig(rows, config) {
  const g = config.grid || {};
  const monthRowIdx = (g.monthRow || 1) - 1;
  const dayRowIdx = (g.dayRow || 2) - 1;
  const dataStart = g.dataRowStart || 4;
  const dataEnd = g.dataRowEnd || dataStart;
  const cutoffDate = getCutoffDate(config.syncPastDays);

  const monthRowValues = (rows[monthRowIdx] && rows[monthRowIdx].values) || [];
  const dayRowValues = (rows[dayRowIdx] && rows[dayRowIdx].values) || [];

  // 列インデックス -> "YYYY-MM-DD" のマップを作成
  const dateByCol = {};
  let curYear = null;
  let curMonth = null;
  for (let col = 0; col < monthRowValues.length; col++) {
    const label = (monthRowValues[col] || '').trim();
    const m = label.match(/^(\d{4})年(\d{1,2})月/);
    if (m) {
      curYear = parseInt(m[1], 10);
      curMonth = parseInt(m[2], 10);
    }
    if (curYear && curMonth) {
      const dayNum = parseInt((dayRowValues[col] || '').trim(), 10);
      if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
        dateByCol[col] = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  const roomMap = config.mode === 'multi' ? config.roomPropertyMap || {} : null;

  // ステップ1: 連続する記入セルを1つの宿泊としてまとめる
  // （開始日=チェックイン、最終日=チェックアウト/清掃日。値は最終日のものを人数として採用）
  const stays = [];
  for (const row of rows) {
    if (row.rowIndex < dataStart || row.rowIndex > dataEnd) continue;
    const label = (row.values[0] || '').trim();
    if (!label || label === '稼働率') continue; // 集計行等はスキップ

    let propertyName;
    if (config.mode === 'multi') {
      propertyName = roomMap[label];
      if (!propertyName) continue; // 未マッピングの部屋行は取り込まない
    } else {
      propertyName = config.propertyName;
    }

    let col = 1;
    while (col < row.values.length) {
      const raw = (row.values[col] || '').trim();
      if (!raw) {
        col++;
        continue;
      }
      const runStart = col;
      let runEnd = col;
      let lastRaw = raw;
      while (runEnd + 1 < row.values.length && (row.values[runEnd + 1] || '').trim()) {
        runEnd++;
        lastRaw = (row.values[runEnd] || '').trim();
      }

      const persons = parseInt(lastRaw, 10);
      const cleaningDate = dateByCol[runEnd];
      // 1日だけのマークは「チェックアウト/清掃日」のみが分かり、実際のチェックイン日は不明。
      // runStart===runEndの場合にチェックイン日=清掃日としてしまうと、常に自分自身と一致して
      // hasCheckInが誤ってtrueになるため、複数日にまたがる記入がある場合のみ設定する。
      const checkInDate = runStart !== runEnd ? dateByCol[runStart] : null;

      if (!isNaN(persons) && cleaningDate) {
        stays.push({
          rowIndex: row.rowIndex,
          runStart,
          runEnd,
          propertyName,
          cleaningDate,
          checkInDate,
          persons,
        });
      }

      col = runEnd + 1;
    }
  }

  // ステップ2: 物件ごとに「あるステイの清掃日 == 別ステイのチェックイン日」ならhasCheckIn=true
  const checkInDatesByProperty = {};
  for (const stay of stays) {
    if (!stay.checkInDate) continue;
    if (!checkInDatesByProperty[stay.propertyName]) {
      checkInDatesByProperty[stay.propertyName] = new Set();
    }
    checkInDatesByProperty[stay.propertyName].add(stay.checkInDate);
  }

  const reservations = stays
    .filter((stay) => stay.cleaningDate >= cutoffDate)
    .map((stay) => {
      const hasCheckIn =
        !!checkInDatesByProperty[stay.propertyName] &&
        checkInDatesByProperty[stay.propertyName].has(stay.cleaningDate);

      return {
        docId: `sheet_${sanitizeForId(config.sheetId)}_${sanitizeForId(config.tabName)}_r${stay.rowIndex}c${stay.runStart}-${stay.runEnd}`,
        data: {
          propertyName: stay.propertyName,
          cleaningDate: stay.cleaningDate,
          checkInDate: stay.checkInDate || null,
          persons: stay.persons,
          notes: '',
          status: 'confirmed',
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
 * Googleカレンダーのイベントを解析する。
 * タイトル形式: "【物件名】ゲスト名 N名[+乳児M名] ※詳細情報" を想定。
 * イベントの開始日=チェックイン、終了日（終日イベントは排他的なので、そのままチェックアウト/清掃日として使える）。
 * このカレンダーには全物件が混在しているため常に mode: 'multi' 相当（物件名はタイトルから抽出）。
 */
async function buildCalendarReservationsForConfig(calendar, config) {
  const cutoffDate = getCutoffDate(config.syncPastDays);
  const futureDays = config.calendarFutureDays || 400;
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - (config.syncPastDays || DEFAULT_SYNC_PAST_DAYS) - 1);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + futureDays);

  const events = await fetchCalendarEvents(
    calendar,
    config.calendarId,
    timeMin.toISOString(),
    timeMax.toISOString()
  );

  const titlePattern = /^【(.+?)】\s*(.*)$/;
  // ゲスト名の直後にある "N名"（＋乳児M名）だけを人数として拾う。備考中の「1名追加」等の誤検出を避けるため先頭のみに限定。
  const headCountPattern = /^(\S+)\s*(\d+)名(?:\+乳児(\d+)名)?/;

  const stays = [];
  for (const event of events) {
    const title = (event.summary || '').trim();
    if (!title) continue;

    const m = title.match(titlePattern);
    if (!m) continue; // 物件名の記法に合わないイベントはスキップ（社内メモ等）

    const propertyName = m[1].trim();
    const rest = m[2] || '';

    const headMatch = rest.match(headCountPattern);
    const persons = headMatch
      ? parseInt(headMatch[2], 10) + (headMatch[3] ? parseInt(headMatch[3], 10) : 0)
      : null;

    const checkIn = event.start && (event.start.date || (event.start.dateTime || '').slice(0, 10));
    // 終日イベントの終了日はAPI上「排他的」＝最終日の翌日として返る。これがそのままチェックアウト/清掃日に一致する。
    const cleaningDate = event.end && (event.end.date || (event.end.dateTime || '').slice(0, 10));
    if (!cleaningDate) continue;

    const notes = [rest.replace(headCountPattern, '').trim(), event.description || '']
      .filter(Boolean)
      .join(' / ');

    const cancelled =
      event.status === 'cancelled' ||
      title.includes('キャンセル') ||
      (event.description || '').includes('キャンセル');
    const noCleaningNeeded = !cancelled && (title.includes('清掃不要') || (event.description || '').includes('清掃不要'));

    stays.push({
      eventId: event.id,
      propertyName,
      checkIn,
      cleaningDate,
      persons,
      notes,
      cancelled,
      noCleaningNeeded,
    });
  }

  const checkInDatesByProperty = {};
  for (const stay of stays) {
    if (!stay.checkIn) continue;
    if (!checkInDatesByProperty[stay.propertyName]) {
      checkInDatesByProperty[stay.propertyName] = new Set();
    }
    checkInDatesByProperty[stay.propertyName].add(stay.checkIn);
  }

  return stays
    .filter((stay) => stay.cleaningDate >= cutoffDate)
    .map((stay) => {
      const hasCheckIn =
        !!checkInDatesByProperty[stay.propertyName] &&
        checkInDatesByProperty[stay.propertyName].has(stay.cleaningDate);
      return {
        docId: `cal_${sanitizeForId(config.calendarId)}_${sanitizeForId(stay.eventId)}`,
        data: {
          propertyName: stay.propertyName,
          cleaningDate: stay.cleaningDate,
          checkInDate: stay.checkIn || null,
          persons: stay.persons,
          notes: stay.notes,
          status: stay.cancelled ? 'cancelled' : stay.noCleaningNeeded ? 'no_cleaning_needed' : 'confirmed',
          hasCheckIn,
          checkInTime: '',
          source: 'calendar',
          calendarId: config.calendarId,
          sheetConfigId: config.id,
        },
      };
    });
}

/**
 * 1つのシート設定を処理し、Firestoreのreservationsコレクションへupsertする候補データを作る
 * clients: { sheets, drive, calendar } - config.sourceType により使用クライアントを切り替え
 */
async function buildReservationsForConfig(clients, config) {
  const sourceType = config.sourceType || 'sheets';

  if (sourceType === 'calendar') {
    return buildCalendarReservationsForConfig(clients.calendar, config);
  }

  if (sourceType === 'excel-grid') {
    const rows = await fetchExcelRows(clients.drive, config.sheetId, config.tabName);
    return buildGridReservationsForConfig(rows, config);
  }

  const rows =
    sourceType === 'excel'
      ? await fetchExcelRows(clients.drive, config.sheetId, config.tabName)
      : await fetchSheetRows(clients.sheets, config.sheetId, config.tabName);
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
    // シート内の入力例行をスキップ（備考欄、またはチェックイン/チェックアウト欄自体に「例」と書かれているケース）
    const checkInTrimmed = (checkInRaw || '').trim();
    const checkOutTrimmed = (checkOutRaw || '').trim();
    if (
      notes.startsWith('例') ||
      checkInTrimmed.startsWith('例') ||
      checkOutTrimmed.startsWith('例')
    ) {
      continue;
    }

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

    // 「清掃不要」判定: 宿泊はあるが清掃作業自体が不要なケース
    const noCleaningNeeded = !cancelled && row.values.some((v) => (v || '').includes('清掃不要'));

    stays.push({
      rowIndex: row.rowIndex,
      propertyName,
      noCleaningNeeded,
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
          status: stay.cancelled ? 'cancelled' : stay.noCleaningNeeded ? 'no_cleaning_needed' : 'confirmed',
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
  const drive = getDriveClient(serviceAccountKeyJson);
  const calendar = getCalendarClient(serviceAccountKeyJson);
  const clients = { sheets, drive, calendar };
  const configsSnap = await db.collection('sheetConfigs').where('active', '==', true).get();

  const results = [];

  for (const doc of configsSnap.docs) {
    const config = { id: doc.id, ...doc.data() };
    try {
      const reservations = await buildReservationsForConfig(clients, config);
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
