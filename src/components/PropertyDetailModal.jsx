// 清掃管理画面で物件名をクリックしたときに開く、リネン・消耗品の必要準備数の確認用モーダル。
// 編集はできない（編集は「マスタデータ管理」の物件マスタから行う）、閲覧専用。

// 品目の必要数＝基本数＋1人あたり×宿泊人数＋（◯名超過分の追加ルール）（人数未定の場合はnull）
function requiredQuantity(item, persons) {
  if (typeof persons !== 'number') return null;
  let total = (item.minQuantity || 0) + (item.perPerson || 0) * persons;
  if (typeof item.thresholdPersons === 'number' && persons > item.thresholdPersons) {
    total += (item.extraPerPerson || 0) * (persons - item.thresholdPersons);
  }
  return total;
}

function SupplySection({ title, icon, tracking, persons }) {
  if (!tracking || !tracking.enabled || !Array.isArray(tracking.items) || tracking.items.length === 0) {
    return null;
  }
  return (
    <div className="mb-4">
      <h4 className="font-semibold text-gray-700 mb-2">
        {icon} {title}
      </h4>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th className="px-3 py-1.5 text-left">品目</th>
            <th className="px-3 py-1.5 text-left">基本数＋1人あたり</th>
            {typeof persons === 'number' && <th className="px-3 py-1.5 text-left">今回の必要数</th>}
            {tracking.storesOnSite && <th className="px-3 py-1.5 text-left">現在庫</th>}
          </tr>
        </thead>
        <tbody>
          {tracking.items.map((item, idx) => {
            const required = requiredQuantity(item, persons);
            const isLow =
              tracking.storesOnSite &&
              typeof item.currentStock === 'number' &&
              typeof required === 'number' &&
              item.currentStock < required;
            return (
              <tr key={idx} className="border-t">
                <td className="px-3 py-1.5 font-medium text-gray-800">{item.name}</td>
                <td className="px-3 py-1.5 text-gray-600">
                  {item.minQuantity ?? 0}
                  {item.perPerson ? ` ＋ 1人×${item.perPerson}` : ''}
                  {typeof item.thresholdPersons === 'number' && item.extraPerPerson
                    ? ` ／ ${item.thresholdPersons}名超過分+${item.extraPerPerson}`
                    : ''}
                </td>
                {typeof persons === 'number' && (
                  <td className="px-3 py-1.5 font-semibold text-gray-800">{required}</td>
                )}
                {tracking.storesOnSite && (
                  <td className="px-3 py-1.5">
                    <span className={isLow ? 'font-bold text-red-600' : 'text-gray-800'}>
                      {typeof item.currentStock === 'number' ? item.currentStock : '-'}
                    </span>
                    {isLow && <span className="ml-1 text-xs text-red-600">⚠️ 不足</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function PropertyDetailModal({ propertyName, info, persons, onClose }) {
  const hasLinen = info?.linenTracking?.enabled && info.linenTracking.items?.length > 0;
  const hasSupplies = info?.suppliesTracking?.enabled && info.suppliesTracking.items?.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{propertyName}</h3>
            {info?.customerName && <p className="text-xs text-gray-500">{info.customerName}</p>}
            {typeof persons === 'number' && <p className="text-xs text-gray-500">今回の予約：{persons}名</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <SupplySection title="リネン準備数" icon="🧺" tracking={info?.linenTracking} persons={persons} />
          <SupplySection title="消耗品準備数" icon="🧴" tracking={info?.suppliesTracking} persons={persons} />
          {!hasLinen && !hasSupplies && (
            <p className="text-sm text-gray-500">
              この物件はリネン・消耗品の管理情報が登録されていません。「マスタデータ管理」→物件マスタの編集画面から登録できます。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
