import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// 新しいデプロイを検知したら自動でリロードする。
// タブを開きっぱなしのユーザーが古いJSバンドルのまま使い続けてしまう
// （＝直したはずの不具合が再現し続ける）事故を防ぐため。
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 1000)
    }
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
