// Base URL of the Themis API.
// - Empty (''): the API is served from the same origin as the site.
// - Set VITE_API_URL to the API URL when the static site and API are
//   deployed as separate services.
export const API_BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export function apiGet(path) {
  return request(path, { method: 'GET', headers: { Accept: 'application/json' } })
}

export function apiPost(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
}
