import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualLogout, setManualLogout] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const userWithRole = {
          ...currentUser,
          role: currentUser.email === 'admin@guesthouse.local' ? 'admin' : 'staff'
        };
        setUser(userWithRole);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // テスト用：自動ログイン（開発環境のみ、手動ログアウト後は無効）
  useEffect(() => {
    if (loading || manualLogout) return;
    if (!user && process.env.NODE_ENV === 'development') {
      // 管理者ロールでテスト
      setUser({
        email: 'admin@guesthouse.local',
        uid: 'admin-user-001',
        role: 'admin'
      });
    }
  }, [loading, user, manualLogout]);

  const handleLogout = async () => {
    setManualLogout(true);
    await signOut(auth);
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

  if (!user) {
    return <Login onLoginSuccess={() => setManualLogout(false)} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
