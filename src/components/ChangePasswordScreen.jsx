import { useState } from 'react';
import { updatePassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearMustChangePassword } from '../services/userService';

// 管理者が発行した一時パスワードのまま使い続けるのを防ぐため、
// 初回ログイン時（またはパスワード再発行後）に必ずこの画面を経由させる。
// App.jsx が user.mustChangePassword を見て、Dashboard の代わりにこれを表示する。
export default function ChangePasswordScreen({ user, onDone, onLogout }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('確認用パスワードが一致しません');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      await clearMustChangePassword();
      onDone();
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setError('セキュリティのため、お手数ですが一度ログアウトしてから再度ログインし、もう一度お試しください。');
      } else {
        setError('パスワードの変更に失敗しました: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = async () => {
    await signOut(auth);
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">🔐 パスワードの設定</h1>
        <p className="text-gray-600 text-center mb-6 text-sm">
          初回ログインのため、ご自身の新しいパスワードを設定してください。
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">{user?.email}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">新しいパスワード</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8文字以上"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">新しいパスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
          >
            {loading ? '設定中...' : 'パスワードを設定して開始'}
          </button>
        </form>

        <button
          onClick={handleLogoutClick}
          className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
