import { useState, useEffect, useCallback } from 'react';
import { updateReservation } from '../services/reservationService';
import { uploadReservationPhotos } from '../services/storageService';
import { getMyCustomerReports } from '../services/customerReportsService';

export default function CustomerReports({ user }) {
  const [myReports, setMyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [feedbackFiles, setFeedbackFiles] = useState({});
  const [feedbackPreviews, setFeedbackPreviews] = useState({});
  const [feedbackProgress, setFeedbackProgress] = useState({});
  const [savingId, setSavingId] = useState(null);

  // 物件マスタは管理者専用のため、顧客ポータルはCloud Function経由で
  // 自分の物件の完了報告だけを取得する（直接Firestoreは読まない）
  const loadReports = useCallback(async () => {
    try {
      const reports = await getMyCustomerReports();
      reports.sort((a, b) => {
        const dateA = a.cleaningDate || '';
        const dateB = b.cleaningDate || '';
        return dateB.localeCompare(dateA); // 新しい順
      });
      setMyReports(reports);
      setLoadError('');
    } catch (err) {
      setLoadError('清掃報告の取得に失敗しました: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFeedbackChange = (id, value) => {
    setFeedbackDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const handleFeedbackFileChange = (id, e) => {
    const selected = Array.from(e.target.files || []);
    setFeedbackFiles((prev) => ({ ...prev, [id]: selected }));
    setFeedbackPreviews((prev) => ({ ...prev, [id]: selected.map((f) => URL.createObjectURL(f)) }));
  };

  const handleSendFeedback = async (res) => {
    const comment = (feedbackDrafts[res.id] ?? '').trim();
    const files = feedbackFiles[res.id] || [];
    if (!comment && files.length === 0) return;
    setSavingId(res.id);
    try {
      let customerFeedbackPhotos = res.customerFeedbackPhotos || [];
      if (files.length > 0) {
        setFeedbackProgress((prev) => ({ ...prev, [res.id]: { done: 0, total: files.length } }));
        const uploaded = await uploadReservationPhotos(res.id, files, (done, total) =>
          setFeedbackProgress((prev) => ({ ...prev, [res.id]: { done, total } }))
        );
        customerFeedbackPhotos = [...customerFeedbackPhotos, ...uploaded];
      }

      await updateReservation(res.id, {
        customerFeedback: comment || res.customerFeedback || '',
        customerFeedbackAt: new Date().toISOString(),
        customerFeedbackBy: user?.email || user?.uid || '',
        customerFeedbackPhotos,
      });
      setFeedbackDrafts((prev) => ({ ...prev, [res.id]: '' }));
      setFeedbackFiles((prev) => ({ ...prev, [res.id]: [] }));
      setFeedbackPreviews((prev) => ({ ...prev, [res.id]: [] }));
      await loadReports();
    } catch (err) {
      alert('フィードバックの送信に失敗しました: ' + err.message);
    } finally {
      setSavingId(null);
      setFeedbackProgress((prev) => ({ ...prev, [res.id]: null }));
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

      {loadError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{loadError}</div>
      )}

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
                {(res.customerFeedback || (res.customerFeedbackPhotos && res.customerFeedbackPhotos.length > 0)) && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-3 text-sm text-gray-700">
                    {res.customerFeedback && <p>{res.customerFeedback}</p>}
                    {res.customerFeedbackPhotos && res.customerFeedbackPhotos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                        {res.customerFeedbackPhotos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt="" className="w-full h-16 object-cover rounded-lg border hover:opacity-80 transition" />
                          </a>
                        ))}
                      </div>
                    )}
                    {res.customerFeedbackAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(res.customerFeedbackAt).toLocaleString('ja-JP')}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={feedbackDrafts[res.id] ?? ''}
                    onChange={(e) => handleFeedbackChange(res.id, e.target.value)}
                    placeholder={res.customerFeedback ? 'コメントを更新する' : 'コメントを送る'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFeedbackFileChange(res.id, e)}
                      className="flex-1 text-xs text-gray-600"
                    />
                    <button
                      onClick={() => handleSendFeedback(res)}
                      disabled={
                        savingId === res.id ||
                        (!(feedbackDrafts[res.id] ?? '').trim() && !(feedbackFiles[res.id]?.length))
                      }
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg text-sm transition whitespace-nowrap"
                    >
                      {savingId === res.id ? '送信中...' : '送信'}
                    </button>
                  </div>
                  {feedbackPreviews[res.id]?.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {feedbackPreviews[res.id].map((src, i) => (
                        <img key={i} src={src} alt="" className="w-full h-14 object-cover rounded-lg border" />
                      ))}
                    </div>
                  )}
                  {feedbackProgress[res.id] && (
                    <div className="text-xs text-gray-500">
                      写真アップロード中... {feedbackProgress[res.id].done} / {feedbackProgress[res.id].total}枚
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
