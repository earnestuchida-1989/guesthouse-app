import { useState, useEffect } from 'react';
import { updateReservation } from '../services/reservationService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import { buildPropertyOptions } from '../utils/propertyOptions';

export default function EditReservationModal({ reservation, onClose, onReservationUpdated }) {
  const [formData, setFormData] = useState({
    propertyName: reservation.propertyName || reservation.guestName || '',
    cleaningDate: reservation.cleaningDate || reservation.checkOut || '',
    persons: reservation.persons || 1,
    notes: reservation.notes || '',
    status: reservation.status || 'confirmed',
    hasCheckIn: reservation.hasCheckIn || false,
    checkInTime: reservation.checkInTime || ''
  });
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onPropertyDirectoryChange(setPropertyDirectory), []);

  // 現在この予約に設定されている物件名は、マスタ未登録・無効化されていても
  // 選択肢から消えないようにする（気づかず別物件に変わってしまう事故を防ぐ）
  const propertyOptions = buildPropertyOptions(propertyDirectory, [formData.propertyName]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'persons' ? parseInt(value) : value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await updateReservation(reservation.id, formData);
      alert('清掃予定を更新しました！');
      onReservationUpdated();
      onClose();
    } catch (err) {
      setError('更新に失敗しました: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="bg-blue-500 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">清掃予定を編集</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-2">物件名 *</label>
            <select
              name="propertyName"
              value={formData.propertyName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">選択してください</option>
              {propertyOptions.map(opt => (
                <option key={opt.name} value={opt.name}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">清掃日 *</label>
            <input
              type="date"
              name="cleaningDate"
              value={formData.cleaningDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">人数 *</label>
            <input
              type="number"
              name="persons"
              value={formData.persons}
              onChange={handleChange}
              min="1"
              max="10"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="hasCheckIn"
                checked={formData.hasCheckIn}
                onChange={handleChange}
                className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500"
              />
              <span className="font-semibold text-orange-800">
                ⚠️ 同日にゲストのチェックインがある
              </span>
            </label>
            <p className="text-sm text-orange-700">
              チェックがある場合、ゲストの入室時刻までに清掃を完了させる必要があります
            </p>

            {formData.hasCheckIn && (
              <div>
                <label className="block text-gray-700 font-semibold mb-2 text-sm">
                  チェックイン予定時刻
                </label>
                <input
                  type="time"
                  name="checkInTime"
                  value={formData.checkInTime}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">要望・備考</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="例：フローリング床、ベッドメイキング必要"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">ステータス</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="confirmed">確定</option>
              <option value="pending">待機中</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
              disabled={loading}
            >
              {loading ? '更新中...' : '更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
