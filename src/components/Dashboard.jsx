import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { onReservationsChange } from '../services/reservationService';
import { onPropertyAssignmentsChange, onVendorsChange } from '../services/vendorService';
import { onPropertiesChange } from '../services/propertyService';
import { PROPERTY_PRICES, COST_RATIO } from '../data/propertyPrices';
import Reservations from './Reservations';
import Schedule from './Schedule';
import AccountManagement from './AccountManagement';
import VendorManagement from './VendorManagement';
import CustomerReports from './CustomerReports';
import MasterDataManagement from './MasterDataManagement';

const NAV_ITEMS = [
  { key: 'overview', label: '📊 概要' },
  { key: 'reservations', label: '📅 清掃管理' },
  { key: 'schedule', label: '🗓️ スケジュール' },
  { key: 'accounts', label: '👥 アカウント管理', adminOnly: true },
  { key: 'vendors', label: '🏢 協力業者管理', adminOnly: true },
  { key: 'masterdata', label: '📇 マスタデータ管理', adminOnly: true },
];

export default function Dashboard({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [allReservations, setAllReservations] = useState([]);
  const [propertyAssignments, setPropertyAssignments] = useState({});
  const [propertyMaster, setPropertyMaster] = useState({});
  const [vendors, setVendors] = useState([]);
  const isAdmin = user?.role === 'admin';
  const isContractor = user?.role === 'contractor';
  const isCustomer = user?.role === 'customer';

  useEffect(() => {
    const unsubscribe = onReservationsChange((data) => {
      setAllReservations(data);
    });
    const unsubAssignments = onPropertyAssignmentsChange((map) => {
      setPropertyAssignments(map);
    });
    // 物件マスタ（properties）・協力業者マスタ（vendors）はFirestoreルール上、管理者のみ読み取り可能。
    // 管理者以外が購読すると permission-denied になるだけなので、管理者の時だけ購読する。
    const unsubProperties = isAdmin
      ? onPropertiesChange((map) => setPropertyMaster(map))
      : null;
    const unsubVendors = isAdmin ? onVendorsChange((data) => setVendors(data)) : null;
    return () => {
      unsubscribe();
      unsubAssignments();
      if (unsubProperties) unsubProperties();
      if (unsubVendors) unsubVendors();
    };
  }, [isAdmin]);

  // 料金はFirestoreの物件マスタ（properties）を優先し、未登録の物件は
  // 従来の静的データ（src/data/propertyPrices.js）にフォールバックする
  const getPropertyPrice = (propertyName) => {
    const master = propertyMaster[propertyName];
    if (master && typeof master.cleaningPrice === 'number') {
      return master.cleaningPrice;
    }
    return PROPERTY_PRICES[propertyName] || 5000;
  };

  // 委託金額（協力業者への実際の支払額）が物件マスタに登録されていればそれを使う。
  // 未登録の物件は、従来通り請求額に一律のコスト率をかけた概算値にフォールバックする。
  const getPropertyCost = (propertyName, price) => {
    const master = propertyMaster[propertyName];
    if (master && typeof master.outsourceAmount === 'number') {
      return master.outsourceAmount;
    }
    return price * COST_RATIO;
  };

  // 協力業者アカウントは、自社が担当する物件のみに絞り込む
  const allowedProperties = isContractor
    ? Object.entries(propertyAssignments)
        .filter(([, vendorId]) => vendorId === user.vendorId)
        .map(([propertyName]) => propertyName)
    : null;

  const reservations = allowedProperties
    ? allReservations.filter((r) => allowedProperties.includes(r.propertyName || r.guestName))
    : allReservations;

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
  };

  // 更新があれば main.jsx 側の onNeedRefresh が自動でリロードする。
  // 何も起きなければ「最新版です」の表示に戻すだけ。
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      await window.__checkForAppUpdate?.();
    } finally {
      setTimeout(() => setCheckingUpdate(false), 2500);
    }
  };

  const updateCheckButton = (
    <button
      onClick={handleCheckUpdate}
      disabled={checkingUpdate}
      className="text-gray-500 hover:text-gray-800 disabled:opacity-50 p-2 -mr-1"
      title="最新版を確認"
      aria-label="最新版を確認"
    >
      <span className={checkingUpdate ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
    </button>
  );

  // 顧客アカウントは専用の簡易レイアウト（清掃報告の閲覧・フィードバックのみ）を表示する
  if (isCustomer) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-md">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">ゲストハウス清掃報告</h1>
              <p className="text-xs text-gray-500 mt-1">🧑‍💼 顧客</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user?.email || 'Guest'}</span>
              {updateCheckButton}
              <button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition"
              >
                ログアウト
              </button>
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto p-6">
          <CustomerReports user={user} />
        </main>
      </div>
    );
  }

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
          const propertyName = res.propertyName || res.guestName;
          const price = getPropertyPrice(propertyName);
          totalRevenue += price;
          totalCost += getPropertyCost(propertyName, price);
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

  // 業者別・直営別の実績（今月分）。「どの業者/直営がどれだけ清掃を担当し、
  // クレームが何件あったか」をデータ分析に使えるようにする。
  // 担当は propertyAssignments（物件→vendorId）を見て判定し、割り当てが無い物件は「直営」扱いにする。
  const calculateVendorBreakdown = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const buckets = {};

    const getBucket = (vendorId) => {
      const key = vendorId || 'direct';
      if (!buckets[key]) {
        const vendor = vendorId ? vendors.find((v) => v.id === vendorId) : null;
        buckets[key] = {
          key,
          label: vendor ? vendor.name : '🏠 直営',
          color: vendor ? vendor.color : '#64748B',
          count: 0,
          complaintCount: 0,
        };
      }
      return buckets[key];
    };

    reservations.forEach((res) => {
      if (res.status === 'cancelled') return;
      let resDate;
      try {
        resDate = new Date(res.cleaningDate || res.checkOut);
        if (resDate.getMonth() !== currentMonth || resDate.getFullYear() !== currentYear) return;
      } catch (e) {
        return;
      }
      const propertyName = res.propertyName || res.guestName;
      const vendorId = propertyAssignments[propertyName] || null;
      const bucket = getBucket(vendorId);
      bucket.count += 1;
      if (res.isComplaint) bucket.complaintCount += 1;
    });

    return Object.values(buckets).sort((a, b) => b.count - a.count);
  };

  const vendorBreakdown = isAdmin ? calculateVendorBreakdown() : [];

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const renderNavButton = (item, closeOnClick) => (
    <button
      key={item.key}
      onClick={() => {
        setCurrentPage(item.key);
        if (closeOnClick) setMobileMenuOpen(false);
      }}
      className={`w-full text-left px-4 py-2 rounded-lg transition ${
        currentPage === item.key
          ? 'bg-blue-500 text-white'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {item.label}
    </button>
  );

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
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden shrink-0 text-gray-600 hover:text-gray-900 p-1 -ml-1"
              aria-label="メニューを開く"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">ゲストハウス日程管理</h1>
              <p className="text-xs text-gray-500 mt-1">
                {isAdmin ? '🔐 管理者' : isContractor ? '🏢 協力業者' : '👤 スタッフ'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:inline text-sm text-gray-600">{user?.email || 'Guest'}</span>
            {updateCheckButton}
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 sm:px-4 rounded-lg transition text-sm sm:text-base"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* モバイル用ドロワーメニュー */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="fixed inset-0 bg-black/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 w-64 max-w-[80vw] bg-white shadow-lg p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-gray-800">メニュー</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-500 hover:text-gray-800 p-1"
                  aria-label="メニューを閉じる"
                >
                  ✕
                </button>
              </div>
              <nav className="space-y-4">
                {visibleNavItems.map((item) => renderNavButton(item, true))}
              </nav>
            </aside>
          </div>
        )}

        {/* デスクトップ用サイドバー */}
        <aside className="hidden md:block w-64 bg-white shadow-md min-h-screen p-6">
          <nav className="space-y-4">
            {visibleNavItems.map((item) => renderNavButton(item, false))}
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
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

                  {/* 業者別・直営別の実績（今月） */}
                  <div className="bg-white rounded-lg shadow-md p-6 mt-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">🏢 業者別・直営別 実績（今月）</h3>
                    {vendorBreakdown.length === 0 ? (
                      <p className="text-sm text-gray-500">今月の清掃予定がありません</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px]">
                          <thead className="border-b-2 border-gray-200">
                            <tr>
                              <th className="py-2 text-left text-sm font-semibold text-gray-700">担当</th>
                              <th className="py-2 text-right text-sm font-semibold text-gray-700">清掃件数</th>
                              <th className="py-2 text-right text-sm font-semibold text-gray-700">クレーム件数</th>
                              <th className="py-2 text-right text-sm font-semibold text-gray-700">クレーム率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendorBreakdown.map((b) => (
                              <tr key={b.key} className="border-b border-gray-100">
                                <td className="py-2 text-gray-800">
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                                    style={{ backgroundColor: b.color }}
                                  />
                                  {b.label}
                                </td>
                                <td className="py-2 text-right text-gray-800">{b.count}</td>
                                <td className={`py-2 text-right font-semibold ${b.complaintCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {b.complaintCount}
                                </td>
                                <td className={`py-2 text-right ${b.complaintCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {b.count > 0 ? `${((b.complaintCount / b.count) * 100).toFixed(1)}%` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-3">
                      担当は「協力業者管理」の物件割り当てから判定しています。割り当てが無い物件は「直営」として集計されます。クレームは「清掃管理」画面でお客様フィードバックを確認して記録してください。
                    </p>
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

          {currentPage === 'reservations' && (
            <Reservations
              allowedProperties={allowedProperties}
              readOnly={isContractor}
              currentUser={user}
              isAdmin={isAdmin}
            />
          )}

          {currentPage === 'schedule' && <Schedule allowedProperties={allowedProperties} />}

          {currentPage === 'accounts' && isAdmin && <AccountManagement currentUid={user?.uid} />}

          {currentPage === 'vendors' && isAdmin && <VendorManagement />}

          {currentPage === 'masterdata' && isAdmin && <MasterDataManagement />}
        </main>
      </div>
    </div>
  );
}
