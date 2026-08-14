/**
 * propertyDirectory（物件名→顧客名・有効状態の軽量コピー）から、
 * 物件選択用の選択肢リストを組み立てる。
 *
 * 「桜」「櫻」のような同名・紛らわしい物件名を区別できるよう、
 * 顧客名が分かる場合はラベルに含める（例：「桜（新陽株式会社）」）。
 *
 * @param {Object} directory - onPropertyDirectoryChange の戻り値
 * @param {string[]} [extraNames] - 既存データ等、ディレクトリに無くても必ず候補に含めたい物件名
 *   （編集画面で、過去に登録された物件名がマスタ未登録・無効化されていても選択肢から消えないようにするため）
 */
export function buildPropertyOptions(directory, extraNames = []) {
  const seen = new Set();
  const options = [];

  Object.entries(directory).forEach(([name, info]) => {
    if (info.active === false) return;
    seen.add(name);
    options.push({
      name,
      label: info.customerName ? `${name}（${info.customerName}）` : name,
    });
  });

  extraNames.forEach((name) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    const info = directory[name];
    options.push({
      name,
      label: info
        ? `${name}（${info.customerName || '無効化された物件'}）`
        : `${name}（⚠️ マスタ未登録）`,
    });
  });

  return options.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
