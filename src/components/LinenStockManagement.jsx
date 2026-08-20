import { useState, useEffect } from 'react';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import { updateLinenStock } from '../services/propertyService';

export default function LinenStockManagement() {
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [restockAmount, setRestockAmount] = useState({});
  const [saving, setSaving] = useState('');

  useEffect(() => {
    const unsub = onPropertyDirectoryChange(setPropertyDirectory);
    return () => unsub();
  }, []);

  const properties = Object.entries(propertyDirectory)
    .filter(([, info]) => info.linenTracking?.enabled && info.linenTracking?.storesOnSite)
    .filter(([, info]) => Array.isArray(info.linenTracking?.items) && info.linenTracking.items.length > 0)
    .sort(([a], [b]) => a.localeCompare(b, 'ja'));

  const handleRestock = async (propertyName, items, itemIdx) => {
    const key = `${propertyName}_${itemIdx}`;
    const amount = parseInt(restockAmount[key], 10);
    if (!amount || amount <= 0) return;
    setSaving(key);
    try {
      const newItems = items.map((it, i) => (i === itemIdx ? { ...it, currentStock: (it.currentStock || 0) + amount } : it));
      await updateLinenStock(propertyName, newItems);
      setRestockAmount((prev) => ({ ...prev, [key]: '' }));
    } catch (err) {
      alert('補充に失敗しました: ' + err.message);
    } finally {
      setSaving('');
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        「この物件でリネンを保管している」に設定した物件だけがここに表示されます。物件マスタの編集画面でリネン管理の品目・最低枚数を設定してください。
        清掃管理画面でスタッフが「🧺 リネン準備OK」をチェックするたびに、最低枚数分が自動で在庫から差し引かれます。
      </p>

      {properties.length === 0 && (
        <p className="text-sm text-gray-500">リネン在庫を管理している物件はまだありません。</p>
      )}

      <div className="space-y-4">
        {properties.map(([propertyName, info]) => (
          <div key={propertyName} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 font-semibold text-gray-800">
              {propertyName}
              {info.customerName && <span className="ml-2 font-normal text-xs text-gray-500">（{info.customerName}）</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-1.5 text-left">品目</th>
                  <th className="px-4 py-1.5 text-left">最低枚数</th>
                  <th className="px-4 py-1.5 text-left">現在庫</th>
                  <th className="px-4 py-1.5 text-left">補充</th>
                </tr>
              </thead>
              <tbody>
                {info.linenTracking.items.map((item, idx) => {
                  const isLow = typeof item.currentStock === 'number' && item.currentStock < (item.minQuantity || 0);
                  const key = `${propertyName}_${idx}`;
                  return (
                    <tr key={idx} className="border-t">
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="px-4 py-2">{item.minQuantity ?? '-'}</td>
                      <td className="px-4 py-2">
                        <span className={isLow ? 'font-bold text-red-600' : 'text-gray-800'}>
                          {typeof item.currentStock === 'number' ? item.currentStock : '-'}
                        </span>
                        {isLow && <span className="ml-1 text-xs text-red-600">⚠️ 不足</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={restockAmount[key] || ''}
                            onChange={(e) => setRestockAmount((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder="枚数"
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <button
                            onClick={() => handleRestock(propertyName, info.linenTracking.items, idx)}
                            disabled={saving === key}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-1 px-2 rounded"
                          >
                            + 補充
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
