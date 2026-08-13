import { useState, useEffect } from 'react';
import {
  onVendorsChange,
  addVendor,
  updateVendor,
  deleteVendor,
  onPropertyAssignmentsChange,
  setPropertyAssignment,
} from '../services/vendorService';
import { PROPERTIES } from '../data/properties';

const COLOR_OPTIONS = [
  '#6366F1', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#64748B',
];

export default function VendorManagement() {
  const [vendors, setVendors] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorColor, setNewVendorColor] = useState(COLOR_OPTIONS[0]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubVendors = onVendorsChange((data) => {
      setVendors(data.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
      setLoading(false);
    });
    const unsubAssignments = onPropertyAssignmentsChange((map) => {
      setAssignments(map);
    });
    return () => {
      unsubVendors();
      unsubAssignments();
    };
  }, []);

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (!newVendorName.trim()) return;
    try {
      await addVendor({ name: newVendorName.trim(), color: newVendorColor });
      setNewVendorName('');
    } catch (err) {
      alert('追加に失敗しました: ' + err.message);
    }
  };

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

  const vendorById = Object.fromEntries(vendors.map((v) => [v.id, v]));
  const filteredProperties = PROPERTIES.filter((p) => p.includes(search));

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">🏢 協力業者管理</h2>

      {/* 業者一覧・追加 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">協力業者一覧</h3>

        <form onSubmit={handleAddVendor} className="flex flex-wrap gap-3 items-end mb-6">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-sm text-gray-600 mb-1">業者名</label>
            <input
              type="text"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              placeholder="例：〇〇クリーニング"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">色</label>
            <div className="flex gap-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewVendorColor(c)}
                  className={`w-7 h-7 rounded-full border-2 ${newVendorColor === c ? 'border-gray-800' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition"
          >
            + 追加
          </button>
        </form>

        {loading ? (
          <p className="text-gray-600">読み込み中...</p>
        ) : vendors.length === 0 ? (
          <p className="text-gray-500 text-sm">協力業者がまだ登録されていません</p>
        ) : (
          <div className="space-y-2">
            {vendors.map((v) => {
              const count = Object.values(assignments).filter((id) => id === v.id).length;
              return (
                <div key={v.id} className="flex items-center justify-between border rounded-lg px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: v.color }} />
                    <span className="font-semibold text-gray-800">{v.name}</span>
                    <span className="text-xs text-gray-500">担当 {count} 件</span>
                    {v.active === false && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">無効</span>
                    )}
                  </div>
                  <div className="space-x-2">
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="物件名で検索..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">物件名</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">担当業者</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map((property) => {
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
                      {property}
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
    </div>
  );
}
