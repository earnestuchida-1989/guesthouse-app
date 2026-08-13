const { google } = require('googleapis');
const XLSX = require('xlsx');

/**
 * サービスアカウントの認証情報からGoogle Drive APIクライアントを作成
 * （Excel(.xlsx)形式のままDriveに置かれたファイルを直接ダウンロードするために使用）
 */
function getDriveClient(serviceAccountKeyJson) {
  const credentials = JSON.parse(serviceAccountKeyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Google Drive上のExcel(.xlsx)ファイルを生バイトのままダウンロードし、
 * 指定シートを Sheets API 版 fetchSheetRows と同じ形式（rowIndex, values配列）で返す。
 *
 * 注意: Community版SheetJSでは書式（取り消し線・文字色）の読み取りに対応していないため、
 * strikethrough/redTextは常にfalseを返す。キャンセル判定はセル内「キャンセル」文字列検出のみで行う。
 */
async function fetchExcelRows(drive, fileId, sheetName) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  const buffer = Buffer.from(res.data);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const targetSheetName = workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) return [];

  // header:1 で配列の配列として取得（1行目からそのままrowIndexに対応させる）
  const rows2d = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false, // 日付・数値も文字列として取得し、既存のnormalizeDate/normalizeTimeと挙動を揃える
  });

  // 横方向（同じ行内）の結合セル情報を行ごとにまとめる。
  // 結合セルは値が先頭列にしか入らず、残りの列は空文字として読めてしまうため、
  // グリッド解析側（buildGridReservationsForConfig）で「本当のチェックアウト日は
  // 結合範囲の最終列」と正しく判定できるように、開始列→終了列のマップを渡す。
  const mergeEndByColByRow = {};
  (worksheet['!merges'] || []).forEach((m) => {
    if (m.s.r !== m.e.r) return; // 縦方向の結合は対象外（日付は横方向のため）
    if (!mergeEndByColByRow[m.s.r]) mergeEndByColByRow[m.s.r] = {};
    mergeEndByColByRow[m.s.r][m.s.c] = m.e.c;
  });

  return rows2d.map((values, i) => ({
    rowIndex: i + 1,
    values: values.map((v) => (v === null || v === undefined ? '' : String(v))),
    strikethrough: values.map(() => false),
    redText: values.map(() => false),
    mergeEndByCol: mergeEndByColByRow[i] || {},
  }));
}

/**
 * ファイル内の全シート名一覧を取得（設定時の確認用）
 */
async function listExcelSheetNames(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(res.data);
  const workbook = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
  return workbook.SheetNames;
}

module.exports = { getDriveClient, fetchExcelRows, listExcelSheetNames };
