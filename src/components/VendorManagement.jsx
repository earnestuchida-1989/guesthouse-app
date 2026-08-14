import { useState, useEffect } from 'react';
import {
  onVendorsChange,
  addVendor,
  updateVendor,
  deleteVendor,
  onPropertyAssignmentsChange,
  setPropertyAssignment,
} from '../services/vendorService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import { buildPropertyOptions } from '../utils/propertyOptions';
import { downloadXLSX } from '../utils/xlsxExport';

const COLOR_OPTIONS = [
  '#6366F1', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#64748B',
];

const VENDOR_CSV_COLUMNS = [
  { key: 'name', label: '業者名' },
  { key: 'type', label: 'タイプ' },
  { key: 'contactName', label: '担当者名' },
  { key: 'phone', label: '電話番号' },
  { key: 'email', label: 'メール' },
  { key: 'lineUserId', label: 'LINE User ID' },
  { key: 'skills', label: 'スキル・資格', format: (v) => (Array.isArray(v.skills) ? v.skills.join('、') : v.skills || '') },
  { key: 'contractStart', label: '契約開始日' },
  { key: 'contractEnd', label: '契約終了日' },
  { key: 'notes', label: '備考' },
  { key: 'active', label: '状態', format: (v) => (v.active === false ? '無効' : '有効') },
];

export default function VendorManagement() {
  const [vendors, setVendors] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const unsubVendors = onVendorsChange((data) => {
      setVendors(data.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
      setLoading(false);
    });
    const unsubAssignments = onPropertyAssignmentsChange((map) => {
      setAssignments(map);
    });
    const unsubDirectory = onPropertyDirectoryChange(setPropertyDirectory);
    return () => {
      unsubVendors();
      unsubAssignments();
      unsubDirectory();
    };
  }, []);

  const handleToggleActive = async (v) => {
    try {
      await updateVendor(v.id, { active: !v.active });
    } catch (err) {
      alert('変更に失敗しました: ' + err.message);
    }
  };

  const handleDeleteVendor = async (v) => {
    if (!window.confirm(`「${v.name}」を削除しますか？\n担当していた物件は未割当に戻ります。`)) return;
    try {
      const assignedProperties = Object.entries(assignments)
        .filter(([, vendorId]) => vendorId === v.id)
        .map(([propertyName]) => propertyName);
      await Promise.all(assignedProperties.map((p) => setPropertyAssignment(p, null)));
      await deleteVendor(v.id);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  const handleAssignmentChange = async (propertyName, vendorId) => {
    try {
      await setPropertyAssignment(propertyName, vendorId || null);
    } catch (err) {
      alert('割り当てに失敗しました: ' + err.message);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadXLSX(`協力業者マスタ_${todayStr}.xlsx`, '協力業者マスタ', filteredVendors, VENDOR_CSV_COLUMNS);
    } catch (err) {
      alert('Excel出力に失敗しました: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const vendorById = Object.fromEntries(vendors.map((v) => [v.id, v]));
  const filteredVendors = vendors.filter((v) => !search || v.name?.includes(search));
  // 割り当てが既についている物件は、ディレクトリ未登録・無効化されていても一覧から消えないようにする
  const propertyOptions = buildPropertyOptions(propertyDirectory, Object.keys(assignments));
  const filteredProperties = propertyOptions.filter(
    (p) => !propertySearch || p.name.includes(propertySearch) || p.label.includes(propertySearch)
  );

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-2">🏢 協力業者管理</h2>
      <p className="text-sm text-gray-500 mb-6">
        契約条件・振込先など、顧客・物件マスタと同じレベルで管理します（このデータは管理者のみ閲覧・編集できます）。
      </p>

      {/* 業者一覧 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h3 className="text-lg font-bold text-gray-800">協力業者一覧（{vendors.length}）</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="業者名で検索..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleExportExcel}
              disabled={exporting || filteredVendors.length === 0}
              className="bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-bold py-2 px-4 rounded-lg border border-gray-300 transition whitespace-nowrap"
              title="今表示されている一覧をExcelファイル（.xlsx）でダウンロード"
            >
              {exporting ? '出力中...' : '⬇️ Excel出力'}
            </button>
            <button
              onClick={() => { setEditingVendor(null); setShowVendorModal(true); }}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
            >
              + 業者を追加
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-600">読み込み中...</p>
        ) : filteredVendors.length === 0 ? (
          <p className="text-gray-500 text-sm">該当する協力業者がありません</p>
        ) : (
          <div className="space-y-2">
            {filteredVendors.map((v) => {
              const count = Object.values(assignments).filter((vendorId) => vendorId === v.id).length;
              return (
                <div key={v.id} className="border rounded-lg px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-4 h-4 rounded-full inline-block shrink-0" style={{ backgroundColor: v.color }} />
                      <span className="font-semibold text-gray-800 truncate">{v.name}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">担当 {count} 件</span>
                      {v.active === false && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">無効</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingVendor(v); setShowVendorModal(true); }}
                        className="text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleToggleActive(v)}
                        className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-3 rounded transition"
                      >
                        {v.active === false ? '有効化' : '無効化'}
                      </button>
                      <button
                        onClick={() => handleDeleteVendor(v)}
                        className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-3 rounded transition"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  {(v.contactName || v.phone || v.email) && (
                    <p className="text-xs text-gray-500 mt-2">
                      {[v.contactName, v.phone, v.email].filter(Boolean).join('　/　')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 物件ごとの担当業者割り当て */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800">物件ごとの担当業者</h3>
          <input
            type="text"
            value={propertySearch}
            onChange={(e) => setPropertySearch(e.target.value)}
            placeholder="物件名で検索..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="max-h-[32rem] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[420px]">
            <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">物件名</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">担当業者</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map(({ name: property, label }) => {
                const vendorId = assignments[property] || '';
                const vendor = vendorById[vendorId];
                return (
                  <tr key={property} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">
                      {vendor && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                          style={{ backgroundColor: vendor.color }}
                        />
                      )}
                      {label}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={vendorId}
                        onChange={(e) => handleAssignmentChange(property, e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">未割当</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showVendorModal && (
        <VendorModal
          vendor={editingVendor}
          onClose={() => { setShowVendorModal(false); setEditingVendor(null); }}
        />
      )}
    </div>
  );
}

function VendorModal({ vendor, onClose }) {
  const isEdit = !!vendor;
  const [name, setName] = useState(vendor?.name || '');
  const [type, setType] = useState(vendor?.type || '');
  const [color, setColor] = useState(vendor?.color || COLOR_OPTIONS[0]);
  const [contactName, setContactName] = useState(vendor?.contactName || '');
  const [phone, setPhone] = useState(vendor?.phone || '');
  const [email, setEmail] = useState(vendor?.email || '');
  const [lineUserId, setLineUserId] = useState(vendor?.lineUserId || '');
  const [skills, setSkills] = useState(Array.isArray(vendor?.skills) ? vendor.skills.join('、') : '');
  const [contractStart, setContractStart] = useState(vendor?.contractStart || '');
  const [contractEnd, setContractEnd] = useState(vendor?.contractEnd || '');
  const [bankName, setBankName] = useState(vendor?.bankName || '');
  const [branchName, setBranchName] = useState(vendor?.branchName || '');
  const [accountType, setAccountType] = useState(vendor?.accountType || '');
  const [accountNumber, setAccountNumber] = useState(vendor?.accountNumber || '');
  const [notes, setNotes] = useState(vendor?.notes || '');
  const [active, setActive] = useState(vendor?.active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('業者名は必須です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        type: type.trim(),
        color,
        contactName: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        lineUserId: lineUserId.trim(),
        skills: skills.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
        contractStart,
        contractEnd,
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountType: accountType.trim(),
        accountNumber: accountNumber.trim(),
        notes: notes.trim(),
        active,
      };
      if (isEdit) {
        await updateVendor(vendor.id, data);
      } else {
        await addVendor(data);
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
          <h2 className="text-xl font-bold">{isEdit ? '業者を編集' : '業者を追加'}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">業者名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：〇〇クリーニング"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">色（スケジュール上での識別色）</label>
            <div className="flex gap-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-gray-800' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">タイプ</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="例：清掃代行業者／個人事業主"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
            <label className="block text-gray-700 font-semibold mb-2">LINE User ID</label>
            <input
              type="text"
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
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
          <p className="text-xs text-gray-400 -mt-2">
            委託金額は業者ではなく物件ごとに決まるため、「マスタデータ管理」の物件マスタ側で設定してください。
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">契約開始日</label>
              <input
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">契約終了日</label>
              <input
                type="date"
                value={contractEnd}
                onChange={(e) => setContractEnd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-500">振込先（任意・管理者のみ閲覧可）</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-700 text-sm mb-1">銀行名</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-1">支店名</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-1">口座種別</label>
                <input
                  type="text"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  placeholder="普通／当座"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-1">口座番号</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
