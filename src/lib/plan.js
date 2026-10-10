/**
 * Freemium usage gates (Tier 9-10): N free report drafts per 30-day window,
 * counted locally. When the cap hits, the UI teaches the upgrade moment
 * instead of silently failing. Server-side per-lead daily caps stay as the
 * abuse backstop; this is the product pricing surface.
 */
const KEY = 'themis-usage'
export const FREE_REPORTS_PER_WINDOW = 3
const WINDOW_MS = 30 * 24 * 3600 * 1000

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{"start":0,"used":0}')
  } catch {
    return { start: 0, used: 0 }
  }
}

function save(u) {
  try { localStorage.setItem(KEY, JSON.stringify(u)) } catch { /* ignore */ }
}

export function usageStatus() {
  const now = Date.now()
  let u = load()
  if (!u.start || now - u.start > WINDOW_MS) {
    u = { start: now, used: 0 }
    save(u)
  }
  return { used: u.used, free: FREE_REPORTS_PER_WINDOW, remaining: Math.max(0, FREE_REPORTS_PER_WINDOW - u.used) }
}

export function canDraft() {
  return usageStatus().remaining > 0
}

export function recordDraft() {
  const u = load()
  const now = Date.now()
  const cur = (!u.start || now - u.start > WINDOW_MS) ? { start: now, used: 0 } : u
  cur.used += 1
  save(cur)
  return usageStatus()
}
