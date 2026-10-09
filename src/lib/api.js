// Base URL of the Themis API.
// - Empty (''): the API is served from the same origin as the site.
// - Set VITE_API_URL to the Render Web Service URL when the static site
//   and API are deployed as separate services.
export const API_BASE = import.meta.env.VITE_API_URL || ''

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}
