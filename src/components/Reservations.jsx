import { useState, useEffect } from 'react';
import { onReservationsChange, deleteReservation } from '../services/reservationService';
import AddReservationModal from './AddReservationModal';
import EditReservationModal from './EditReservationModal';

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onReservationsChange((data) => {
      setReservations(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleEdit = (reservation) => {
    setSelectedReservation(reservation);
    setShowEditModal(true);
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

  // チェックインありを優先的に上部表示、その後は清掃日順
  const sortedReservations = [...reservations].sort((a, b) => {
    if (!!b.hasCheckIn !== !!a.hasCheckIn) {
      return (b.hasCheckIn ? 1 : 0) - (a.hasCheckIn ? 1 : 0);
    }
    const dateA = a.cleaningDate || a.checkOut || '';
    const dateB = b.cleaningDate || b.checkOut || '';
    return dateA.localeCompare(dateB);
  });

  const checkInCount = reservations.filter(r => r.hasCheckIn).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">清掃スケジュール管理</h1>
          {checkInCount > 0 && (
            <p className="text-sm text-orange-700 font-semibold mt-1">
              ⚠️ 本日以降、チェックインありの予定が {checkInCount} 件あります（優先対応）
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition"
        >
          + 新規予定追加
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">データ読み込み中...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">イン</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">物件名</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">清掃日</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">人数</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">備考</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ステータス</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
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
                  <td className="px-6 py-4 text-gray-800">{res.cleaningDate || res.checkOut}</td>
                  <td className="px-6 py-4 text-gray-800">{res.persons}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{res.notes || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      res.status === 'confirmed'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {res.status === 'confirmed' ? '確定' : '待機中'}
                    </span>
                  </td>
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
    </div>
  );
}
