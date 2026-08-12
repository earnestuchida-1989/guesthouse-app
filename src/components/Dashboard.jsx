import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { onReservationsChange } from '../services/reservationService';
import { PROPERTY_PRICES, COST_RATIO } from '../data/propertyPrices';
import Reservations from './Reservations';
import Schedule from './Schedule';

export default function Dashboard({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('overview');
  const [reservations, setReservations] = useState([]);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const unsubscribe = onReservationsChange((data) => {
      setReservations(data);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
  };

  const calculateMonthlyStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalRevenue = 0;
    let totalCost = 0;
    let completedCount = 0;

    reservations.forEach(res => {
      try {
        const resDate = new Date(res.cleaningDate || res.checkOut);
        if (resDate.getMonth() === currentMonth && resDate.getFullYear() === currentYear && res.status === 'confirmed') {
          const price = PROPERTY_PRICES[res.propertyName || res.guestName] || 5000;
          totalRevenue += price;
          totalCost += price * COST_RATIO;
          completedCount += 1;
        }
      } catch (e) {
        console.error('日付解析エラー:', e);
      }
    });

    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;

    return { totalRevenue, totalCost, profit, profitMargin, completedCount };
  };

  const stats = calculateMonthlyStats();

  const todayStr = new Date().toISOString().slice(0, 10);
  const activeReservations = reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_cleaning_needed');
  const todayTasks = activeReservations
    .filter(r => (r.cleaningDate || r.checkOut) === todayStr)
    .sort((a, b) => (b.hasCheckIn ? 1 : 0) - (a.hasCheckIn ? 1 : 0));
  const cancelledCount = reservations.filter(r => r.status === 'cancelled').length;
  const noCleaningNeededCount = reservations.filter(r => r.status === 'no_cleaning_needed').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">ゲストハウス日程管理</h1>
            <p className="text-xs text-gray-500 mt-1">{isAdmin ? '🔐 管理者' : '👤 スタッフ'}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email || 'Guest'}</span>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>

      <div className="flex">
        <aside className="w-64 bg-white shadow-md min-h-screen p-6">
          <nav className="space-y-4">
            <button
              onClick={() => setCurrentPage('overview')}
              className={`w-full text-left px-4 py-2 rounded-lg transition ${
                currentPage === 'overview'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              📊 概要
            </button>
            <button
              onClick={() => setCurrentPage('reservations')}
              className={`w-full text-left px-4 py-2 rounded-lg transition ${
                currentPage === 'reservations'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              📅 清掃管理
            </button>
            <button
              onClick={() => setCurrentPage('schedule')}
              className={`w-full text-left px-4 py-2 rounded-lg transition ${
                currentPage === 'schedule'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              🗓️ スケジュール
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-8">
          {currentPage === 'overview' && (
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-6">📊 ダッシュボード</h2>

              {/* 本日の清掃予定（全員に表示、チェックインありは強調） */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <h3 className="text-lg font-bold text-gray-800 mb-3">📅 本日の清掃予定（{todayStr}）</h3>
                {todayTasks.length === 0 ? (
                  <p className="text-gray-500">本日の清掃予定はありません</p>
                ) : (
                  <ul className="space-y-2">
                    {todayTasks.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                          r.hasCheckIn ? 'bg-orange-50' : 'bg-gray-50'
                        }`}
                      >
                        <div>
                          <span className="font-semibold text-gray-800">{r.propertyName || r.guestName}</span>
                          <span className="text-sm text-gray-500 ml-3">{r.persons ? `${r.persons}名` : ''}</span>
                          {r.notes && <span className="text-xs text-gray-400 ml-3">{r.notes}</span>}
                        </div>
                        {r.hasCheckIn && (
                          <span className="text-xs font-bold bg-orange-500 text-white px-2 py-1 rounded-full">
                            🔴 イン{r.checkInTime ? ` ${r.checkInTime}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 管理者のみが見れるセクション */}
              {isAdmin && (
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 p-4 rounded mb-4">
                    <p className="text-sm text-blue-700 font-semibold">🔐 管理者向け</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">月間売上</h3>
                      <p className="text-4xl font-bold text-blue-500">¥{stats.totalRevenue.toLocaleString()}</p>
                      <p className="text-sm text-gray-500 mt-2">確定済み清掃: {stats.completedCount}件</p>
                    </div>

                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">月間利益</h3>
                      <p className="text-4xl font-bold text-green-500">¥{stats.profit.toLocaleString()}</p>
                      <p className="text-sm text-gray-500 mt-2">利益率: {stats.profitMargin}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 全員が見れるセクション */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">清掃件数</h3>
                  <p className="text-3xl font-bold text-blue-500">{reservations.filter(r => r.status === 'confirmed').length}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">待機中</h3>
                  <p className="text-3xl font-bold text-yellow-500">{reservations.filter(r => r.status === 'pending').length}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">総件数</h3>
                  <p className="text-3xl font-bold text-green-500">{activeReservations.length}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">清掃不要</h3>
                  <p className="text-3xl font-bold text-purple-400">{noCleaningNeededCount}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">キャンセル</h3>
                  <p className="text-3xl font-bold text-gray-400">{cancelledCount}</p>
                </div>
              </div>
            </div>
          )}

          {currentPage === 'reservations' && <Reservations />}

          {currentPage === 'schedule' && <Schedule />}
        </main>
      </div>
    </div>
  );
}
