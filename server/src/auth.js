import crypto from 'crypto'
import { config, isProd } from './config.js'

// Ephemeral fallback so dev works without a configured secret.
// In production we refuse to boot without one (fail closed, never ephemeral).
let SESSION_SECRET = config.sessionSecret
if (!SESSION_SECRET) {
  if (isProd) {
    throw new Error('[auth] SESSION_SECRET is required in production — refusing to boot with an ephemeral secret')
  }
  SESSION_SECRET = crypto.randomBytes(32).toString('hex')
  console.warn('[auth] SESSION_SECRET not set — using ephemeral secret (sessions reset on restart)')
}

export function generateAccessToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function hmac(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url')
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function createSession(leadId, email, ttlDays = config.sessionTtlDays) {
  const payload = Buffer.from(
    JSON.stringify({ id: leadId, email, exp: Date.now() + ttlDays * 86400000 })
  ).toString('base64url')
  return `${payload}.${hmac(payload)}`
}

export function verifySession(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return null
  const idx = cookieValue.lastIndexOf('.')
  const payload = cookieValue.slice(0, idx)
  const sig = cookieValue.slice(idx + 1)
  if (!safeEqual(sig, hmac(payload))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!data?.exp || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
    }
  }
  return out
}

// Effective cookie name: __Host- prefix in production (requires Secure +
// Path=/ + no Domain, which we satisfy below) for session-theft resistance.
export function cookieName() {
  return `${isProd ? '__Host-' : ''}${config.cookieName}`
}

export function sessionCookie(value, { maxAgeSeconds = config.sessionTtlDays * 86400 } = {}) {
  const attrs = [
    `${cookieName()}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${new Date(Date.now() + maxAgeSeconds * 1000).toUTCString()}`,
  ]
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie() {
  const attrs = [`${cookieName()}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}
