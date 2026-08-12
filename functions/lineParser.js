/**
 * LINEメッセージ（レイバーランド形式）を解析し、清掃予定の配列に変換する。
 *
 * 対応フォーマット:
 * 1) グループ形式:
 *    物件名
 *    M/D(曜)
 *    インなし|インあり
 *    イン(N)名|イン未定
 *    M/D(曜)
 *    ...（繰り返し）
 *
 * 2) 単発追加連絡形式:
 *    M/D(曜)
 *    物件名
 *    インなし|インあり
 *    イン(N)名|イン未定
 *    （自由文が続く場合あり。直前のエントリのnotesとして扱う）
 */

const DATE_LINE = /^(\d{1,2})\/(\d{1,2})(?:[月火水木金土日])?$/;
const CHECKIN_LINE = /^イン(なし|あり)$/;
const PERSONS_LINE = /^イン(\d+)名$/;
const UNDECIDED_LINE = /^イン未定$/;

/**
 * 年なし月日("8/5")に、今日から見て最も近い年を推測して付与する
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

function normalizeMonthDay(month, day, now) {
  const year = inferYearForMonthDay(month, day, now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * LINEメッセージ本文を解析する。
 * propertyAliases: { "二条城友": "二条城 友", "東寺": "レイバー東寺", ... }
 * 戻り値: [{ propertyName, cleaningDate, hasCheckIn, persons, notes }]
 */
function parseLineMessage(text, propertyAliases, now) {
  if (!text) return [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results = [];
  let currentProperty = null;
  let pendingDate = null;
  let pendingHasCheckIn = null;

  const resolveProperty = (raw) => {
    const key = raw.replace(/\s+/g, '');
    if (propertyAliases[key]) return propertyAliases[key];
    // エイリアス未登録でも、正規の物件名がそのまま書かれているケースはそのまま採用
    return null;
  };

  for (const line of lines) {
    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      pendingDate = normalizeMonthDay(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10), now);
      pendingHasCheckIn = null;
      continue;
    }

    const checkInMatch = line.match(CHECKIN_LINE);
    if (checkInMatch) {
      pendingHasCheckIn = checkInMatch[1] === 'あり';
      continue;
    }

    const undecidedMatch = line.match(UNDECIDED_LINE);
    if (undecidedMatch) {
      if (pendingDate && currentProperty) {
        results.push({
          propertyName: currentProperty,
          cleaningDate: pendingDate,
          hasCheckIn: !!pendingHasCheckIn,
          persons: null,
          notes: '',
        });
      }
      pendingDate = null;
      pendingHasCheckIn = null;
      continue;
    }

    const personsMatch = line.match(PERSONS_LINE);
    if (personsMatch) {
      if (pendingDate && currentProperty) {
        results.push({
          propertyName: currentProperty,
          cleaningDate: pendingDate,
          hasCheckIn: !!pendingHasCheckIn,
          persons: parseInt(personsMatch[1], 10),
          notes: '',
        });
      }
      pendingDate = null;
      pendingHasCheckIn = null;
      continue;
    }

    // 物件名 or 自由文の可能性がある行
    const resolvedProperty = resolveProperty(line);
    if (resolvedProperty) {
      currentProperty = resolvedProperty;
      continue;
    }

    // 上記のいずれにも当てはまらない行 = 自由文（例: "追加の対応をお願いします"）
    // 直前に確定したエントリのnotesに追記する
    if (results.length > 0) {
      const last = results[results.length - 1];
      last.notes = last.notes ? `${last.notes} / ${line}` : line;
    }
  }

  return results;
}

module.exports = { parseLineMessage, normalizeMonthDay };
