import { useState, useEffect } from 'react';
import { onReservationsChange, deleteReservation } from '../services/reservationService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import AddReservationModal from './AddReservationModal';
import EditReservationModal from './EditReservationModal';
import CompletionReportModal from './CompletionReportModal';

export default function Reservations({ allowedProperties = null, readOnly = false, canReport = true, currentUser = null }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [customerFilter, setCustomerFilter] = useState('');

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

  // 清掃日順（チェックインの有無では並び替えない。表示上のバッジ・強調のみ）
  const sortedReservations = [...reservations]
    .filter((res) => !customerFilter || getCustomerName(res) === customerFilter)
    .sort((a, b) => {
      const dateA = a.cleaningDate || a.checkOut || '';
      const dateB = b.cleaningDate || b.checkOut || '';
      return dateA.localeCompare(dateB);
    });

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
        <div className="flex flex-wrap items-center gap-3">
          {customerOptions.length > 0 && (
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
          )}
          {!readOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition"
            >
              + 新規予定追加
            </button>
          )}
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

        {/* デスクトップ：テーブル表示 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">イン</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">物件名</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">顧客</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">清掃日</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">人数</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">備考</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ステータス</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">完了報告</th>
                {!readOnly && (
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedReservations.map((res) => (
                <tr
                  key={res.id}
                  className={`border-b hover:bg-gray-50 ${res.hasCheckIn ? 'bg-orange-50' : ''}`}
                >
                  <td className="px-6 py-4">
                    {res.hasCheckIn ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-500 text-white"
                        title="ゲストのチェックインあり"
                      >
                        🔴 イン{res.checkInTime ? ` ${res.checkInTime}` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-800">{res.propertyName || res.guestName}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{getCustomerName(res) || '-'}</td>
                  <td className="px-6 py-4 text-gray-800">{res.cleaningDate || res.checkOut}</td>
                  <td className="px-6 py-4 text-gray-800">{res.persons}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{res.notes || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
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
                  <td className="px-6 py-4">
                    {res.completed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        ✅ 完了{res.photoUrls?.length ? `（写真${res.photoUrls.length}枚）` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">未報告</span>
                    )}
                    {canReport && (
                      <button
                        onClick={() => handleReport(res)}
                        className="block mt-1 text-xs bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded transition"
                      >
                        📷 {res.completed ? '報告を編集' : '完了報告する'}
                      </button>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-6 py-4 space-x-2">
                      <button
                        onClick={() => handleEdit(res)}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm transition"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(res.id)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm transition"
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
