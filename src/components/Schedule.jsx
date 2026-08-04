import { useState } from 'react';

export default function Schedule() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 7)); // 8月

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const days = [];
  const totalDays = daysInMonth(currentMonth);
  const startingDayOfWeek = firstDayOfMonth(currentMonth);

  // 空き日を追加
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  // 月の日付を追加
  for (let i = 1; i <= totalDays; i++) {
    days.push(i);
  }

  // サンプル予約データ
  const bookedDates = [5, 6, 7, 8, 9, 10, 12];

  const monthYear = currentMonth.toLocaleString('ja-JP', { year: 'numeric', month: 'long' });

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">🗓️ スケジュール</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* カレンダー */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-800">{monthYear}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded transition"
              >
                ◀
              </button>
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
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
            {days.map((day, index) => (
              <div
                key={index}
                className={`aspect-square flex items-center justify-center rounded-lg border-2 ${
                  day === null
                    ? 'bg-gray-50'
                    : bookedDates.includes(day)
                    ? 'bg-blue-500 text-white font-bold border-blue-600 cursor-pointer hover:bg-blue-600'
                    : 'bg-white text-gray-800 font-semibold border-gray-200 cursor-pointer hover:border-gray-400'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600">
              <span className="inline-block w-4 h-4 bg-blue-500 rounded mr-2"></span>
              <span>予約済み</span>
            </p>
          </div>
        </div>

        {/* 右側：予約状況 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">この月の予約</h3>
          <div className="space-y-3">
            <div className="pb-3 border-b">
              <p className="text-sm text-gray-600">8月5日～8日</p>
              <p className="font-semibold text-gray-800">田中太郎</p>
              <p className="text-xs text-gray-500">101号室・2名</p>
            </div>
            <div className="pb-3 border-b">
              <p className="text-sm text-gray-600">8月6日～10日</p>
              <p className="font-semibold text-gray-800">鈴木花子</p>
              <p className="text-xs text-gray-500">202号室・4名</p>
            </div>
            <div className="pb-3">
              <p className="text-sm text-gray-600">8月9日～12日</p>
              <p className="font-semibold text-gray-800">佐藤次郎</p>
              <p className="text-xs text-gray-500">103号室・1名</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t space-y-2">
            <div>
              <p className="text-sm text-gray-600">稼働日数</p>
              <p className="text-2xl font-bold text-green-500">8日</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">空き日数</p>
              <p className="text-2xl font-bold text-orange-500">22日</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
