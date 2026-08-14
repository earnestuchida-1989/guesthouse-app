import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// 新しいデプロイを検知したら自動でリロードする。
// タブを開きっぱなしのユーザーが古いJSバンドルのまま使い続けてしまう
// （＝直したはずの不具合が再現し続ける）事故を防ぐため。
//
// iOS（ホーム画面に追加したPWA）はService Workerの更新チェックが
// バックグラウンドで走らないことがあるため、以下も併用する：
// - アプリをフォアグラウンドに戻した瞬間（visibilitychange）に即チェック
// - 手動で「最新版を確認」できるボタンから叩けるよう window に関数を公開
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return

    registration.update()
    setInterval(() => registration.update(), 60 * 1000)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update()
      }
    })

    window.__checkForAppUpdate = () => registration.update()
  },
  onNeedRefresh() {
    updateSW(true)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
