/**
 * rows（オブジェクトの配列）と列定義（[{ key, label, format? }]）から
 * Excel（.xlsx）ファイルを生成し、そのままダウンロードさせる。
 * サーバー不要・ブラウザ内で完結。列見出し行は columns の label をそのまま使う。
 *
 * xlsxライブラリ（約280KB）はこの関数が実際に呼ばれた時だけ動的import する。
 * マスタデータ管理画面を開かない大多数のユーザー（スタッフ・協力業者・顧客）の
 * 初回読み込みを重くしないため。
 */
export async function downloadXLSX(filename, sheetName, rows, columns) {
  const XLSX = await import('xlsx');
  const data = rows.map((row) => {
    const obj = {};
    columns.forEach((c) => {
      const value = c.format ? c.format(row) : row[c.key];
      obj[c.label] = value === null || value === undefined ? '' : value;
    });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  const workbook = XLSX.utils.book_new();
  // シート名は31文字制限・一部記号NGなどExcelの制約があるため簡単にサニタイズ
  const safeSheetName = sheetName.slice(0, 31).replace(/[\\/*?:[\]]/g, '');
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName || 'Sheet1');
  XLSX.writeFile(workbook, filename);
}
