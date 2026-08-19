/**
 * LINEメッセージ（レイバーランド形式）を解析し、清掃予定の配列に変換する。
 *
 * 対応フォーマット:
 *
 * 1) 実際に使われている形式（1行に日付・イン有無・人数がまとまって入る。月は省略されることが多い）:
 *    物件名[余分な文言（例: "9月のスケジュールです。"）が続く場合あり]
 *    D日(曜)?インなし|あり イン(N)名|未定   ← 1行にまとまっている
 *    D日(曜)?インなし|あり イン(N)名|未定
 *    ...
 *    物件名2
 *    D日...
 *    （自由文が続く場合あり。直前のエントリのnotesとして扱う）
 *
 *    例:
 *      二条城友9月のスケジュールです。
 *      9日水インなしイン11名
 *      21日月インありイン9名
 *      ご対応をお願い致しますm(_ _)m
 *
 *    月が明記されていない場合（例: "4日インなしイン4 名"）は、
 *    その月の該当日がすでに過ぎていれば翌月として扱う（未来日優先）。
 *    物件名の行に「N月」という記載があれば、以降の日付はその月を優先する。
 *
 * 2) 従来想定していた、1項目ずつ改行で区切られた形式（互換性のため残す）:
 *    物件名
 *    M/D(曜)
 *    インなし|インあり
 *    イン(N)名|イン未定
 *    M/D(曜)
 *    ...（繰り返し）
 */

const DATE_LINE = /^(\d{1,2})\/(\d{1,2})(?:[月火水木金土日])?$/;
const CHECKIN_LINE = /^イン(なし|あり)$/;
const PERSONS_LINE = /^イン(\d+)名$/;
const UNDECIDED_LINE = /^イン未定$/;

// 実際の運用で使われている「1行完結」形式: "9日水インなしイン11名" / "25日金インなしイン未定"
const COMBINED_DATE_LINE = /^(\d{1,2})日(?:[月火水木金土日])?イン(なし|あり)イン(?:(\d+)\s*名|未定)$/;

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
 * 月が省略された日付（"9日"等）を解決する。
 * - explicitMonth が分かっていれば、その月として扱う（年は今日に一番近い年を採用）
 * - 分からなければ、「今月の該当日」が今日より前ならまだ来ていない来月として扱う
 *   （予約連絡は基本的に未来日のはずなので、過去日にはしない）
 */
function resolveDayOnlyDate(day, explicitMonth, now) {
  const base = now || new Date();
  if (explicitMonth) {
    return normalizeMonthDay(explicitMonth, day, base);
  }
  const todayOnly = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const thisMonthCandidate = new Date(base.getFullYear(), base.getMonth(), day);
  const target = thisMonthCandidate < todayOnly
    ? new Date(base.getFullYear(), base.getMonth() + 1, day)
    : thisMonthCandidate;
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

/**
 * 物件名の行を判定する。propertyAliases のキーで「前方一致」させ、
 * 残りの文言に「N月」があれば明示月として拾う。
 * （例: "二条城友9月のスケジュールです。" → propertyName: "二条城 友", explicitMonth: 9）
 */
function matchPropertyLine(line, propertyAliases) {
  const normalizedLine = line.replace(/\s+/g, '');
  const aliasKeys = Object.keys(propertyAliases || {}).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    const normalizedAlias = alias.replace(/\s+/g, '');
    if (normalizedAlias && normalizedLine.startsWith(normalizedAlias)) {
      const rest = normalizedLine.slice(normalizedAlias.length);
      const monthMatch = rest.match(/(\d{1,2})月/);
      return {
        propertyName: propertyAliases[alias],
        explicitMonth: monthMatch ? parseInt(monthMatch[1], 10) : null,
      };
    }
  }
  return null;
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
  let explicitMonth = null;
  let pendingDate = null;
  let pendingHasCheckIn = null;

  for (const line of lines) {
    // 実運用形式: 日付・イン有無・人数が1行にまとまっているケース
    const combinedMatch = line.match(COMBINED_DATE_LINE);
    if (combinedMatch) {
      if (currentProperty) {
        const day = parseInt(combinedMatch[1], 10);
        const cleaningDate = resolveDayOnlyDate(day, explicitMonth, now);
        const personsRaw = combinedMatch[3];
        results.push({
          propertyName: currentProperty,
          cleaningDate,
          hasCheckIn: combinedMatch[2] === 'あり',
          persons: personsRaw ? parseInt(personsRaw, 10) : null,
          notes: '',
        });
      }
      continue;
    }

    // 従来想定形式: M/D(曜) のみの行
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

    // 物件名 or 自由文の可能性がある行（"二条城友9月のスケジュールです。" のように
    // 物件名の後に文言が続くケースがあるため、前方一致で判定する）
    const propertyMatch = matchPropertyLine(line, propertyAliases);
    if (propertyMatch) {
      currentProperty = propertyMatch.propertyName;
      explicitMonth = propertyMatch.explicitMonth || explicitMonth;
      continue;
    }

    // 上記のいずれにも当てはまらない行 = 自由文（例: "ご対応をお願い致します"）
    // 直前に確定したエントリのnotesに追記する
    if (results.length > 0) {
      const last = results[results.length - 1];
      last.notes = last.notes ? `${last.notes} / ${line}` : line;
    }
  }

  return results;
}

module.exports = { parseLineMessage, normalizeMonthDay, resolveDayOnlyDate };
