import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { getUserDoc } from './services/userService';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const BOOTSTRAP_ADMIN_EMAIL = 'admin@guesthouse.local';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualLogout, setManualLogout] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getUserDoc(currentUser.uid);

        if (userDoc && userDoc.active === false) {
          // 無効化されたアカウントは即ログアウト
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }

        setUser({
          ...currentUser,
          role: userDoc?.role || 'staff',
          vendorId: userDoc?.vendorId || null,
          customerId: userDoc?.customerId || null,
        });
      } catch (e) {
        console.error('ユーザー情報取得エラー:', e);
        setUser({ ...currentUser, role: 'staff' });
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
        email: BOOTSTRAP_ADMIN_EMAIL,
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
