import { useState, useEffect } from 'react';
import { onReservationsChange, updateReservation } from '../services/reservationService';
import { onPropertiesChange } from '../services/propertyService';

export default function CustomerReports({ user }) {
  const [reservations, setReservations] = useState([]);
  const [propertyMaster, setPropertyMaster] = useState({});
  const [loading, setLoading] = useState(true);
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    const unsubReservations = onReservationsChange((data) => {
      setReservations(data);
      setLoading(false);
    });
    const unsubProperties = onPropertiesChange((map) => {
      setPropertyMaster(map);
    });
    return () => {
      unsubReservations();
      unsubProperties();
    };
  }, []);

  // 自社の物件マスタで customerId が一致する物件名のみに絞り込む
  const myPropertyNames = Object.entries(propertyMaster)
    .filter(([, data]) => data.customerId === user?.customerId)
    .map(([name]) => name);

  // スタッフが完了報告した予定のみを対象にする
  const myReports = reservations
    .filter((r) => r.completed && myPropertyNames.includes(r.propertyName || r.guestName))
    .sort((a, b) => {
      const dateA = a.cleaningDate || a.checkOut || '';
      const dateB = b.cleaningDate || b.checkOut || '';
      return dateB.localeCompare(dateA); // 新しい順
    });

  const handleFeedbackChange = (id, value) => {
    setFeedbackDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const handleSendFeedback = async (res) => {
    const comment = (feedbackDrafts[res.id] ?? '').trim();
    if (!comment) return;
    setSavingId(res.id);
    try {
      await updateReservation(res.id, {
        customerFeedback: comment,
        customerFeedbackAt: new Date().toISOString(),
        customerFeedbackBy: user?.email || user?.uid || '',
      });
      setFeedbackDrafts((prev) => ({ ...prev, [res.id]: '' }));
    } catch (err) {
      alert('フィードバックの送信に失敗しました: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">データ読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">📷 清掃報告</h1>

      {myReports.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          まだ清掃報告がありません
        </div>
      ) : (
        <div className="space-y-6">
          {myReports.map((res) => (
            <div key={res.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{res.propertyName || res.guestName}</h2>
                  <p className="text-sm text-gray-500">
                    清掃日: {res.cleaningDate || res.checkOut}
                  </p>
                  {res.completedAt && (
                    <p className="text-xs text-gray-400">
                      報告日時: {new Date(res.completedAt).toLocaleString('ja-JP')}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                  ✅ 完了
                </span>
              </div>

              {res.photoUrls && res.photoUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {res.photoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt=""
                        className="w-full h-32 object-cover rounded-lg border hover:opacity-80 transition"
                      />
                    </a>
                  ))}
                </div>
              )}

              {res.reportNote && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-700">
                  <p className="font-semibold text-gray-600 mb-1">スタッフからのメモ</p>
                  <p>{res.reportNote}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="font-semibold text-gray-700 mb-2">💬 フィードバック</p>
                {res.customerFeedback && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-3 text-sm text-gray-700">
                    <p>{res.customerFeedback}</p>
                    {res.customerFeedbackAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(res.customerFeedbackAt).toLocaleString('ja-JP')}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedbackDrafts[res.id] ?? ''}
                    onChange={(e) => handleFeedbackChange(res.id, e.target.value)}
                    placeholder={res.customerFeedback ? 'コメントを更新する' : 'コメントを送る'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleSendFeedback(res)}
                    disabled={savingId === res.id || !(feedbackDrafts[res.id] ?? '').trim()}
                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg text-sm transition"
                  >
                    {savingId === res.id ? '送信中...' : '送信'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
