const { google } = require('googleapis');

/**
 * サービスアカウントの認証情報(JSON文字列)からGoogle Sheets APIクライアントを作成
 */
function getSheetsClient(serviceAccountKeyJson) {
  const credentials = JSON.parse(serviceAccountKeyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * 列文字(A, B, C...)を0始まりのインデックスに変換
 */
function columnLetterToIndex(letter) {
  if (!letter) return -1;
  let index = 0;
  const upper = letter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * 指定シート(タブ)の値+書式(取り消し線・赤字)を取得
 * 戻り値: [{ rowIndex, values: [値の配列], strikethrough: [true/false配列], redText: [true/false配列] }]
 */
async function fetchSheetRows(sheets, spreadsheetId, tabName) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`${tabName}`],
    fields:
      'sheets(properties.title,data.rowData.values(formattedValue,userEnteredFormat.textFormat.strikethrough,userEnteredFormat.textFormat.foregroundColor))',
  });

  const sheetData = res.data.sheets && res.data.sheets[0];
  if (!sheetData || !sheetData.data || !sheetData.data[0]) {
    return [];
  }

  const rowData = sheetData.data[0].rowData || [];
  const rows = [];

  rowData.forEach((row, idx) => {
    const cells = row.values || [];
    const values = cells.map((c) => (c && c.formattedValue) || '');
    const strikethrough = cells.map(
      (c) => !!(c && c.userEnteredFormat && c.userEnteredFormat.textFormat && c.userEnteredFormat.textFormat.strikethrough)
    );
    const redText = cells.map((c) => {
      const color = c && c.userEnteredFormat && c.userEnteredFormat.textFormat && c.userEnteredFormat.textFormat.foregroundColor;
      if (!color) return false;
      const r = color.red || 0;
      const g = color.green || 0;
      const b = color.blue || 0;
      // 赤系判定: 赤が強く、緑・青が弱い
      return r > 0.5 && g < 0.4 && b < 0.4;
    });

    // 空行はスキップ対象として値だけ保持(呼び出し側で判定)
    rows.push({ rowIndex: idx + 1, values, strikethrough, redText });
  });

  return rows;
}

module.exports = {
  getSheetsClient,
  columnLetterToIndex,
  fetchSheetRows,
};
