import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installTelemetry } from './lib/telemetry'

installTelemetry()

// Field shell service worker: cache-first app shell, API always network.
// Registration failure (private mode, old browser) is silently fine.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
