import { useState, useEffect } from 'react';
import { onReservationsChange, deleteReservation, setComplaintFlag } from '../services/reservationService';
import { onPropertyDirectoryChange } from '../services/propertyDirectoryService';
import AddReservationModal from './AddReservationModal';
import EditReservationModal from './EditReservationModal';
import CompletionReportModal from './CompletionReportModal';
import LineNoteImport from './LineNoteImport';
import { applyLinenCheck } from '../services/linenService';

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 混雑度（その日の清掃件数）に応じたグラデーション。件数が多いほど濃い青になり、
// 「忙しい日」が一目で分かるようにする。
function heatColor(count) {
  if (count === 0) return 'bg-white text-gray-800 font-semibold border-gray-200 hover:border-gray-400';
  if (count === 1) return 'bg-blue-100 text-blue-900 font-semibold border-blue-200 hover:bg-blue-200';
  if (count === 2) return 'bg-blue-300 text-blue-900 font-bold border-blue-400 hover:bg-blue-400';
  if (count === 3) return 'bg-blue-500 text-white font-bold border-blue-600 hover:bg-blue-600';
  if (count === 4) return 'bg-blue-700 text-white font-bold border-blue-800 hover:bg-blue-800';
  return 'bg-blue-950 text-white font-bold border-black hover:bg-black';
}

export default function Reservations({
  allowedProperties = null,
  readOnly = false,
  canReport = true,
  currentUser = null,
  isAdmin = false,
  vendors = [],
  propertyAssignments = {},
}) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLineNoteModal, setShowLineNoteModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [propertyDirectory, setPropertyDirectory] = useState({});
  const [customerFilter, setCustomerFilter] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'calendar'
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });
  const [selectedDate, setSelectedDate] = useState(null);

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

  const getVendorId = (res) => propertyAssignments[res.propertyName || res.guestName] || null;

  // リネン管理を使っている物件かどうか、在庫が最低枚数を下回っていないか
  const getLinenInfo = (res) => {
    const name = res.propertyName || res.guestName;
    const linenTracking = propertyDirectory[name]?.linenTracking;
    if (!linenTracking || !linenTracking.enabled) return null;
    const lowStockItems = linenTracking.storesOnSite
      ? (linenTracking.items || []).filter(
          (it) => typeof it.currentStock === 'number' && it.currentStock < (it.minQuantity || 0)
        )
      : [];
    return { ...linenTracking, lowStockItems };
  };

  const handleLinenToggle = async (res) => {
    try {
      await applyLinenCheck(res.id, !res.linenChecked);
    } catch (err) {
      alert('リネンチェックの更新に失敗しました: ' + err.message);
    }
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
    .filter((res) => {
      if (!vendorFilter) return true;
      const vid = getVendorId(res);
      return vendorFilter === 'direct' ? !vid : vid === vendorFilter;
    })
    .sort((a, b) => {
      const dateA = a.cleaningDate || a.checkOut || '';
      const dateB = b.cleaningDate || b.checkOut || '';
      return dateA.localeCompare(dateB);
    });

  const hasActiveFilters = customerFilter || propertySearch || dateFrom || dateTo || vendorFilter;
  const clearFilters = () => {
    setCustomerFilter('');
    setPropertySearch('');
    setDateFrom('');
    setDateTo('');
    setVendorFilter('');
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

  // --- カレンダー表示用（絞り込み後のsortedReservationsをそのまま使う） ---
  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const calDays = [];
  const totalDays = daysInMonth(currentMonth);
  const startingDayOfWeek = firstDayOfMonth(currentMonth);
  for (let i = 0; i < startingDayOfWeek; i++) calDays.push(null);
  for (let i = 1; i <= totalDays; i++) calDays.push(i);

  const calActiveReservations = sortedReservations.filter((r) => r.status !== 'cancelled');
  const monthReservations = calActiveReservations.filter((r) => {
    const d = r.cleaningDate || r.checkOut;
    return d && d.startsWith(`${calYear}-${String(calMonth + 1).padStart(2, '0')}`);
  });
  const reservationsByDate = {};
  monthReservations.forEach((r) => {
    const d = r.cleaningDate || r.checkOut;
    if (!reservationsByDate[d]) reservationsByDate[d] = [];
    reservationsByDate[d].push(r);
  });
  const bookedDaySet = new Set(Object.keys(reservationsByDate).map((d) => parseInt(d.split('-')[2], 10)));
  const checkInDaySet = new Set(
    Object.entries(reservationsByDate)
      .filter(([, list]) => list.some((r) => r.hasCheckIn))
      .map(([d]) => parseInt(d.split('-')[2], 10))
  );
  const calWorkDays = bookedDaySet.size;
  const calFreeDays = totalDays - calWorkDays;
  const calMonthYear = currentMonth.toLocaleString('ja-JP', { year: 'numeric', month: 'long' });
  const calSelectedList = selectedDate ? reservationsByDate[selectedDate] || [] : monthReservations;
  const calListTitle = selectedDate
    ? `${parseInt(selectedDate.split('-')[2], 10)}日の清掃予定`
    : 'この月の清掃予定';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">清掃スケジュール管理</h1>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm flex-shrink-0">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 font-semibold transition ${
                view === 'list' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              📋 リスト
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 font-semibold transition ${
                view === 'calendar' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              🗓️ カレンダー
            </button>
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowLineNoteModal(true)}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
              >
                📝 LINEノート取り込み
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition whitespace-nowrap"
            >
              + 新規予定追加
            </button>
          </div>
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
          {isAdmin && vendors.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">担当業者</label>
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                <option value="direct">🏠 直営</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
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
      ) : view === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* カレンダー */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">{calMonthYear}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentMonth(new Date(calYear, calMonth - 1));
                    setSelectedDate(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded transition"
                >
                  ◀
                </button>
                <button
                  onClick={() => {
                    setCurrentMonth(new Date(calYear, calMonth + 1));
                    setSelectedDate(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded transition"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-4">
              {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                <div key={day} className="text-center font-bold text-gray-600 py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calDays.map((day, index) => {
                if (day === null) {
                  return <div key={index} className="aspect-square bg-gray-50 rounded-lg" />;
                }
                const dateStr = toDateStr(calYear, calMonth, day);
                const isBooked = bookedDaySet.has(day);
                const hasCheckIn = checkInDaySet.has(day);
                const isSelected = selectedDate === dateStr;
                const count = isBooked ? reservationsByDate[dateStr].length : 0;
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`relative aspect-square flex flex-col items-center justify-center rounded-lg border-2 transition ${
                      isSelected ? 'ring-2 ring-offset-1 ring-gray-800' : ''
                    } ${heatColor(count)}`}
                  >
                    {hasCheckIn && (
                      <span
                        className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-1 ring-white"
                        title="チェックインあり（要優先対応）"
                      />
                    )}
                    <span>{day}</span>
                    {isBooked && <span className="text-[10px] leading-none mt-0.5">{count}件</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t flex flex-wrap items-center gap-4">
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <span>混雑度:</span>
                <span className="inline-block w-4 h-4 bg-white border border-gray-300 rounded"></span>
                <span className="inline-block w-4 h-4 bg-blue-100 rounded"></span>
                <span className="inline-block w-4 h-4 bg-blue-300 rounded"></span>
                <span className="inline-block w-4 h-4 bg-blue-500 rounded"></span>
                <span className="inline-block w-4 h-4 bg-blue-700 rounded"></span>
                <span className="inline-block w-4 h-4 bg-blue-950 rounded"></span>
                <span>少ない→多い</span>
              </p>
              <p className="text-sm text-gray-600 flex items-center">
                <span className="inline-block w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                <span>チェックインあり（要優先対応）</span>
              </p>
            </div>
          </div>

          {/* 右側：予約状況（編集・削除等は「📋 リスト」表示に切り替えて操作） */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{calListTitle}</h3>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-600 hover:underline">
                  月全体を表示
                </button>
              )}
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {calSelectedList.length === 0 && <p className="text-sm text-gray-500">清掃予定はありません</p>}
              {calSelectedList.map((r) => (
                <div key={r.id} className={`pb-3 border-b last:border-b-0 ${r.hasCheckIn ? 'bg-orange-50 -mx-2 px-2 rounded' : ''}`}>
                  <p className="text-sm text-gray-600">
                    {r.cleaningDate || r.checkOut}
                    {r.hasCheckIn && (
                      <span className="ml-2 text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">
                        🔴 イン{r.checkInTime ? ` ${r.checkInTime}` : ''}
                      </span>
                    )}
                  </p>
                  <p className="font-semibold text-gray-800">
                    {r.propertyName || r.guestName}
                    {getCustomerName(r) && (
                      <span className="ml-1 font-normal text-xs text-gray-500">（{getCustomerName(r)}）</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.persons ? `${r.persons}名` : '人数未定'}
                    {r.status === 'no_cleaning_needed' ? '・清掃不要' : ''}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t space-y-2">
              <div>
                <p className="text-sm text-gray-600">稼働日数</p>
                <p className="text-2xl font-bold text-green-500">{calWorkDays}日</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">空き日数</p>
                <p className="text-2xl font-bold text-orange-500">{calFreeDays}日</p>
              </div>
            </div>
          </div>
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

              {getLinenInfo(res) && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!res.linenChecked}
                    onChange={() => handleLinenToggle(res)}
                    className="w-4 h-4"
                  />
                  <span className={res.linenChecked ? 'text-green-700 font-semibold' : 'text-gray-600'}>
                    🧺 リネン準備OK
                  </span>
                  {getLinenInfo(res).lowStockItems.length > 0 && (
                    <span className="text-xs font-bold text-red-600">
                      ⚠️ 在庫不足: {getLinenInfo(res).lowStockItems.map((it) => it.name).join('・')}
                    </span>
                  )}
                </label>
              )}

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
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700">🧺 リネン</th>
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
                    {getLinenInfo(res) ? (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!res.linenChecked}
                          onChange={() => handleLinenToggle(res)}
                          className="w-4 h-4"
                        />
                        {getLinenInfo(res).lowStockItems.length > 0 && (
                          <span
                            className="text-xs font-bold text-red-600"
                            title={`在庫不足: ${getLinenInfo(res).lowStockItems.map((it) => it.name).join('・')}`}
                          >
                            ⚠️
                          </span>
                        )}
                      </label>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
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

      {showLineNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">LINEノート取り込み</h3>
              <button
                onClick={() => setShowLineNoteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <LineNoteImport />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
