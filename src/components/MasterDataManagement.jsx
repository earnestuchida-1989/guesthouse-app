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
import { downloadXLSX } from '../utils/xlsxExport';

const CUSTOMER_TYPE_LABELS = {
  internal: '自社',
  external: '外部',
};

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
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
    return () => {
      unsubCustomers();
      unsubProperties();
    };
  }, []);

  const customerNameById = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  const filteredCustomers = customers.filter(
    (c) => !search || c.name?.includes(search) || c.id.includes(search)
  );
  const filteredProperties = properties.filter(
    (p) => !search || p.name.includes(search) || (p.customerId && customerNameById[p.customerId]?.includes(search))
  );

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

  const todayStr = new Date().toISOString().slice(0, 10);

  const propertyCsvColumns = [
    { key: 'name', label: '物件名' },
    { key: 'propertyId', label: '物件ID' },
    { key: 'customerId', label: '顧客', format: (p) => (p.customerId ? (customerNameById[p.customerId] || p.customerId) : '') },
    { key: 'cleaningPrice', label: '清掃単価（円）', format: (p) => (typeof p.cleaningPrice === 'number' ? p.cleaningPrice : '') },
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
      } else {
        await downloadXLSX(`物件マスタ_${todayStr}.xlsx`, '物件マスタ', filteredProperties, propertyCsvColumns);
      }
    } catch (err) {
      alert('Excel出力に失敗しました: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-2">📇 マスタデータ管理</h2>
      <p className="text-sm text-gray-500 mb-6">
        日々の細かい修正はここから。大量の新規登録・一括修正はマスタデータ入力テンプレート（Excel）＋取り込みスクリプトの方が早いです。
      </p>

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
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'customers' ? '顧客名・IDで検索...' : '物件名・顧客名で検索...'}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        />
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting || (tab === 'customers' ? filteredCustomers : filteredProperties).length === 0}
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
              } else {
                setEditingProperty(null);
                setShowPropertyModal(true);
              }
            }}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
          >
            + {tab === 'customers' ? '顧客を追加' : '物件を追加'}
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
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">顧客ID</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">顧客名</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">タイプ</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">担当者</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">連絡先</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">状態</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500 text-sm font-mono">{c.id}</td>
                    <td className="px-6 py-4 text-gray-800 font-semibold">{c.name}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{CUSTOMER_TYPE_LABELS[c.type] || c.type || '-'}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{c.contactName || '-'}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {c.phone && <span className="block">{c.phone}</span>}
                      {c.email && <span className="block">{c.email}</span>}
                      {!c.phone && !c.email && '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        c.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}>
                        {c.active === false ? '無効' : '有効'}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setEditingCustomer(c); setShowCustomerModal(true); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm transition"
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
      ) : (
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
                  {typeof p.cleaningPrice === 'number' && <p>💰 ¥{p.cleaningPrice.toLocaleString()}</p>}
                  {p.address && <p>📍 {p.address}</p>}
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
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">物件名</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">顧客</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">清掃単価</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">住所</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">状態</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((p) => (
                  <tr key={p.name} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-800 font-semibold">{p.name}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {p.customerId ? (customerNameById[p.customerId] || p.customerId) : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-800 text-sm">
                      {typeof p.cleaningPrice === 'number' ? `¥${p.cleaningPrice.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{p.address || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        p.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}>
                        {p.active === false ? '無効' : '有効'}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setEditingProperty(p); setShowPropertyModal(true); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteProperty(p)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm transition"
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
          onClose={() => { setShowPropertyModal(false); setEditingProperty(null); }}
        />
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
        <div className="bg-blue-500 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
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

function PropertyModal({ property, customers, onClose }) {
  const isEdit = !!property;
  const [name, setName] = useState(property?.name || '');
  const [propertyId, setPropertyId] = useState(property?.propertyId || '');
  const [customerId, setCustomerId] = useState(property?.customerId || '');
  const [cleaningPrice, setCleaningPrice] = useState(
    typeof property?.cleaningPrice === 'number' ? String(property.cleaningPrice) : ''
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
        cleaningPrice: cleaningPrice !== '' ? parseInt(cleaningPrice, 10) : null,
        address: address.trim(),
        totalRooms: totalRooms !== '' ? parseInt(totalRooms, 10) : null,
        operationType: operationType.trim(),
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
        notes: notes.trim(),
        active,
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
        <div className="bg-blue-500 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
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
            <label className="block text-gray-700 font-semibold mb-2">物件ID（社内管理用）</label>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="例：shinyo-01"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">清掃単価（円）</label>
              <input
                type="number"
                value={cleaningPrice}
                onChange={(e) => setCleaningPrice(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
