/**
 * マスタデータ（顧客・物件・従業員・協力業者）をExcelテンプレートからFirestoreへ取り込むスクリプト。
 *
 * 実行方法:
 *   node functions/scripts/importMasterData.js <xlsxファイルへのパス>
 *
 * 認証: firebase-tools のログイン済みOAuthトークン（~/.config/configstore/firebase-tools.json）を
 * 使ってFirestore REST APIを直接呼び出す（`firebase login` 済みであること）。
 *
 * 動作:
 * - 各シートの1行目=ヘッダー、2行目=説明用の例（グレー行）としてスキップし、3行目以降を取り込む
 * - 「顧客マスタ」→ customers/{顧客ID}
 * - 「物件マスタ」→ properties/{物件名}（清掃単価などをアプリの動的料金として使用）
 *     - Google Sheets ID + シートタブ名が入力されていて、かつ sheetConfigs/{物件ID} が
 *       まだ存在しない場合のみ、標準構造（列マッピングのみ）の sheetConfigs を自動作成する
 *       （グリッド形式など特殊な構造は手動調整が必要なため、既存設定は上書きしない）
 * - 「従業員マスタ」→ employees/{従業員ID}（参照データのみ。ログインアカウントは別途手動作成）
 * - 「協力業者マスタ」→ vendors/{業者ID} ＋ propertyAssignments/{物件名}（対応物件IDを物件名に変換して割当）
 *
 * 何度でも安全に再実行可能（同じIDのドキュメントは上書き）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const PROJECT_ID = 'guesthouse-schedule-app';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return data.tokens.access_token;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined || v === '') {
    return { nullValue: null };
  }
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  return { stringValue: String(v) };
}

function buildFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

async function firestoreSet(token, collectionPath, docId, fields) {
  const url = `${BASE_URL}/${collectionPath}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore書き込み失敗 ${collectionPath}/${docId}: ${res.status} ${text}`);
  }
}

async function firestoreExists(token, collectionPath, docId) {
  const url = `${BASE_URL}/${collectionPath}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}

function sheetToRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return { headers: [], rows: [] };
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (raw[0] || []).map((h) => String(h).trim());
  // 1行目=ヘッダー、2行目=説明例（スキップ）、3行目以降=データ
  const rows = raw.slice(2).filter((r) => (r[0] || '').toString().trim() !== '');
  return { headers, rows };
}

function col(headers, row, name) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? row[idx] : '';
}

function splitList(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toActive(v) {
  const s = String(v || '').trim();
  if (s === '無効') return false;
  return true; // 空欄・「有効」はtrue扱い
}

async function importCustomers(token, workbook) {
  const { headers, rows } = sheetToRows(workbook, '顧客マスタ');
  let count = 0;
  const customerNameById = {};
  for (const row of rows) {
    const id = col(headers, row, '顧客ID');
    if (!id) continue;
    const name = col(headers, row, '顧客名（会社名）');
    customerNameById[id] = name || id;
    await firestoreSet(token, 'customers', id, buildFields({
      name,
      type: col(headers, row, '顧客タイプ'),
      contactName: col(headers, row, '担当者名'),
      phone: col(headers, row, '電話番号'),
      email: col(headers, row, 'メールアドレス'),
      billingAddress: col(headers, row, '請求先住所'),
      paymentMethod: col(headers, row, '支払方法'),
      contractStart: col(headers, row, '契約開始日'),
      contractEnd: col(headers, row, '契約終了日'),
      propertyIds: splitList(col(headers, row, '対応物件ID')),
      googleSheetsId: col(headers, row, 'Google Sheets ID'),
      notes: col(headers, row, '備考'),
      active: toActive(col(headers, row, '有効/無効')),
      updatedAt: new Date().toISOString(),
    }));
    count++;
  }
  return { count, customerNameById };
}

async function importProperties(token, workbook, customerNameById) {
  const { headers, rows } = sheetToRows(workbook, '物件マスタ');
  let count = 0;
  let sheetConfigCount = 0;
  const propertyIdToName = {};

  for (const row of rows) {
    const propertyId = col(headers, row, '物件ID');
    const propertyName = col(headers, row, '物件名');
    if (!propertyId || !propertyName) continue;
    propertyIdToName[propertyId] = propertyName;

    const priceRaw = col(headers, row, '清掃単価（円）');
    const cleaningPrice = priceRaw !== '' ? parseInt(priceRaw, 10) : null;
    const customerId = col(headers, row, '顧客ID');

    await firestoreSet(token, 'properties', propertyName, buildFields({
      propertyId,
      customerId,
      address: col(headers, row, '住所'),
      prefecture: col(headers, row, '都道府県'),
      city: col(headers, row, '市区町村'),
      postalCode: col(headers, row, '郵便番号'),
      totalRooms: col(headers, row, '総部屋数') !== '' ? parseInt(col(headers, row, '総部屋数'), 10) : null,
      cleaningPrice,
      operationType: col(headers, row, '運営タイプ'),
      googleSheetsId: col(headers, row, 'Google Sheets ID'),
      sheetTabName: col(headers, row, 'シートタブ名'),
      managerName: col(headers, row, '物件マネージャー名'),
      managerPhone: col(headers, row, 'マネージャー電話'),
      amenities: col(headers, row, '設備・アメニティ'),
      notes: col(headers, row, '備考'),
      active: toActive(col(headers, row, '有効/無効')),
      updatedAt: new Date().toISOString(),
    }));
    count++;

    // 物件ディレクトリ（物件名→顧客名の軽量コピー）も同時に更新。
    // properties自体は管理者専用のため、スタッフ・協力業者が「同名の物件」を区別するのに使う。
    await firestoreSet(token, 'propertyDirectory', propertyName, buildFields({
      customerId: customerId || '',
      customerName: customerId ? (customerNameById[customerId] || customerId) : '',
      updatedAt: new Date().toISOString(),
    }));

    // Google Sheets連携情報が入っていれば、未登録の場合のみ sheetConfigs を自動作成
    const gsId = col(headers, row, 'Google Sheets ID');
    const tabName = col(headers, row, 'シートタブ名');
    if (gsId && tabName) {
      const exists = await firestoreExists(token, 'sheetConfigs', propertyId);
      if (!exists) {
        await firestoreSet(token, 'sheetConfigs', propertyId, buildFields({
          sheetId: gsId,
          tabName,
          clientName: col(headers, row, '顧客ID'),
          mode: 'single',
          propertyName,
          columns: {
            checkIn: col(headers, row, 'チェックイン列') || 'A',
            checkOut: col(headers, row, 'チェックアウト列') || 'B',
            persons: col(headers, row, '人数列') || 'C',
            notes: col(headers, row, '備考列') || 'D',
          },
          headerRow: 1,
          active: true,
        }));
        sheetConfigCount++;
      }
    }
  }
  return { count, sheetConfigCount, propertyIdToName };
}

async function importEmployees(token, workbook) {
  const { headers, rows } = sheetToRows(workbook, '従業員マスタ');
  let count = 0;
  for (const row of rows) {
    const id = col(headers, row, '従業員ID');
    if (!id) continue;
    await firestoreSet(token, 'employees', id, buildFields({
      name: col(headers, row, '氏名'),
      employmentType: col(headers, row, '雇用形態'),
      phone: col(headers, row, '電話番号'),
      email: col(headers, row, 'メールアドレス'),
      lineUserId: col(headers, row, 'LINE User ID'),
      hourlyWage: col(headers, row, '時給（円）') !== '' ? parseInt(col(headers, row, '時給（円）'), 10) : null,
      assignedPropertyIds: splitList(col(headers, row, '担当物件ID')),
      skills: splitList(col(headers, row, 'スキル・資格')),
      maxTeamSize: col(headers, row, '最大チーム人数') !== '' ? parseInt(col(headers, row, '最大チーム人数'), 10) : null,
      employmentStart: col(headers, row, '雇用開始日'),
      employmentEnd: col(headers, row, '雇用終了日'),
      bankName: col(headers, row, '銀行名'),
      branchName: col(headers, row, '支店名'),
      accountType: col(headers, row, '口座種別'),
      accountNumber: col(headers, row, '口座番号'),
      notes: col(headers, row, '備考'),
      active: toActive(col(headers, row, '有効/無効')),
      updatedAt: new Date().toISOString(),
    }));
    count++;
  }
  return count;
}

const VENDOR_COLORS = ['#6366F1', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#64748B'];

async function importVendors(token, workbook, propertyIdToName) {
  const { headers, rows } = sheetToRows(workbook, '協力業者マスタ');
  let vendorCount = 0;
  let assignmentCount = 0;
  let i = 0;
  for (const row of rows) {
    const id = col(headers, row, '業者ID');
    if (!id) continue;
    await firestoreSet(token, 'vendors', id, buildFields({
      name: col(headers, row, '業者名'),
      type: col(headers, row, '業者タイプ'),
      contactName: col(headers, row, '担当者名'),
      phone: col(headers, row, '電話番号'),
      email: col(headers, row, 'メールアドレス'),
      lineUserId: col(headers, row, 'LINE User ID'),
      rate: col(headers, row, '単価または時給（円）') !== '' ? parseInt(col(headers, row, '単価または時給（円）'), 10) : null,
      skills: splitList(col(headers, row, 'スキル・資格')),
      contractStart: col(headers, row, '契約開始日'),
      contractEnd: col(headers, row, '契約終了日'),
      bankName: col(headers, row, '銀行名'),
      branchName: col(headers, row, '支店名'),
      accountType: col(headers, row, '口座種別'),
      accountNumber: col(headers, row, '口座番号'),
      notes: col(headers, row, '備考'),
      color: VENDOR_COLORS[i % VENDOR_COLORS.length],
      active: toActive(col(headers, row, '有効/無効')),
      updatedAt: new Date().toISOString(),
    }));
    vendorCount++;
    i++;

    const propertyIds = splitList(col(headers, row, '対応物件ID'));
    for (const pid of propertyIds) {
      const propertyName = propertyIdToName[pid];
      if (!propertyName) {
        console.warn(`  ⚠ 業者「${col(headers, row, '業者名')}」の対応物件ID「${pid}」が物件マスタに見つかりません（物件マスタの取り込みが先に必要です）`);
        continue;
      }
      await firestoreSet(token, 'propertyAssignments', propertyName, buildFields({
        vendorId: id,
        updatedAt: new Date().toISOString(),
      }));
      assignmentCount++;
    }
  }
  return { vendorCount, assignmentCount };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('使い方: node importMasterData.js <xlsxファイルへのパス>');
    process.exit(1);
  }

  const token = getAccessToken();
  const workbook = XLSX.readFile(filePath);

  console.log('=== 顧客マスタ 取り込み中 ===');
  const { count: customerCount, customerNameById } = await importCustomers(token, workbook);
  console.log(`✓ ${customerCount}件`);

  console.log('=== 物件マスタ 取り込み中 ===');
  const { count: propertyCount, sheetConfigCount, propertyIdToName } = await importProperties(token, workbook, customerNameById);
  console.log(`✓ ${propertyCount}件（うちsheetConfigs自動作成: ${sheetConfigCount}件、propertyDirectoryも同時更新）`);

  console.log('=== 従業員マスタ 取り込み中 ===');
  const employeeCount = await importEmployees(token, workbook);
  console.log(`✓ ${employeeCount}件`);

  console.log('=== 協力業者マスタ 取り込み中 ===');
  const { vendorCount, assignmentCount } = await importVendors(token, workbook, propertyIdToName);
  console.log(`✓ 業者${vendorCount}件、物件割当${assignmentCount}件`);

  console.log('\n✅ 取り込み完了！');
}

main().catch((err) => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
