/**
 * Airbnbの「予約確定」通知メール（ホスト宛、automated@airbnb.com）を解析する。
 *
 * 想定フロー：物件オーナー（例：タカさん）がAirbnbから受け取った通知メールを
 * 自分の受信箱から earnest.yoyaku@gmail.com へ転送（Fwd:）してくる。
 * 転送メールは元メールの本文をそのまま含むため、本文全体に対して正規表現で
 * 必要な項目を抜き出す（改行位置はGmailの転送方式によって微妙にブレるため、
 * 「ラベル行の後、空白・改行を挟んで値が来る」という緩いパターンで探す）。
 *
 * 対応プラットフォームは今のところAirbnbのみ。他サイト（Booking.com等）の
 * 通知が混ざる場合は、件名/本文の特徴を見て別のパーサーに振り分ける必要がある
 * （未対応、実際のサンプルが届いたら追加する）。
 */

const AIRBNB_SENDER_HINT = /automated@airbnb\.com|Airbnb/;
const CONFIRMATION_HINT = /予約確定/;

const CHECKIN_BLOCK = /チェックイン\s*\n+\s*(\d{1,2})月(\d{1,2})日\([月火水木金土日]\)\s*\n+\s*(\d{1,2}:\d{2})/;
const CHECKOUT_BLOCK = /チェックアウト\s*\n+\s*(\d{1,2})月(\d{1,2})日\([月火水木金土日]\)\s*\n+\s*(\d{1,2}:\d{2})/;
const GUEST_COUNT_BLOCK = /ゲスト人数\s*\n+\s*([^\n]+)/;
const CONFIRMATION_CODE_BLOCK = /確認コード\s*\n+\s*([A-Z0-9]{6,12})/;
// 件名例: "予約確定 - 9月18日にDortheLucasさんが到着予定"
const SUBJECT_GUEST_HINT = /予約確定\s*-\s*\d{1,2}月\d{1,2}日に(.+?)さんが到着予定/;

/**
 * 年なし月日に、今日から見て一番近い未来寄りの年を付与する
 * （予約通知は基本的に近い未来の日付のため、素直に「今年 or 年をまたぐなら来年」でよい）
 */
function resolveYear(month, day, now) {
  const base = now || new Date();
  const candidate = new Date(base.getFullYear(), month - 1, day);
  const todayOnly = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  // 候補日が今日より半年以上前なら、来年の日付とみなす（未来の予約通知という前提）
  const diffDays = (todayOnly - candidate) / (1000 * 60 * 60 * 24);
  if (diffDays > 180) {
    return base.getFullYear() + 1;
  }
  return base.getFullYear();
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * "大人3人, 乳幼児1人" のような文字列から人数区分ごとの人数を抜き出し、合計を返す
 */
function parseGuestCounts(text) {
  const counts = {};
  const re = /(大人|子供|幼児|乳幼児)(\d+)人/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    counts[m[1]] = parseInt(m[2], 10);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total: total || null };
}

/**
 * 本文中から、登録済みのリスティング名（エイリアス）のいずれかが含まれるか探す。
 * listingAliases: { "Airbnb掲載名": "物件マスタの物件名", ... }
 * 戻り値: 物件マスタの物件名 or null（未登録のリスティング＝要手動対応）
 */
function matchListingAlias(body, listingAliases) {
  const keys = Object.keys(listingAliases || {}).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (body.includes(key)) {
      return { propertyName: listingAliases[key], matchedAlias: key };
    }
  }
  return null;
}

/**
 * Airbnb予約確定メールかどうかの簡易判定
 */
function isAirbnbConfirmationEmail(subject, from, body) {
  const fromOk = AIRBNB_SENDER_HINT.test(from || '') || AIRBNB_SENDER_HINT.test(body || '');
  const subjectOk = CONFIRMATION_HINT.test(subject || '');
  return fromOk && subjectOk;
}

/**
 * Airbnb予約確定メールを解析する。
 * 戻り値: null（Airbnb確定メールでない、または必須項目が取れない）
 *   または { guestName, propertyName, matchedAlias, checkInDate, checkInTime,
 *            checkOutDate, checkOutTime, persons, confirmationCode, guestCountRaw }
 * listingAliases が未指定、または該当なしの場合は propertyName: null で返す
 * （呼び出し側で「物件不明」として扱い、手動対応を促す）
 */
function parseAirbnbEmail({ subject, from, body }, listingAliases, now) {
  if (!isAirbnbConfirmationEmail(subject, from, body)) {
    return null;
  }

  const checkInMatch = body.match(CHECKIN_BLOCK);
  const checkOutMatch = body.match(CHECKOUT_BLOCK);
  if (!checkInMatch || !checkOutMatch) {
    return null; // 日付が取れない場合は解析失敗として扱う（フォーマット変更の可能性）
  }

  const base = now || new Date();
  const checkInYear = resolveYear(parseInt(checkInMatch[1], 10), parseInt(checkInMatch[2], 10), base);
  const checkOutYear = resolveYear(parseInt(checkOutMatch[1], 10), parseInt(checkOutMatch[2], 10), base);

  const guestCountMatch = body.match(GUEST_COUNT_BLOCK);
  const { total: persons } = guestCountMatch ? parseGuestCounts(guestCountMatch[1]) : { total: null };

  const confirmationCodeMatch = body.match(CONFIRMATION_CODE_BLOCK);
  const subjectGuestMatch = (subject || '').match(SUBJECT_GUEST_HINT);

  const listingResult = matchListingAlias(body, listingAliases || {});

  return {
    guestName: subjectGuestMatch ? subjectGuestMatch[1] : null,
    propertyName: listingResult ? listingResult.propertyName : null,
    matchedAlias: listingResult ? listingResult.matchedAlias : null,
    checkInDate: formatDate(checkInYear, parseInt(checkInMatch[1], 10), parseInt(checkInMatch[2], 10)),
    checkInTime: checkInMatch[3],
    checkOutDate: formatDate(checkOutYear, parseInt(checkOutMatch[1], 10), parseInt(checkOutMatch[2], 10)),
    checkOutTime: checkOutMatch[3],
    persons,
    guestCountRaw: guestCountMatch ? guestCountMatch[1].trim() : null,
    confirmationCode: confirmationCodeMatch ? confirmationCodeMatch[1] : null,
  };
}

module.exports = { parseAirbnbEmail, isAirbnbConfirmationEmail };
