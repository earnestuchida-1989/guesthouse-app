import { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess();
    } catch (err) {
      setError('ログインに失敗しました。メールアドレス・パスワードをご確認ください。');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setInfo('');
    if (!email) {
      setError('パスワードをリセットするには、まずメールアドレスを入力してください。');
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo('パスワード再設定用のメールを送信しました。メールボックス（迷惑メールフォルダも）をご確認ください。');
    } catch (err) {
      setError('送信に失敗しました。メールアドレスが正しいか、管理者にご確認ください。');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          ゲストハウス日程管理
        </h1>
        <p className="text-gray-600 text-center mb-8">
          スタッフ向けアプリ
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {info && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {info}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
          >
            {loading ? '処理中...' : 'ログイン'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={resetLoading}
          className="w-full text-center text-blue-500 hover:text-blue-700 mt-4 text-sm disabled:text-gray-400"
        >
          {resetLoading ? '送信中...' : 'パスワードをお忘れですか？'}
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          アカウントをお持ちでない方は、管理者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
