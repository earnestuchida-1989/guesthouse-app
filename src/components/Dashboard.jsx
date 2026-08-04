import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import Reservations from './Reservations';
import Schedule from './Schedule';

export default function Dashboard({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('overview');

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ナビゲーションバー */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">ゲストハウス日程管理</h1>
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

      {/* サイドバーとコンテンツ */}
      <div className="flex">
        {/* サイドバー */}
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
              📅 予約管理
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

        {/* メインコンテンツ */}
        <main className="flex-1 p-8">
          {currentPage === 'overview' && (
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-6">📊 ダッシュボード</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">今月の予約</h3>
                  <p className="text-4xl font-bold text-blue-500">12</p>
                  <p className="text-sm text-gray-500 mt-2">件</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">今週の清掃</h3>
                  <p className="text-4xl font-bold text-green-500">8</p>
                  <p className="text-sm text-gray-500 mt-2">件</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">稼働率</h3>
                  <p className="text-4xl font-bold text-purple-500">85%</p>
                  <p className="text-sm text-gray-500 mt-2">平均</p>
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
