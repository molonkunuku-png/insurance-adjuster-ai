// Base URL of the Themis API.
// - Empty (''): the API is served from the same origin as the site.
// - Set VITE_API_URL to the API URL when the static site and API are
//   deployed as separate services.
export const API_BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export function apiGet(path) {
  return request(path, { method: 'GET', headers: { Accept: 'application/json' } })
}

export function apiPost(path, body, { signal } = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

/** Map server error codes (code: 'badEmail', …) to translated strings. */
export function apiErrorMessage(err, t, fallback) {
  const code = err?.data?.code
  if (code && /^[a-zA-Z]+$/.test(code)) return t(`error.${code}`, err?.message || fallback)
  return err?.message || fallback
}

// POST that returns a binary attachment (e.g. .docx). Errors come back as JSON.
export async function apiPostBlob(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return res.blob()
}
