import { useState, useEffect } from 'react';
import { onReservationsChange, deleteReservation } from '../services/reservationService';

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firestore からリアルタイムでデータを取得
  useEffect(() => {
    const unsubscribe = onReservationsChange((data) => {
      setReservations(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm('この予約を削除しますか？')) {
      try {
        await deleteReservation(id);
        alert('予約を削除しました');
      } catch (error) {
        alert('削除に失敗しました: ' + error.message);
      }
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'confirmed') {
      return <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">確定</span>;
    }
    return <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">待機中</span>;
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-600">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">📅 予約管理</h2>
        <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition">
          ➕ 新規予約
        </button>
      </div>

      {/* 予約一覧テーブル */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {reservations.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            <p>予約がありません</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ゲスト名</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">チェックイン</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">チェックアウト</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">部屋</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">人数</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ステータス</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800">{reservation.guestName}</td>
                  <td className="px-6 py-4 text-gray-800">{reservation.checkIn}</td>
                  <td className="px-6 py-4 text-gray-800">{reservation.checkOut}</td>
                  <td className="px-6 py-4 text-gray-800">{reservation.room}</td>
                  <td className="px-6 py-4 text-gray-800">{reservation.persons}名</td>
                  <td className="px-6 py-4">{getStatusBadge(reservation.status)}</td>
                  <td className="px-6 py-4">
                    <button className="text-blue-500 hover:text-blue-700 mr-3">編集</button>
                    <button
                      onClick={() => handleDelete(reservation.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">確定済み予約</h3>
          <p className="text-3xl font-bold text-green-500">
            {reservations.filter(r => r.status === 'confirmed').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">待機中の予約</h3>
          <p className="text-3xl font-bold text-yellow-500">
            {reservations.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">総予約数</h3>
          <p className="text-3xl font-bold text-blue-500">{reservations.length}</p>
        </div>
      </div>
    </div>
  );
}
