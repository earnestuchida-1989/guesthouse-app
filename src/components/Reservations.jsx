import { useState, useEffect } from 'react';
import { onReservationsChange, deleteReservation, setComplaintFlag } from '../services/reservationService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import AddReservationModal from './AddReservationModal';
import EditReservationModal from './EditReservationModal';
import CompletionReportModal from './CompletionReportModal';

export default function Reservations({ allowedProperties = null, readOnly = false, canReport = true, currentUser = null, isAdmin = false }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [customerFilter, setCustomerFilter] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onReservationsChange((data) => {
      const filtered = allowedProperties
        ? data.filter((r) => allowedProperties.includes(r.propertyName || r.guestName))
        : data;
      setReservations(filtered);
      setLoading(false);
    });
    const unsubDirectory = onPropertyDirectoryChange((map) => setPropertyDirectory(map));

    return () => {
      unsubscribe();
      unsubDirectory();
    };
  }, [allowedProperties]);

  // 物件名だけでは「桜」「櫻」のように同名・紛らわしいケースがあるため、顧客名を併記する
  const getCustomerName = (res) => {
    const name = res.propertyName || res.guestName;
    return propertyDirectory[name]?.customerName || '';
  };

  // Googleスプレッドシート／カレンダーから自動取り込みされた予定には、
  // 元データ（同期元のシート・カレンダー）へのリンクを付ける。
  // 手入力で作成した予定・LINE取り込みの予定は元データがブラウザで開けるURLを持たないため対象外。
  const getSourceLink = (res) => {
    if (res.source === 'sheet' && res.sheetId) {
      return { url: `https://docs.google.com/spreadsheets/d/${res.sheetId}/edit`, label: '元シートを開く' };
    }
    if (res.source === 'calendar' && res.calendarId) {
      return { url: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(res.calendarId)}`, label: '元カレンダーを開く' };
    }
    return null;
  };

  const handleEdit = (reservation) => {
    setSelectedReservation(reservation);
    setShowEditModal(true);
  };

  const handleReport = (reservation) => {
    setSelectedReservation(reservation);
    setShowReportModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('この清掃予定を削除しますか？')) {
      try {
        await deleteReservation(id);
        alert('削除しました！');
      } catch (err) {
        alert('削除に失敗しました: ' + err.message);
      }
    }
  };

  const handleReservationAdded = () => {
    setShowAddModal(false);
  };

  const handleReservationUpdated = () => {
    setShowEditModal(false);
    setSelectedReservation(null);
  };

  const handleToggleComplaint = async (res) => {
    try {
      await setComplaintFlag(res.id, !res.isComplaint);
    } catch (err) {
      alert('更新に失敗しました: ' + err.message);
    }
  };

  // 清掃日順（チェックインの有無では並び替えない。表示上のバッジ・強調のみ）
  const sortedReservations = [...reservations]
    .filter((res) => !customerFilter || getCustomerName(res) === customerFilter)
    .filter((res) => {
      if (!propertySearch) return true;
      const name = res.propertyName || res.guestName || '';
      return name.includes(propertySearch);
    })
    .filter((res) => {
      const date = res.cleaningDate || res.checkOut || '';
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = a.cleaningDate || a.checkOut || '';
      const dateB = b.cleaningDate || b.checkOut || '';
      return dateA.localeCompare(dateB);
    });

  const hasActiveFilters = customerFilter || propertySearch || dateFrom || dateTo;
  const clearFilters = () => {
    setCustomerFilter('');
    setPropertySearch('');
    setDateFrom('');
    setDateTo('');
  };

  // 一覧に出てきている物件の顧客名だけを候補にする（顧客マスタ全件ではなく、実際に使われているものだけ）
  const customerOptions = Array.from(
    new Set(reservations.map((res) => getCustomerName(res)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'ja'));

  const statusLabel = (res) =>
    res.status === 'cancelled'
      ? 'キャンセル'
      : res.status === 'no_cleaning_needed'
      ? '清掃不要'
      : res.status === 'confirmed'
      ? '確定'
      : '待機中';

  const statusClasses = (res) =>
    res.status === 'cancelled'
      ? 'bg-gray-200 text-gray-600 line-through'
      : res.status === 'no_cleaning_needed'
      ? 'bg-purple-100 text-purple-700'
      : res.status === 'confirmed'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-yellow-100 text-yellow-800';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">清掃スケジュール管理</h1>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
          >
            + 新規予定追加
          </button>
        )}
      </div>

      {/* 検索・絞り込み */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">物件名で検索</label>
            <input
              type="text"
              value={propertySearch}
              onChange={(e) => setPropertySearch(e.target.value)}
              placeholder="物件名..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">清掃日（から）</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">清掃日（まで）</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {customerOptions.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">顧客</label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべての顧客</option>
                {customerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline py-2"
            >
              絞り込みをクリア
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto py-2">{sortedReservations.length}件表示中</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">データ読み込み中...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
        {/* モバイル：カード表示 */}
        <div className="md:hidden divide-y divide-gray-200">
          {sortedReservations.map((res) => (
            <div
              key={res.id}
              className={`p-4 space-y-2 ${res.hasCheckIn ? 'bg-orange-50' : ''}`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 break-words">
                    {res.propertyName || res.guestName}
                    {res.isComplaint && (
                      <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white align-middle">
                        🚩 クレーム
                      </span>
                    )}
                    {getSourceLink(res) && (
                      <a
                        href={getSourceLink(res).url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={getSourceLink(res).label}
                        className="ml-2 inline-flex items-center text-blue-500 hover:text-blue-700 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔗
                      </a>
                    )}
                  </p>
                  {getCustomerName(res) && (
                    <p className="text-xs text-gray-500">{getCustomerName(res)}</p>
                  )}
                </div>
                {res.hasCheckIn && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-500 text-white whitespace-nowrap">
                    🔴 イン{res.checkInTime ? ` ${res.checkInTime}` : ''}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                <span>📅 {res.cleaningDate || res.checkOut}</span>
                <span>👥 {res.persons ? `${res.persons}名` : '人数未定'}</span>
              </div>

              {res.notes && <p className="text-sm text-gray-600">📝 {res.notes}</p>}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusClasses(res)}`}>
                  {statusLabel(res)}
                </span>
                {res.completed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    ✅ 完了{res.photoUrls?.length ? `（写真${res.photoUrls.length}枚）` : ''}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">未報告</span>
                )}
              </div>

              {isAdmin && res.customerFeedback && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-xs text-gray-500 mb-1">💬 お客様からのフィードバック</p>
                  <p className="text-sm text-gray-700">{res.customerFeedback}</p>
                  <button
                    onClick={() => handleToggleComplaint(res)}
                    className={`mt-2 text-xs font-bold py-1 px-3 rounded transition ${
                      res.isComplaint
                        ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                  >
                    {res.isComplaint ? 'クレーム扱いを解除' : '🚩 クレームとして記録'}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {canReport && (
                  <button
                    onClick={() => handleReport(res)}
                    className="flex-1 min-w-[7rem] text-sm bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg transition"
                  >
                    📷 {res.completed ? '報告を編集' : '完了報告する'}
                  </button>
                )}
                {!readOnly && (
                  <>
                    <button
                      onClick={() => handleEdit(res)}
                      className="flex-1 min-w-[5rem] text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg transition"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(res.id)}
                      className="flex-1 min-w-[5rem] text-sm bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition"
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {sortedReservations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">清掃予定がありません</p>
            </div>
          )}
        </div>

        {/* デスクトップ：テーブル表示（コンパクト） */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">イン</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">物件名</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">顧客</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">清掃日</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">人数</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">備考</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">状態</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">完了報告</th>
                {isAdmin && (
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">フィードバック</th>
                )}
                {!readOnly && (
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedReservations.map((res) => (
                <tr
                  key={res.id}
                  className={`border-b hover:bg-gray-50 ${res.hasCheckIn ? 'bg-orange-50' : ''}`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {res.hasCheckIn ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white"
                        title="ゲストのチェックインあり"
                      >
                        🔴{res.checkInTime ? ` ${res.checkInTime}` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-800 max-w-[11rem]">
                    <div className="flex items-center gap-1">
                      <span className="truncate" title={res.propertyName || res.guestName}>
                        {res.propertyName || res.guestName}
                      </span>
                      {res.isComplaint && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                          🚩
                        </span>
                      )}
                      {getSourceLink(res) && (
                        <a
                          href={getSourceLink(res).url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={getSourceLink(res).label}
                          className="shrink-0 text-blue-500 hover:text-blue-700"
                        >
                          🔗
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 max-w-[8rem] truncate" title={getCustomerName(res) || ''}>
                    {getCustomerName(res) || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-800 whitespace-nowrap">{res.cleaningDate || res.checkOut}</td>
                  <td className="px-2 py-1.5 text-gray-800">{res.persons}</td>
                  <td className="px-2 py-1.5 text-gray-600 max-w-[8rem] truncate" title={res.notes || ''}>
                    {res.notes || '-'}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      res.status === 'cancelled'
                        ? 'bg-gray-200 text-gray-600 line-through'
                        : res.status === 'no_cleaning_needed'
                        ? 'bg-purple-100 text-purple-700'
                        : res.status === 'confirmed'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {res.status === 'cancelled'
                        ? 'キャンセル'
                        : res.status === 'no_cleaning_needed'
                        ? '清掃不要'
                        : res.status === 'confirmed'
                        ? '確定'
                        : '待機中'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {res.completed ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        ✅{res.photoUrls?.length ? `（${res.photoUrls.length}枚）` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">未報告</span>
                    )}
                    {canReport && (
                      <button
                        onClick={() => handleReport(res)}
                        className="block mt-1 text-xs bg-green-500 hover:bg-green-600 text-white font-bold py-0.5 px-1.5 rounded transition"
                      >
                        📷 {res.completed ? '編集' : '報告する'}
                      </button>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-1.5 max-w-[10rem]">
                      {res.customerFeedback ? (
                        <div>
                          <p className="text-xs text-gray-700 line-clamp-2" title={res.customerFeedback}>{res.customerFeedback}</p>
                          <button
                            onClick={() => handleToggleComplaint(res)}
                            className={`mt-1 text-xs font-bold py-0.5 px-1.5 rounded transition ${
                              res.isComplaint
                                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                : 'bg-red-500 hover:bg-red-600 text-white'
                            }`}
                          >
                            {res.isComplaint ? '解除' : '🚩 記録'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                  )}
                  {!readOnly && (
                    <td className="px-2 py-1.5 space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => handleEdit(res)}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(res.id)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded text-xs transition"
                      >
                        削除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {reservations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">清掃予定がありません</p>
            </div>
          )}
        </div>
        </div>
      )}

      {showAddModal && (
        <AddReservationModal
          onClose={() => setShowAddModal(false)}
          onReservationAdded={handleReservationAdded}
        />
      )}

      {showEditModal && selectedReservation && (
        <EditReservationModal
          reservation={selectedReservation}
          onClose={() => {
            setShowEditModal(false);
            setSelectedReservation(null);
          }}
          onReservationUpdated={handleReservationUpdated}
        />
      )}

      {showReportModal && selectedReservation && (
        <CompletionReportModal
          reservation={selectedReservation}
          currentUser={currentUser}
          onClose={() => {
            setShowReportModal(false);
            setSelectedReservation(null);
          }}
          onCompleted={() => {}}
        />
      )}
    </div>
  );
}
