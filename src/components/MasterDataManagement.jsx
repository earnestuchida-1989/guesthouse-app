import { useState, useEffect } from 'react';
import {
  onCustomersChange,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  customerExists,
} from '../services/customerService';
import {
  onPropertiesChange,
  addProperty,
  updateProperty,
  deleteProperty,
  propertyExists,
} from '../services/propertyService';
import {
  onEmployeesChange,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  employeeExists,
} from '../services/employeeService';
import { onReservationsChange } from '../services/reservationService';
import { onVendorsChange, onPropertyAssignmentsChange } from '../services/vendorService';
import { downloadXLSX } from '../utils/xlsxExport';
import IcalFeedManagement from './IcalFeedManagement';
import SupplyStockManagement from './SupplyStockManagement';

const CUSTOMER_TYPE_LABELS = {
  internal: '自社',
  external: '外部',
};

const EMPLOYEE_CSV_COLUMNS = [
  { key: 'id', label: '従業員ID' },
  { key: 'name', label: '氏名' },
  { key: 'employmentType', label: '雇用形態' },
  { key: 'phone', label: '電話番号' },
  { key: 'email', label: 'メール' },
  { key: 'lineUserId', label: 'LINE User ID' },
  { key: 'hourlyWage', label: '時給（円）', format: (e) => (typeof e.hourlyWage === 'number' ? e.hourlyWage : '') },
  { key: 'skills', label: 'スキル・資格', format: (e) => (Array.isArray(e.skills) ? e.skills.join('、') : e.skills || '') },
  { key: 'employmentStart', label: '雇用開始日' },
  { key: 'employmentEnd', label: '雇用終了日' },
  { key: 'notes', label: '備考' },
  { key: 'active', label: '状態', format: (e) => (e.active === false ? '無効' : '有効') },
];

const CUSTOMER_CSV_COLUMNS = [
  { key: 'id', label: '顧客ID' },
  { key: 'name', label: '顧客名' },
  { key: 'type', label: 'タイプ', format: (c) => CUSTOMER_TYPE_LABELS[c.type] || c.type || '' },
  { key: 'contactName', label: '担当者名' },
  { key: 'phone', label: '電話番号' },
  { key: 'email', label: 'メール' },
  { key: 'billingAddress', label: '請求先住所' },
  { key: 'paymentMethod', label: '支払方法' },
  { key: 'contractStart', label: '契約開始日' },
  { key: 'contractEnd', label: '契約終了日' },
  { key: 'notes', label: '備考' },
  { key: 'active', label: '状態', format: (c) => (c.active === false ? '無効' : '有効') },
];

export default function MasterDataManagement() {
  const [tab, setTab] = useState('customers');
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [propertyAssignments, setPropertyAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [propertyPrefillName, setPropertyPrefillName] = useState('');
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showIcalModal, setShowIcalModal] = useState(false);
  const [showLinenModal, setShowLinenModal] = useState(false);
  const [showSuppliesModal, setShowSuppliesModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const unsubCustomers = onCustomersChange((data) => {
      setCustomers(data.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja')));
      setLoading(false);
    });
    const unsubProperties = onPropertiesChange((map) => {
      const list = Object.entries(map)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setProperties(list);
    });
    const unsubEmployees = onEmployeesChange((data) => {
      setEmployees(data.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja')));
    });
    const unsubReservations = onReservationsChange(setReservations);
    const unsubVendors = onVendorsChange((data) => setVendors(data));
    const unsubAssignments = onPropertyAssignmentsChange((map) => setPropertyAssignments(map));
    return () => {
      unsubCustomers();
      unsubProperties();
      unsubEmployees();
      unsubReservations();
      unsubVendors();
      unsubAssignments();
    };
  }, []);

  const customerNameById = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  // 担当業者は propertyAssignments（協力業者アカウントも読める公開コピー）を正として表示する。
  // properties.vendorId は編集画面での初期値目的で持たせているだけなので、表示は常にこちらを優先する。
  const propertiesWithVendor = properties.map((p) => ({
    ...p,
    vendorId: propertyAssignments[p.name] || null,
  }));

  const filteredCustomers = customers.filter(
    (c) => !search || c.name?.includes(search) || c.id.includes(search)
  );
  const filteredProperties = propertiesWithVendor.filter(
    (p) => !search || p.name.includes(search) || (p.customerId && customerNameById[p.customerId]?.includes(search))
  );
  const filteredEmployees = employees.filter(
    (e) => !search || e.name?.includes(search) || e.id.includes(search)
  );

  // 清掃予定で使われている物件名のうち、物件マスタに登録されていないものを検出する。
  // 「物件マスタと清掃予定がちゃんと紐付いているか」を一目で確認できるようにするため。
  const propertyNameSet = new Set(properties.map((p) => p.name));
  const orphanedByName = {};
  reservations.forEach((r) => {
    const name = r.propertyName || r.guestName;
    if (!name || propertyNameSet.has(name)) return;
    if (!orphanedByName[name]) orphanedByName[name] = 0;
    orphanedByName[name] += 1;
  });
  const orphanedProperties = Object.entries(orphanedByName)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const handleAddOrphanedProperty = (name) => {
    setPropertyPrefillName(name);
    setEditingProperty(null);
    setTab('properties');
    setShowPropertyModal(true);
  };

  const handleDeleteCustomer = async (c) => {
    const usedByProperties = properties.filter((p) => p.customerId === c.id);
    if (usedByProperties.length > 0) {
      alert(
        `「${c.name}」は${usedByProperties.length}件の物件に紐付いているため削除できません。\n先に物件側の顧客を変更してください。\n（対象: ${usedByProperties.map((p) => p.name).join('、')}）`
      );
      return;
    }
    if (!window.confirm(`顧客「${c.name}」を削除しますか？`)) return;
    try {
      await deleteCustomer(c.id);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  const handleDeleteProperty = async (p) => {
    if (!window.confirm(`物件「${p.name}」を削除しますか？\n※ 過去の清掃予定・実績は削除されません。`)) return;
    try {
      await deleteProperty(p.name);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  const handleDeleteEmployee = async (e) => {
    if (!window.confirm(`従業員「${e.name}」を削除しますか？\nアカウントとの紐付けがある場合、アカウント管理画面で解除してください。`)) return;
    try {
      await deleteEmployee(e.id);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const propertyCsvColumns = [
    { key: 'name', label: '物件名' },
    { key: 'propertyId', label: '物件ID' },
    { key: 'customerId', label: '顧客', format: (p) => (p.customerId ? (customerNameById[p.customerId] || p.customerId) : '') },
    { key: 'vendorId', label: '担当業者', format: (p) => (p.vendorId ? (vendorNameById[p.vendorId] || p.vendorId) : '') },
    { key: 'cleaningPrice', label: '清掃単価（円・顧客請求額）', format: (p) => (typeof p.cleaningPrice === 'number' ? p.cleaningPrice : '') },
    { key: 'outsourceAmount', label: '委託金額（円・業者への支払額）', format: (p) => (typeof p.outsourceAmount === 'number' ? p.outsourceAmount : '') },
    { key: 'address', label: '住所' },
    { key: 'totalRooms', label: '総部屋数', format: (p) => (typeof p.totalRooms === 'number' ? p.totalRooms : '') },
    { key: 'operationType', label: '運営タイプ' },
    { key: 'managerName', label: 'マネージャー名' },
    { key: 'managerPhone', label: 'マネージャー電話' },
    { key: 'notes', label: '備考' },
    { key: 'active', label: '状態', format: (p) => (p.active === false ? '無効' : '有効') },
  ];

  // 検索で絞り込んでいる場合は、その結果だけをエクスポートする（画面に見えている分＝出力される分、を分かりやすくするため）
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      if (tab === 'customers') {
        await downloadXLSX(`顧客マスタ_${todayStr}.xlsx`, '顧客マスタ', filteredCustomers, CUSTOMER_CSV_COLUMNS);
      } else if (tab === 'properties') {
        await downloadXLSX(`物件マスタ_${todayStr}.xlsx`, '物件マスタ', filteredProperties, propertyCsvColumns);
      } else {
        await downloadXLSX(`従業員マスタ_${todayStr}.xlsx`, '従業員マスタ', filteredEmployees, EMPLOYEE_CSV_COLUMNS);
      }
    } catch (err) {
      alert('Excel出力に失敗しました: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const currentTabCount = tab === 'customers' ? filteredCustomers.length : tab === 'properties' ? filteredProperties.length : filteredEmployees.length;

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-2">📇 マスタデータ管理</h2>
      <p className="text-sm text-gray-500 mb-4">
        日々の細かい修正はここから。大量の新規登録・一括修正はマスタデータ入力テンプレート（Excel）＋取り込みスクリプトの方が早いです。
      </p>

      {/* 物件マスタ⇔清掃予定の整合性チェック */}
      {!loading && (
        orphanedProperties.length > 0 ? (
          <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 mb-6">
            <p className="font-semibold text-orange-800 mb-2">
              ⚠️ 清掃予定はあるが物件マスタに未登録の物件が {orphanedProperties.length} 件あります
            </p>
            <p className="text-sm text-orange-700 mb-3">
              これらは物件マスタに未登録のため、清掃管理画面の「顧客」欄が空欄になったり、マスタデータ管理で単価・住所などを管理できません。
            </p>
            <ul className="space-y-1">
              {orphanedProperties.map((o) => (
                <li key={o.name} className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm">
                  <span className="text-gray-800">
                    {o.name} <span className="text-gray-400">（清掃予定 {o.count} 件）</span>
                  </span>
                  <button
                    onClick={() => handleAddOrphanedProperty(o.name)}
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold py-1 px-3 rounded transition whitespace-nowrap"
                  >
                    + マスタに登録
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm text-green-800">
              ✅ 清掃予定で使われている物件はすべて物件マスタに登録されています（物件マスタ {properties.length} 件）
            </p>
          </div>
        )
      )}

      {/* タブ */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setTab('customers'); setSearch(''); }}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            tab === 'customers' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          🧑‍💼 顧客マスタ（{customers.length}）
        </button>
        <button
          onClick={() => { setTab('properties'); setSearch(''); }}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            tab === 'properties' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          🏠 物件マスタ（{properties.length}）
        </button>
        <button
          onClick={() => { setTab('employees'); setSearch(''); }}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            tab === 'employees' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          👷 従業員マスタ（{employees.length}）
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            tab === 'customers' ? '顧客名・IDで検索...' : tab === 'properties' ? '物件名・顧客名で検索...' : '氏名・IDで検索...'
          }
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        />
        <div className="flex gap-2">
          {tab === 'properties' && (
            <button
              onClick={() => setShowIcalModal(true)}
              className="bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300 transition whitespace-nowrap"
              title="Airbnb等のiCal（.ics）カレンダー同期URLを登録・管理"
            >
              🔗 iCal連携
            </button>
          )}
          {tab === 'properties' && (
            <button
              onClick={() => setShowLinenModal(true)}
              className="bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300 transition whitespace-nowrap"
              title="リネン在庫の確認・補充"
            >
              🧺 リネン在庫
            </button>
          )}
          {tab === 'properties' && (
            <button
              onClick={() => setShowSuppliesModal(true)}
              className="bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300 transition whitespace-nowrap"
              title="消耗品在庫の確認・補充"
            >
              🧴 消耗品在庫
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={exporting || currentTabCount === 0}
            className="bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300 transition whitespace-nowrap"
            title="今表示されている一覧をExcelファイル（.xlsx）でダウンロード"
          >
            {exporting ? '出力中...' : '⬇️ Excel出力'}
          </button>
          <button
            onClick={() => {
              if (tab === 'customers') {
                setEditingCustomer(null);
                setShowCustomerModal(true);
              } else if (tab === 'properties') {
                setEditingProperty(null);
                setPropertyPrefillName('');
                setShowPropertyModal(true);
              } else {
                setEditingEmployee(null);
                setShowEmployeeModal(true);
              }
            }}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
          >
            + {tab === 'customers' ? '顧客を追加' : tab === 'properties' ? '物件を追加' : '従業員を追加'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-600">データ読み込み中...</p>
      ) : tab === 'customers' ? (
        <div className="bg-white rounded-lg shadow">
          {/* モバイル：カード表示 */}
          <div className="md:hidden divide-y divide-gray-200">
            {filteredCustomers.map((c) => (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 break-words">{c.name}</p>
                    <p className="text-xs text-gray-500">ID: {c.id}</p>
                  </div>
                  {c.active === false && (
                    <span className="shrink-0 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">無効</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {c.contactName && <p>👤 {c.contactName}</p>}
                  {c.phone && <p>📞 {c.phone}</p>}
                  {c.email && <p>✉️ {c.email}</p>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => { setEditingCustomer(c); setShowCustomerModal(true); }}
                    className="flex-1 min-w-[5rem] text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteCustomer(c)}
                    className="flex-1 min-w-[5rem] text-sm bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {filteredCustomers.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する顧客がありません</p>
              </div>
            )}
          </div>

          {/* デスクトップ：テーブル表示 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">顧客ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">顧客名</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">タイプ</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">担当者</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">連絡先</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">状態</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-500 text-xs font-mono whitespace-nowrap">{c.id}</td>
                    <td className="px-3 py-1.5 text-gray-800 font-semibold text-sm max-w-[8rem] truncate" title={c.name}>{c.name}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm whitespace-nowrap">{CUSTOMER_TYPE_LABELS[c.type] || c.type || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm max-w-[6rem] truncate" title={c.contactName || ''}>{c.contactName || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs max-w-[9rem] truncate">
                      {c.phone && <span className="block">{c.phone}</span>}
                      {c.email && <span className="block">{c.email}</span>}
                      {!c.phone && !c.email && '-'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}>
                        {c.active === false ? '無効' : '有効'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setEditingCustomer(c); setShowCustomerModal(true); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCustomers.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する顧客がありません</p>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'properties' ? (
        <div className="bg-white rounded-lg shadow">
          {/* モバイル：カード表示 */}
          <div className="md:hidden divide-y divide-gray-200">
            {filteredProperties.map((p) => (
              <div key={p.name} className="p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 break-words">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {p.customerId ? (customerNameById[p.customerId] || p.customerId) : '顧客未設定'}
                    </p>
                  </div>
                  {p.active === false && (
                    <span className="shrink-0 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">無効</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {typeof p.cleaningPrice === 'number' && <p>💰 請求 ¥{p.cleaningPrice.toLocaleString()}</p>}
                  {typeof p.outsourceAmount === 'number' && <p>🤝 委託 ¥{p.outsourceAmount.toLocaleString()}</p>}
                  {p.address && <p>📍 {p.address}</p>}
                  <p>🏢 {p.vendorId ? (vendorNameById[p.vendorId] || '不明な業者') : '直営（未割当）'}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => { setEditingProperty(p); setShowPropertyModal(true); }}
                    className="flex-1 min-w-[5rem] text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteProperty(p)}
                    className="flex-1 min-w-[5rem] text-sm bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {filteredProperties.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する物件がありません</p>
              </div>
            )}
          </div>

          {/* デスクトップ：テーブル表示 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">物件名</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">顧客</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">担当業者</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">清掃単価（請求）</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">委託金額（支払）</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">住所</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">状態</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((p) => (
                  <tr key={p.name} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-800 font-semibold max-w-[9rem] truncate" title={p.name}>{p.name}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm max-w-[7rem] truncate" title={p.customerId ? (customerNameById[p.customerId] || p.customerId) : ''}>
                      {p.customerId ? (customerNameById[p.customerId] || p.customerId) : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm max-w-[7rem] truncate">
                      {p.vendorId ? (vendorNameById[p.vendorId] || '不明な業者') : '直営'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-800 text-sm whitespace-nowrap">
                      {typeof p.cleaningPrice === 'number' ? `¥${p.cleaningPrice.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-800 text-sm whitespace-nowrap">
                      {typeof p.outsourceAmount === 'number' ? `¥${p.outsourceAmount.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm max-w-[9rem] truncate" title={p.address || ''}>{p.address || '-'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}>
                        {p.active === false ? '無効' : '有効'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setEditingProperty(p); setShowPropertyModal(true); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteProperty(p)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProperties.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する物件がありません</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          {/* モバイル：カード表示 */}
          <div className="md:hidden divide-y divide-gray-200">
            {filteredEmployees.map((emp) => (
              <div key={emp.id} className="p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 break-words">{emp.name}</p>
                    <p className="text-xs text-gray-500">
                      {emp.id}{emp.employmentType ? `　/　${emp.employmentType}` : ''}
                    </p>
                  </div>
                  {emp.active === false && (
                    <span className="shrink-0 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">無効</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {emp.phone && <p>📞 {emp.phone}</p>}
                  {typeof emp.hourlyWage === 'number' && <p>💰 時給 ¥{emp.hourlyWage.toLocaleString()}</p>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => { setEditingEmployee(emp); setShowEmployeeModal(true); }}
                    className="flex-1 min-w-[5rem] text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteEmployee(emp)}
                    className="flex-1 min-w-[5rem] text-sm bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {filteredEmployees.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する従業員がありません</p>
              </div>
            )}
          </div>

          {/* デスクトップ：テーブル表示 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">従業員ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">氏名</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">雇用形態</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">連絡先</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">時給</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">状態</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-500 text-xs font-mono whitespace-nowrap">{emp.id}</td>
                    <td className="px-3 py-1.5 text-gray-800 font-semibold text-sm max-w-[8rem] truncate" title={emp.name}>{emp.name}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-sm whitespace-nowrap">{emp.employmentType || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs max-w-[9rem] truncate">
                      {emp.phone && <span className="block">{emp.phone}</span>}
                      {emp.email && <span className="block">{emp.email}</span>}
                      {!emp.phone && !emp.email && '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-800 text-sm whitespace-nowrap">
                      {typeof emp.hourlyWage === 'number' ? `¥${emp.hourlyWage.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        emp.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}>
                        {emp.active === false ? '無効' : '有効'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setEditingEmployee(emp); setShowEmployeeModal(true); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(emp)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEmployees.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">該当する従業員がありません</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showCustomerModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => { setShowCustomerModal(false); setEditingCustomer(null); }}
        />
      )}

      {showPropertyModal && (
        <PropertyModal
          property={editingProperty}
          customers={customers}
          vendors={vendors}
          existingProperties={properties}
          initialName={propertyPrefillName}
          onClose={() => { setShowPropertyModal(false); setEditingProperty(null); setPropertyPrefillName(''); }}
        />
      )}

      {showEmployeeModal && (
        <EmployeeModal
          employee={editingEmployee}
          existingEmployees={employees}
          onClose={() => { setShowEmployeeModal(false); setEditingEmployee(null); }}
        />
      )}

      {showIcalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">🔗 iCal連携</h3>
              <button
                onClick={() => setShowIcalModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <IcalFeedManagement />
            </div>
          </div>
        </div>
      )}

      {showLinenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">🧺 リネン在庫</h3>
              <button
                onClick={() => setShowLinenModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <SupplyStockManagement trackingKey="linenTracking" emptyMessage="リネン在庫を管理している物件はまだありません。" />
            </div>
          </div>
        </div>
      )}

      {showSuppliesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">🧴 消耗品在庫</h3>
              <button
                onClick={() => setShowSuppliesModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <SupplyStockManagement trackingKey="suppliesTracking" emptyMessage="消耗品在庫を管理している物件はまだありません。" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerModal({ customer, onClose }) {
  const isEdit = !!customer;
  const [id, setId] = useState(customer?.id || '');
  const [name, setName] = useState(customer?.name || '');
  const [type, setType] = useState(customer?.type || 'external');
  const [contactName, setContactName] = useState(customer?.contactName || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [billingAddress, setBillingAddress] = useState(customer?.billingAddress || '');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [active, setActive] = useState(customer?.active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError('顧客IDと顧客名は必須です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        type,
        contactName: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        billingAddress: billingAddress.trim(),
        notes: notes.trim(),
        active,
      };
      if (isEdit) {
        await updateCustomer(id, data);
      } else {
        if (await customerExists(id.trim())) {
          setError(`顧客ID「${id.trim()}」は既に使われています`);
          setLoading(false);
          return;
        }
        await createCustomer(id.trim(), data);
      }
      onClose();
    } catch (err) {
      setError(err.message || '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="bg-blue-500 text-white px-3 py-1.5 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">{isEdit ? '顧客を編集' : '顧客を追加'}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">顧客ID *</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isEdit}
              placeholder="例：shinyo"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              required
            />
            {!isEdit && <p className="text-xs text-gray-400 mt-1">後から変更できません。半角英数字推奨。</p>}
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">顧客名（会社名） *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">タイプ</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="external">外部</option>
              <option value="internal">自社</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">担当者名</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">電話番号</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">メール</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">請求先住所</label>
            <input
              type="text"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">備考</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
            <span className="text-gray-700">有効</span>
          </label>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// リネン管理・消耗品管理はどちらも「品目ごとの最低必要数（＋保管している物件は現在庫数）」という
// 同じ形のデータなので、共通のフックとUIコンポーネントにまとめている。
function useSupplyTracking(tracking) {
  const [enabled, setEnabled] = useState(tracking?.enabled || false);
  const [storesOnSite, setStoresOnSite] = useState(tracking?.storesOnSite || false);
  const [items, setItems] = useState(
    Array.isArray(tracking?.items) && tracking.items.length > 0
      ? tracking.items.map((it) => ({
          name: it.name || '',
          minQuantity: typeof it.minQuantity === 'number' ? String(it.minQuantity) : '',
          currentStock: typeof it.currentStock === 'number' ? String(it.currentStock) : '',
        }))
      : [{ name: '', minQuantity: '', currentStock: '' }]
  );

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { name: '', minQuantity: '', currentStock: '' }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const toData = () => ({
    enabled,
    storesOnSite: enabled && storesOnSite,
    items: enabled
      ? items
          .filter((it) => it.name.trim())
          .map((it) => ({
            name: it.name.trim(),
            minQuantity: it.minQuantity !== '' ? parseInt(it.minQuantity, 10) : 0,
            currentStock: storesOnSite && it.currentStock !== '' ? parseInt(it.currentStock, 10) : null,
          }))
      : [],
  });

  return { enabled, setEnabled, storesOnSite, setStoresOnSite, items, updateItem, addItem, removeItem, toData };
}

function SupplyEditorSection({ title, icon, unitLabel, tracking, note }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <label className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
        <input
          type="checkbox"
          checked={tracking.enabled}
          onChange={(e) => tracking.setEnabled(e.target.checked)}
          className="w-4 h-4"
        />
        {icon} {title}を使う
      </label>
      {tracking.enabled && (
        <div className="space-y-3 mt-2">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={tracking.storesOnSite}
              onChange={(e) => tracking.setStoresOnSite(e.target.checked)}
              className="w-4 h-4"
            />
            この物件で保管している（在庫数を管理する）
          </label>
          <div className="space-y-2">
            {tracking.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => tracking.updateItem(idx, 'name', e.target.value)}
                  placeholder="品目"
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
                <input
                  type="number"
                  value={item.minQuantity}
                  onChange={(e) => tracking.updateItem(idx, 'minQuantity', e.target.value)}
                  placeholder={`最低${unitLabel}数`}
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
                {tracking.storesOnSite && (
                  <input
                    type="number"
                    value={item.currentStock}
                    onChange={(e) => tracking.updateItem(idx, 'currentStock', e.target.value)}
                    placeholder="現在庫"
                    className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => tracking.removeItem(idx)}
                  className="text-red-500 hover:text-red-700 text-sm px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={tracking.addItem} className="text-xs text-blue-600 hover:underline">
            + 品目を追加
          </button>
          <p className="text-xs text-gray-400">{note}</p>
        </div>
      )}
    </div>
  );
}

function PropertyModal({ property, customers, vendors = [], existingProperties = [], initialName, onClose }) {
  const isEdit = !!property;
  const [name, setName] = useState(property?.name || initialName || '');
  const [propertyId, setPropertyId] = useState(property?.propertyId || '');
  // 新規作成時のみ自動発番の対象にする。手動で書き換えたら以後は上書きしない。
  const [propertyIdTouched, setPropertyIdTouched] = useState(isEdit);
  const [customerId, setCustomerId] = useState(property?.customerId || '');
  const [vendorId, setVendorId] = useState(property?.vendorId || '');

  // 顧客を選ぶと「顧客ID-連番」（例：shinyo-03）を自動で組み立てる。
  // 既存の物件マスタの命名規則（shinyo-01、earnest-01 等）に合わせている。
  useEffect(() => {
    if (isEdit || propertyIdTouched || !customerId) return;
    const count = existingProperties.filter((p) => p.customerId === customerId).length;
    const nextSeq = String(count + 1).padStart(2, '0');
    setPropertyId(`${customerId}-${nextSeq}`);
  }, [customerId, isEdit, propertyIdTouched, existingProperties]);
  const [cleaningPrice, setCleaningPrice] = useState(
    typeof property?.cleaningPrice === 'number' ? String(property.cleaningPrice) : ''
  );
  const [outsourceAmount, setOutsourceAmount] = useState(
    typeof property?.outsourceAmount === 'number' ? String(property.outsourceAmount) : ''
  );
  const [address, setAddress] = useState(property?.address || '');
  const [totalRooms, setTotalRooms] = useState(
    typeof property?.totalRooms === 'number' ? String(property.totalRooms) : ''
  );
  const [operationType, setOperationType] = useState(property?.operationType || '');
  const [managerName, setManagerName] = useState(property?.managerName || '');
  const [managerPhone, setManagerPhone] = useState(property?.managerPhone || '');
  const [notes, setNotes] = useState(property?.notes || '');
  const [active, setActive] = useState(property?.active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // リネン管理・消耗品管理：どちらも「品目ごとの最低必要数（＋保管している物件は現在庫数）」という
  // 同じ形のデータなので、共通のフックで管理する（useSupplyTracking、下部で定義）。
  const linenTracking = useSupplyTracking(property?.linenTracking);
  const suppliesTracking = useSupplyTracking(property?.suppliesTracking);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('物件名は必須です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const customerName = customerId
        ? customers.find((c) => c.id === customerId)?.name
        : '';
      const data = {
        propertyId: propertyId.trim(),
        customerId: customerId || '',
        vendorId: vendorId || '',
        cleaningPrice: cleaningPrice !== '' ? parseInt(cleaningPrice, 10) : null,
        outsourceAmount: outsourceAmount !== '' ? parseInt(outsourceAmount, 10) : null,
        address: address.trim(),
        totalRooms: totalRooms !== '' ? parseInt(totalRooms, 10) : null,
        operationType: operationType.trim(),
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
        notes: notes.trim(),
        active,
        linenTracking: linenTracking.toData(),
        suppliesTracking: suppliesTracking.toData(),
      };
      if (isEdit) {
        await updateProperty(name, data, customerName);
      } else {
        if (await propertyExists(name.trim())) {
          setError(`物件名「${name.trim()}」は既に登録されています`);
          setLoading(false);
          return;
        }
        await addProperty(name.trim(), data, customerName);
      }
      onClose();
    } catch (err) {
      setError(err.message || '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="bg-blue-500 text-white px-3 py-1.5 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">{isEdit ? '物件を編集' : '物件を追加'}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">物件名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              placeholder="清掃管理画面に表示される名前（例：向日町A）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              required
            />
            {isEdit && (
              <p className="text-xs text-gray-400 mt-1">
                既存の清掃予定と紐付いているため変更できません。名前を変えたい場合は削除→再作成してください。
              </p>
            )}
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">顧客</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未設定</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              直営（自社運営）の物件も、自社を表す顧客（例：アーネスト）を選んでください。物件IDが同じ形式で発番されます。
            </p>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">担当業者</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">直営（未割当）</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              「協力業者管理」の物件割り当てと連動しています。どちらの画面で変更しても反映されます。
            </p>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">物件ID（社内管理用）</label>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => { setPropertyId(e.target.value); setPropertyIdTouched(true); }}
              placeholder="顧客を選ぶと自動入力されます（例：shinyo-01）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!isEdit && (
              <p className="text-xs text-gray-400 mt-1">
                「顧客ID-連番」の形式で自動生成されます。手動で書き換えることもできます。
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">清掃単価（円）</label>
              <input
                type="number"
                value={cleaningPrice}
                onChange={(e) => setCleaningPrice(e.target.value)}
                placeholder="顧客への請求額"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">委託金額（円）</label>
              <input
                type="number"
                value={outsourceAmount}
                onChange={(e) => setOutsourceAmount(e.target.value)}
                placeholder="協力業者への支払額"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">総部屋数</label>
            <input
              type="number"
              value={totalRooms}
              onChange={(e) => setTotalRooms(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">住所</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">運営タイプ</label>
            <input
              type="text"
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              placeholder="例：自社運営／委託"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">マネージャー名</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">マネージャー電話</label>
              <input
                type="text"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <SupplyEditorSection
            title="リネン管理"
            icon="🧺"
            unitLabel="枚"
            tracking={linenTracking}
            note='ここで登録した品目は「清掃管理」画面の各予定に「🧺 リネン準備OK」チェックとして表示されます。在庫を保管している場合、チェックを入れるたびに現在庫から最低枚数分が自動で差し引かれます。'
          />
          <SupplyEditorSection
            title="消耗品管理"
            icon="🧴"
            unitLabel="個"
            tracking={suppliesTracking}
            note="トイレットペーパー・洗剤・アメニティ等、物件に置いておく消耗品の最低数・在庫を管理できます。清掃管理画面の物件詳細からも確認できます。"
          />
          <div>
            <label className="block text-gray-700 font-semibold mb-2">備考</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
            <span className="text-gray-700">有効</span>
          </label>
          <p className="text-xs text-gray-400">
            Google Sheets連携（自動取り込み設定）はこの画面では編集できません。マスタデータExcel＋取り込みスクリプト側で設定してください。
          </p>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 入社年月（YYMM）+連番の完全数字ID（例：260101 = 2026年1月入社の1人目）を組み立てる。
function buildNumericEmployeeId(employmentStart, existingEmployees, now) {
  const base = employmentStart ? new Date(employmentStart) : now || new Date();
  const yymm = `${String(base.getFullYear()).slice(-2)}${String(base.getMonth() + 1).padStart(2, '0')}`;
  const count = existingEmployees.filter((e) => e.id && e.id.startsWith(yymm)).length;
  const nextSeq = String(count + 1).padStart(2, '0');
  return `${yymm}${nextSeq}`;
}

function EmployeeModal({ employee, existingEmployees = [], onClose }) {
  const isEdit = !!employee;
  const [id, setId] = useState(employee?.id || '');
  // 新規作成時のみ自動発番の対象にする。手動で書き換えたら以後は上書きしない（物件IDと同じ方式）。
  const [idTouched, setIdTouched] = useState(isEdit);
  const [name, setName] = useState(employee?.name || '');
  const [employmentType, setEmploymentType] = useState(employee?.employmentType || '');
  const [phone, setPhone] = useState(employee?.phone || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [lineUserId, setLineUserId] = useState(employee?.lineUserId || '');
  const [hourlyWage, setHourlyWage] = useState(
    typeof employee?.hourlyWage === 'number' ? String(employee.hourlyWage) : ''
  );
  const [skills, setSkills] = useState(Array.isArray(employee?.skills) ? employee.skills.join('、') : '');
  const [employmentStart, setEmploymentStart] = useState(employee?.employmentStart || '');
  const [employmentEnd, setEmploymentEnd] = useState(employee?.employmentEnd || '');
  const [notes, setNotes] = useState(employee?.notes || '');
  const [active, setActive] = useState(employee?.active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 入社年月（YYMM）+連番の完全数字ID（例：260101）を自動で組み立てる。
  // 入社日が未入力のうちは今日の年月を仮に使い、入社日を入力したらそちらに合わせて再計算する。
  useEffect(() => {
    if (isEdit || idTouched) return;
    setId(buildNumericEmployeeId(employmentStart, existingEmployees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentStart, isEdit, idTouched, existingEmployees]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError('従業員IDと氏名は必須です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        employmentType: employmentType.trim(),
        phone: phone.trim(),
        email: email.trim(),
        lineUserId: lineUserId.trim(),
        hourlyWage: hourlyWage !== '' ? parseInt(hourlyWage, 10) : null,
        skills: skills.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
        employmentStart,
        employmentEnd,
        notes: notes.trim(),
        active,
      };
      if (isEdit) {
        await updateEmployee(id, data);
      } else {
        if (await employeeExists(id.trim())) {
          setError(`従業員ID「${id.trim()}」は既に使われています`);
          setLoading(false);
          return;
        }
        await createEmployee(id.trim(), data);
      }
      onClose();
    } catch (err) {
      setError(err.message || '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="bg-blue-500 text-white px-3 py-1.5 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">{isEdit ? '従業員を編集' : '従業員を追加'}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">氏名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">雇用形態</label>
            <input
              type="text"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              placeholder="例：社員／アルバイト"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">従業員ID *</label>
            <input
              type="text"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setIdTouched(true);
              }}
              disabled={isEdit}
              placeholder="自動入力されます（例：260101＝2026年1月入社の1人目）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              required
            />
            {!isEdit && <p className="text-xs text-gray-400 mt-1">後から変更できません。手動で書き換えることもできます。</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">電話番号</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">メール</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">LINE User ID</label>
            <input
              type="text"
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">時給（円）</label>
              <input
                type="number"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">スキル・資格</label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="読点区切り"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">雇用開始日</label>
              <input
                type="date"
                value={employmentStart}
                onChange={(e) => setEmploymentStart(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {!isEdit && <p className="text-xs text-gray-400 mt-1">入力すると従業員IDの年月部分に反映されます。</p>}
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">雇用終了日</label>
              <input
                type="date"
                value={employmentEnd}
                onChange={(e) => setEmploymentEnd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">備考</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
            <span className="text-gray-700">有効</span>
          </label>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
