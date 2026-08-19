import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const functions = getFunctions(undefined, 'asia-northeast1');

const STATUS_LABEL = {
  confirmed: '確定',
  cancelled: 'キャンセル',
  no_cleaning_needed: '清掃不要',
};

export default function LineNoteImport() {
  const [configs, setConfigs] = useState([]);
  const [configId, setConfigId] = useState('');
  const [text, setText] = useState('');
  const [previewEntries, setPreviewEntries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committedCount, setCommittedCount] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lineConfigs'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
      setConfigs(list);
      if (!configId && list.length > 0) {
        setConfigId(list[0].id);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetResult = () => {
    setPreviewEntries(null);
    setCommittedCount(null);
    setError('');
  };

  const handlePreview = async () => {
    if (!configId || !text.trim()) return;
    setLoading(true);
    resetResult();
    try {
      const fn = httpsCallable(functions, 'parseLineNoteText');
      const res = await fn({ configId, text, commit: false });
      setPreviewEntries(res.data.entries || []);
    } catch (err) {
      setError(err.message || '解析に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!configId || !text.trim()) return;
    if (!window.confirm(`${previewEntries.length}件の予定を清掃予定として登録します。よろしいですか？`)) return;
    setCommitting(true);
    setError('');
    try {
      const fn = httpsCallable(functions, 'parseLineNoteText');
      const res = await fn({ configId, text, commit: true });
      setCommittedCount(res.data.count || 0);
      setPreviewEntries(res.data.entries || []);
    } catch (err) {
      setError(err.message || '登録に失敗しました');
    } finally {
      setCommitting(false);
    }
  };

  const handleClear = () => {
    setText('');
    resetResult();
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-2">📝 LINEノート取り込み</h2>
      <p className="text-sm text-gray-500 mb-6">
        LINEの「ノート」機能はWebhookで自動取得できないため、内容をコピーしてここに貼り付けてください。
        通常のLINEメッセージ取り込みと同じ形式で解析し、内容を確認してから登録します。
      </p>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">取込み先（物件エイリアス設定）</label>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 w-full sm:w-96"
            value={configId}
            onChange={(e) => {
              setConfigId(e.target.value);
              resetResult();
            }}
          >
            {configs.length === 0 && <option value="">設定がありません</option>}
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName || c.id}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            クライアントごとの物件名の書き方（エイリアス）は「LINE連携設定」側で管理しています。
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">ノートの内容を貼り付け</label>
          <textarea
            className="border border-gray-300 rounded-md px-3 py-2 w-full h-48 font-mono text-sm"
            placeholder={'例）\n二条城友9月のスケジュールです。\n9日水インなしイン11名\n21日月インありイン9名'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              resetResult();
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            onClick={handlePreview}
            disabled={loading || !configId || !text.trim()}
          >
            {loading ? '解析中...' : '① 解析してプレビュー'}
          </button>
          <button className="text-gray-500 px-4 py-2 rounded-md text-sm hover:bg-gray-100" onClick={handleClear}>
            クリア
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      {previewEntries && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h3 className="text-lg font-bold text-gray-800">
              解析結果（{previewEntries.length}件）
              {committedCount !== null && <span className="text-green-600 text-sm ml-2">✅ {committedCount}件登録しました</span>}
            </h3>
            {committedCount === null && previewEntries.length > 0 && (
              <button
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                onClick={handleCommit}
                disabled={committing}
              >
                {committing ? '登録中...' : '② この内容で清掃予定に登録'}
              </button>
            )}
          </div>

          {previewEntries.length === 0 ? (
            <p className="text-sm text-gray-500">
              解析できる予定が見つかりませんでした。物件名の書き方が「LINE連携設定」のエイリアスと一致しているか確認してください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">物件名</th>
                    <th className="py-2 pr-4">清掃日</th>
                    <th className="py-2 pr-4">イン</th>
                    <th className="py-2 pr-4">人数</th>
                    <th className="py-2 pr-4">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {previewEntries.map((entry, idx) => {
                    const notesText = entry.notes || '';
                    const status = notesText.includes('キャンセル')
                      ? 'cancelled'
                      : notesText.includes('清掃不要')
                        ? 'no_cleaning_needed'
                        : 'confirmed';
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-gray-800">{entry.propertyName}</td>
                        <td className="py-2 pr-4">{entry.cleaningDate}</td>
                        <td className="py-2 pr-4">
                          {entry.hasCheckIn ? (
                            <span className="text-orange-600">あり</span>
                          ) : (
                            <span className="text-gray-400">なし</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{entry.persons ?? '未定'}</td>
                        <td className="py-2 pr-4 text-gray-500">
                          {notesText}
                          {status !== 'confirmed' && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {STATUS_LABEL[status]}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
