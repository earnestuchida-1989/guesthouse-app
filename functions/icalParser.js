/**
 * iCalendar（.ics）フィードを解析する、最小限のパーサー。
 * Airbnb/Booking.com等が提供する「カレンダー同期用URL」はこの形式で予約情報を配信している。
 *
 * フルのRFC5545対応はせず、このアプリで使う最小限（VEVENT内のUID/DTSTART/DTEND/SUMMARY）
 * だけを抜き出す。行の折り返し（次行が半角スペース/タブで始まる継続行）には対応する。
 */

/**
 * ics本文の行折り返しを解除し、論理行の配列にする
 */
function unfoldLines(icsText) {
  const rawLines = icsText.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * DTSTART;VALUE=DATE:20260918 や DTSTART:20260918T150000Z のような行から
 * 日付部分（YYYY-MM-DD）を取り出す。時刻情報は今のところ使わない（清掃日の判定には日付のみで十分なため）。
 */
function extractDateValue(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const value = line.slice(colonIdx + 1).trim();
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * ics本文を解析し、VEVENTごとに { uid, startDate, endDate, summary } の配列を返す。
 * startDate/endDateは "YYYY-MM-DD"（DTENDはチェックアウト日＝多くの場合そのまま清掃日として使える）。
 */
function parseIcs(icsText) {
  if (!icsText) return [];
  const lines = unfoldLines(icsText);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = { uid: null, startDate: null, endDate: null, summary: '' };
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current && current.startDate && current.endDate) {
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    if (line.startsWith('UID')) {
      current.uid = line.slice(line.indexOf(':') + 1).trim();
    } else if (line.startsWith('DTSTART')) {
      current.startDate = extractDateValue(line);
    } else if (line.startsWith('DTEND')) {
      current.endDate = extractDateValue(line);
    } else if (line.startsWith('SUMMARY')) {
      current.summary = line.slice(line.indexOf(':') + 1).trim();
    }
  }

  return events;
}

module.exports = { parseIcs };
