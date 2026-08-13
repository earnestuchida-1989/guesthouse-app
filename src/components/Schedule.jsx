import { useState, useEffect } from 'react';
import { onReservationsChange } from '../services/reservationService';

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function Schedule({ allowedProperties = null }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    const unsubscribe = onReservationsChange((data) => {
      const filtered = allowedProperties
        ? data.filter((r) => allowedProperties.includes(r.propertyName || r.guestName))
        : data;
      setReservations(filtered);
      setLoading(false);
    });
    return unsubscribe;
  }, [allowedProperties]);

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const days = [];
  const totalDays = daysInMonth(currentMonth);
  const startingDayOfWeek = firstDayOfMonth(currentMonth);
  for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(i);

  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');

  // この月に該当する予約（清掃日基準）
  const monthReservations = activeReservations
    .filter((r) => {
      const d = r.cleaningDate || r.checkOut;
      if (!d) return false;
      return d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);
    })
    .sort((a, b) => (a.cleaningDate || a.checkOut).localeCompare(b.cleaningDate || b.checkOut));

  // 日付ごとの予約マップ
  const reservationsByDate = {};
  monthReservations.forEach((r) => {
    const d = r.cleaningDate || r.checkOut;
    if (!reservationsByDate[d]) reservationsByDate[d] = [];
    reservationsByDate[d].push(r);
  });

  const bookedDaySet = new Set(
    Object.keys(reservationsByDate).map((d) => parseInt(d.split('-')[2], 10))
  );
  const checkInDaySet = new Set(
    Object.entries(reservationsByDate)
      .filter(([, list]) => list.some((r) => r.hasCheckIn))
      .map(([d]) => parseInt(d.split('-')[2], 10))
  );

  const workDays = bookedDaySet.size;
  const freeDays = totalDays - workDays;

  const monthYear = currentMonth.toLocaleString('ja-JP', { year: 'numeric', month: 'long' });

  const selectedList = selectedDate ? reservationsByDate[selectedDate] || [] : monthReservations;
  const listTitle = selectedDate
    ? `${parseInt(selectedDate.split('-')[2], 10)}日の清掃予定`
    : 'この月の清掃予定';

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">🗓️ スケジュール</h2>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">データ読み込み中...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* カレンダー */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">{monthYear}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentMonth(new Date(year, month - 1));
                    setSelectedDate(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded transition"
                >
                  ◀
                </button>
                <button
                  onClick={() => {
                    setCurrentMonth(new Date(year, month + 1));
                    setSelectedDate(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded transition"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                <div key={day} className="text-center font-bold text-gray-600 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* カレンダーグリッド */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={index} className="aspect-square bg-gray-50 rounded-lg" />;
                }
                const dateStr = toDateStr(year, month, day);
                const isBooked = bookedDaySet.has(day);
                const hasCheckIn = checkInDaySet.has(day);
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg border-2 transition ${
                      isSelected
                        ? 'ring-2 ring-offset-1 ring-gray-800'
                        : ''
                    } ${
                      hasCheckIn
                        ? 'bg-orange-500 text-white font-bold border-orange-600 hover:bg-orange-600'
                        : isBooked
                        ? 'bg-blue-500 text-white font-bold border-blue-600 hover:bg-blue-600'
                        : 'bg-white text-gray-800 font-semibold border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span>{day}</span>
                    {isBooked && (
                      <span className="text-[10px] leading-none mt-0.5">
                        {reservationsByDate[dateStr].length}件
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t flex flex-wrap gap-4">
              <p className="text-sm text-gray-600 flex items-center">
                <span className="inline-block w-4 h-4 bg-blue-500 rounded mr-2"></span>
                <span>清掃予定あり</span>
              </p>
              <p className="text-sm text-gray-600 flex items-center">
                <span className="inline-block w-4 h-4 bg-orange-500 rounded mr-2"></span>
                <span>チェックインあり（要優先対応）</span>
              </p>
            </div>
          </div>

          {/* 右側：予約状況 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{listTitle}</h3>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  月全体を表示
                </button>
              )}
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {selectedList.length === 0 && (
                <p className="text-sm text-gray-500">清掃予定はありません</p>
              )}
              {selectedList.map((r) => (
                <div key={r.id} className={`pb-3 border-b last:border-b-0 ${r.hasCheckIn ? 'bg-orange-50 -mx-2 px-2 rounded' : ''}`}>
                  <p className="text-sm text-gray-600">
                    {r.cleaningDate || r.checkOut}
                    {r.hasCheckIn && (
                      <span className="ml-2 text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">
                        🔴 イン{r.checkInTime ? ` ${r.checkInTime}` : ''}
                      </span>
                    )}
                  </p>
                  <p className="font-semibold text-gray-800">{r.propertyName || r.guestName}</p>
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
                <p className="text-2xl font-bold text-green-500">{workDays}日</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">空き日数</p>
                <p className="text-2xl font-bold text-orange-500">{freeDays}日</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
