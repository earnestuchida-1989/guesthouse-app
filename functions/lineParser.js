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
 *
 * 3) 「日付先頭・1行1件」形式（清掃日一覧をまとめて送るタイプ。イン有無・人数は無し）:
 *    MM.DD　物件名
 *    MM.DD　物件名②
 *    MM.DD　物件名　備考（例: ゴミ回収注意）
 *    ...（日付順に繰り返し、空行で月が区切られることもある）
 *
 *    例:
 *      08.18　五条
 *      08.20　博多町
 *      08.28　六条　ゴミ回収注意
 *
 *    年は明記されないため、今日から見て過去にならないよう年を解決する
 *    （resolveMonthDayFuture）。
 */

const DATE_LINE = /^(\d{1,2})\/(\d{1,2})(?:[月火水木金土日])?$/;
const CHECKIN_LINE = /^イン(なし|あり)$/;
const PERSONS_LINE = /^イン(\d+)名$/;
const UNDECIDED_LINE = /^イン未定$/;

// 実際の運用で使われている「1行完結」形式: "9日水インなしイン11名" / "25日金インなしイン未定"
const COMBINED_DATE_LINE = /^(\d{1,2})日(?:[月火水木金土日])?イン(なし|あり)イン(?:(\d+)\s*名|未定)$/;

// 「日付先頭・1行1件」形式: "08.18　五条" / "08.28　六条　ゴミ回収注意"
const DAY_FIRST_LINE = /^(\d{1,2})\.(\d{1,2})[\s　]+(.+)$/;

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
 * 月日（年なし）の年を解決する。「MM.DD」形式のように月が明記されている場合に使う
 * （日のみ省略のresolveDayOnlyDateとは別）。
 *
 * 月間の清掃予定表のように、今日から数日前の日付（既に実施済み分）も
 * 一覧に含まれることがあるため、「今日より前だからといって即座に来年扱い」にはしない。
 * 60日以上前になる場合のみ「年をまたいで来年の日付」と判断する
 * （例：12月の予定表を年明け1月に受け取っても、翌年として解決できるように）。
 */
function resolveMonthDayFuture(month, day, now) {
  const base = now || new Date();
  const todayOnly = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const thisYearCandidate = new Date(base.getFullYear(), month - 1, day);
  const diffDays = (todayOnly - thisYearCandidate) / (1000 * 60 * 60 * 24);
  const year = diffDays > 60 ? base.getFullYear() + 1 : base.getFullYear();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 文字列の先頭がpropertyAliasesのいずれかのキーと一致するか調べ、
 * 一致すれば { propertyName, rest }（restは残りの文言、前後の空白除去済み）を返す。
 * 一致しなければnull。
 */
function matchPropertyPrefix(str, propertyAliases) {
  const aliasKeys = Object.keys(propertyAliases || {}).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    if (alias && str.startsWith(alias)) {
      return {
        propertyName: propertyAliases[alias],
        rest: str.slice(alias.length).replace(/^[\s　]+/, '').trim(),
      };
    }
  }
  return null;
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

    // 「日付先頭・1行1件」形式: "08.18　五条" / "08.28　六条　ゴミ回収注意"
    const dayFirstMatch = line.match(DAY_FIRST_LINE);
    if (dayFirstMatch) {
      const month = parseInt(dayFirstMatch[1], 10);
      const day = parseInt(dayFirstMatch[2], 10);
      const propMatch = matchPropertyPrefix(dayFirstMatch[3].trim(), propertyAliases);
      if (propMatch) {
        results.push({
          propertyName: propMatch.propertyName,
          cleaningDate: resolveMonthDayFuture(month, day, now),
          hasCheckIn: false,
          persons: null,
          notes: propMatch.rest || '',
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

module.exports = { parseLineMessage, normalizeMonthDay, resolveDayOnlyDate, resolveMonthDayFuture };
