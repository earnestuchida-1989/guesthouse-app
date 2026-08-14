import { useState, useEffect } from 'react';
import {
  onUsersChange,
  createStaffAccount,
  setUserRole,
  setUserActive,
  resetUserPassword,
} from '../services/userService';
import { onVendorsChange } from '../services/vendorService';
import { onCustomersChange, addCustomer } from '../services/customerService';

const ROLE_LABELS = {
  admin: '🔐 管理者',
  staff: '👤 スタッフ',
  contractor: '🏢 協力業者',
  customer: '🧑‍💼 顧客',
};

export default function AccountManagement({ currentUid }) {
  const [users, setUsers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newAccountResult, setNewAccountResult] = useState(null);
  const [resettingUid, setResettingUid] = useState(null);

  useEffect(() => {
    const unsubscribe = onUsersChange((data) => {
      setUsers(data.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
      setLoading(false);
    });
    const unsubVendors = onVendorsChange((data) => setVendors(data));
    const unsubCustomers = onCustomersChange((data) => setCustomers(data));
    return () => {
      unsubscribe();
      unsubVendors();
      unsubCustomers();
    };
  }, []);

  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const customerNameById = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  const handleRoleToggle = async (u) => {
    // 管理者⇄スタッフの簡易切替（協力業者への変更は招待時のみ、複雑化を避けるため）
    const newRole = u.role === 'admin' ? 'staff' : 'admin';
    if (!window.confirm(`${u.email} を「${newRole === 'admin' ? '管理者' : 'スタッフ'}」に変更しますか？`)) return;
    try {
      await setUserRole(u.id, newRole);
    } catch (err) {
      alert('変更に失敗しました: ' + err.message);
    }
  };

  const handleActiveToggle = async (u) => {
    const nextActive = !u.active;
    const label = nextActive ? '有効化' : '無効化';
    if (!window.confirm(`${u.email} を${label}しますか？`)) return;
    try {
      await setUserActive(u.id, nextActive);
    } catch (err) {
      alert('変更に失敗しました: ' + err.message);
    }
  };

  const handleResetPassword = async (u) => {
    if (!window.confirm(`${u.email} のパスワードを再発行しますか？\n現在のパスワードは使えなくなります。`)) return;
    setResettingUid(u.id);
    try {
      const result = await resetUserPassword(u.id);
      setNewAccountResult(result);
    } catch (err) {
      alert('再発行に失敗しました: ' + err.message);
    } finally {
      setResettingUid(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">👥 アカウント管理</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition"
        >
          + 新規スタッフを招待
        </button>
      </div>

      {loading ? (
        <p className="text-gray-600">データ読み込み中...</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">メールアドレス</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">名前</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">権限</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">状態</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800">{u.email}</td>
                  <td className="px-6 py-4 text-gray-600">{u.displayName || '-'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : u.role === 'contractor'
                          ? 'bg-orange-100 text-orange-800'
                          : u.role === 'customer'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {u.role === 'contractor' && u.vendorId && (
                      <span className="block text-xs text-gray-500 mt-1">
                        {vendorNameById[u.vendorId] || '不明な業者'}
                      </span>
                    )}
                    {u.role === 'customer' && u.customerId && (
                      <span className="block text-xs text-gray-500 mt-1">
                        {customerNameById[u.customerId] || '不明な顧客'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        u.active === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {u.active === false ? '無効' : '有効'}
                    </span>
                  </td>
                  <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => handleRoleToggle(u)}
                      className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-1 px-3 rounded text-sm transition"
                    >
                      権限切替
                    </button>
                    <button
                      onClick={() => handleResetPassword(u)}
                      disabled={resettingUid === u.id}
                      className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-1 px-3 rounded text-sm transition"
                    >
                      {resettingUid === u.id ? '発行中...' : 'パスワード再発行'}
                    </button>
                    <button
                      onClick={() => handleActiveToggle(u)}
                      disabled={u.id === currentUid}
                      className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-1 px-3 rounded text-sm transition"
                    >
                      {u.active === false ? '有効化' : '無効化'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">アカウントがありません</p>
            </div>
          )}
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onCreated={(result) => {
            setShowInviteModal(false);
            setNewAccountResult(result);
          }}
        />
      )}

      {newAccountResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">✅ パスワードを発行しました</h3>
            <p className="text-sm text-gray-600 mb-4">
              このパスワードは今だけ表示されます。本人に安全な方法（口頭・LINEなど）で伝えてください。
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-2">
              <p className="text-sm text-gray-500">メールアドレス</p>
              <p className="font-mono font-semibold text-gray-800">{newAccountResult.email}</p>
              <p className="text-sm text-gray-500 mt-2">パスワード</p>
              <p className="font-mono font-semibold text-gray-800 text-lg">{newAccountResult.tempPassword}</p>
            </div>
            <button
              onClick={() => setNewAccountResult(null)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('staff');
  const [vendorId, setVendorId] = useState('');
  const [vendors, setVendors] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onVendorsChange((data) => setVendors(data.filter((v) => v.active !== false)));
    const unsubCustomers = onCustomersChange((data) => setCustomers(data.filter((c) => c.active !== false)));
    return () => {
      unsub();
      unsubCustomers();
    };
  }, []);

  const handleAddCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setAddingCustomer(true);
    try {
      const id = await addCustomer(newCustomerName.trim());
      setCustomerId(id);
      setNewCustomerName('');
      setError('');
    } catch (err) {
      setError('顧客の追加に失敗しました: ' + err.message);
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (role === 'contractor' && !vendorId) {
      setError('協力業者を選択してください');
      return;
    }
    if (role === 'customer' && !customerId) {
      setError('顧客を選択してください');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await createStaffAccount({
        email,
        displayName,
        role,
        vendorId: role === 'contractor' ? vendorId : undefined,
        customerId: role === 'customer' ? customerId : undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(err.message || '作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="bg-blue-500 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold">新規スタッフを招待</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
          )}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">メールアドレス *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">名前</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="任意"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">権限</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="staff">スタッフ</option>
              <option value="admin">管理者</option>
              <option value="contractor">協力業者</option>
              <option value="customer">顧客</option>
            </select>
          </div>
          {role === 'customer' && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">顧客 *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">選択してください</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="新しい顧客名を入力して追加"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomer}
                  disabled={addingCustomer || !newCustomerName.trim()}
                  className="bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-bold py-2 px-3 rounded-lg text-sm transition"
                >
                  {addingCustomer ? '追加中...' : '+ 追加'}
                </button>
              </div>
            </div>
          )}
          {role === 'contractor' && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">所属業者 *</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">選択してください</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {vendors.length === 0 && (
                <p className="text-xs text-orange-600 mt-2">
                  協力業者が未登録です。先に「協力業者管理」画面で業者を登録してください。
                </p>
              )}
            </div>
          )}
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
              {loading ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
