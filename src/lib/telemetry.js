/**
 * Minimal client error beacon (Tier 4 observability): window errors are
 * POSTed to /api/client-log (rate-limited, truncated, PII-scrubbed) so
 * production failures surface in server logs instead of vanishing.
 * Same-origin only, deduped per message, never blocks the UI.
 */
import { scrubPII } from './privacy'

const seen = new Set()
let installed = false

export function installTelemetry() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const send = (level, msg) => {
    try {
      const clean = scrubPII(String(msg || '')).slice(0, 300)
      if (!clean || seen.has(level + clean)) return
      seen.add(level + clean)
      if (seen.size > 50) seen.clear()
      fetch('/api/client-log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, msg: clean, path: location.pathname + location.hash }),
      }).catch(() => {})
    } catch { /* never break the app for telemetry */ }
  }
  window.addEventListener('error', (e) => send('error', e?.message || 'window.error'))
  window.addEventListener('unhandledrejection', (e) => send('error', e?.reason?.message || String(e?.reason || 'unhandledrejection')))
}
