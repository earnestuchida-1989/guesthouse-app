import { useState } from 'react';
import { uploadReservationPhotos } from '../services/storageService';
import { updateReservation } from '../services/reservationService';

export default function CompletionReportModal({ reservation, currentUser, onClose, onCompleted }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [reportNote, setReportNote] = useState(reservation.reportNote || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUploading(true);
    try {
      let photoUrls = reservation.photoUrls || [];
      if (files.length > 0) {
        const uploaded = await uploadReservationPhotos(reservation.id, files);
        photoUrls = [...photoUrls, ...uploaded];
      }

      await updateReservation(reservation.id, {
        completed: true,
        completedAt: new Date().toISOString(),
        completedBy: currentUser?.email || currentUser?.uid || '',
        photoUrls,
        reportNote,
      });

      onCompleted();
      onClose();
    } catch (err) {
      setError('報告の保存に失敗しました: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="bg-green-500 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">📷 完了報告</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">{reservation.propertyName || reservation.guestName}</p>
            <p>{reservation.cleaningDate || reservation.checkOut}</p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
          )}

          {reservation.photoUrls && reservation.photoUrls.length > 0 && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">登録済みの写真</label>
              <div className="grid grid-cols-3 gap-2">
                {reservation.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full h-20 object-cover rounded-lg border" />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-2">写真を追加</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="w-full text-sm text-gray-600"
            />
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {previews.map((src, i) => (
                  <img key={i} src={src} alt="" className="w-full h-20 object-cover rounded-lg border" />
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">作業メモ（任意）</label>
            <textarea
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="例：水回りを重点的に清掃しました"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              rows="3"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
              disabled={uploading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
              disabled={uploading}
            >
              {uploading ? 'アップロード中...' : '完了報告を送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
