import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase の認証状態を監視
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // テスト用：自動ログイン（開発環境のみ）
  useEffect(() => {
    if (loading) return;
    if (!user && process.env.NODE_ENV === 'development') {
      // テストユーザー情報（ダッシュボード表示用）
      setUser({
        email: 'test@guesthouse.local',
        uid: 'test-user-001'
      });
    }
  }, [loading, user]);

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  // テスト用簡易認証：ユーザーがいない場合はログイン画面を表示
  if (!user) {
    return <Login onLoginSuccess={() => {}} />;
  }

  // ログイン済み：ダッシュボードを表示
  return <Dashboard user={user} onLogout={handleLogout} />;
}
