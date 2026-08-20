import { useState, useEffect } from 'react';
import { onIcalFeedsChange, addIcalFeed, updateIcalFeed, deleteIcalFeed } from '../services/icalFeedService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import { buildPropertyOptions } from '../utils/propertyOptions';

export default function IcalFeedManagement() {
  const [feeds, setFeeds] = useState([]);
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [propertyName, setPropertyName] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubFeeds = onIcalFeedsChange((data) => {
      data.sort((a, b) => (a.propertyName || '').localeCompare(b.propertyName || '', 'ja'));
      setFeeds(data);
    });
    const unsubDirectory = onPropertyDirectoryChange(setPropertyDirectory);
    return () => {
      unsubFeeds();
      unsubDirectory();
    };
  }, []);

  const propertyOptions = buildPropertyOptions(propertyDirectory, feeds.map((f) => f.propertyName));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!propertyName || !url.trim()) {
      setError('物件とURLは必須です');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addIcalFeed({ propertyName, url: url.trim(), label: label.trim() });
      setUrl('');
      setLabel('');
    } catch (err) {
      setError(err.message || '追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (feed) => {
    try {
      await updateIcalFeed(feed.id, { active: !feed.active });
    } catch (err) {
      alert('変更に失敗しました: ' + err.message);
    }
  };

  const handleDelete = async (feed) => {
    if (!window.confirm(`「${feed.propertyName}」のiCal連携（${feed.label || 'URL'}）を削除しますか？`)) return;
    try {
      await deleteIcalFeed(feed.id);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Airbnb・Booking.com等の「カレンダー同期用URL（iCal/.ics）」を登録すると、1時間ごとに自動で予約を取り込み、
        清掃予定を作成します。URLは各サイトの管理画面（例：Airbnbなら「カレンダー」→「エクスポート」→
        「カレンダーの同期」）で発行できます。
      </p>

      <form onSubmit={handleAdd} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">物件 *</label>
            <select
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">選択してください</option>
              {propertyOptions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ラベル（任意）</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例：Airbnb"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">iCal URL（.ics） *</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.airbnb.jp/calendar/ical/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold py-2 px-4 rounded-lg"
        >
          {saving ? '追加中...' : '+ フィードを追加'}
        </button>
      </form>

      <div className="space-y-2">
        {feeds.length === 0 && <p className="text-sm text-gray-500">登録済みのiCal連携はありません</p>}
        {feeds.map((feed) => (
          <div key={feed.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 text-sm">
                {feed.propertyName}
                {feed.label && <span className="text-gray-400 font-normal"> ／ {feed.label}</span>}
              </p>
              <p className="text-xs text-gray-400 truncate max-w-md" title={feed.url}>
                {feed.url}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleToggleActive(feed)}
                className={`text-xs px-2 py-1 rounded-full ${
                  feed.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {feed.active !== false ? '有効' : '無効'}
              </button>
              <button
                onClick={() => handleDelete(feed)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        ※ 60分ごとに自動同期されます。予約サイト側でキャンセルされた予定は、現状は自動削除されません（清掃管理画面から手動で削除してください）。
      </p>
    </div>
  );
}
