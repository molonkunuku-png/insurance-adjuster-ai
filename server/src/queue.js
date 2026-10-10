/**
 * Mail task-automation queue ("same engine, different code").
 *
 * Single-process, in-memory, zero-dependency job system for beta scale:
 * priority jobs, exponential backoff + jitter, dead-letter store with admin
 * replay, idempotency keys on every trigger, per-lead + global send caps,
 * suppression list, circuit breaker, and an in-memory event ring.
 *
 * The transport (SMTP/Resend/Telegram/file-log) is injected as sendFn so
 * this module never imports provider code — no cycles, fully testable.
 */

import crypto from 'crypto'

const JOB_TYPES = new Set(['welcome', 'access', 'waitlist', 'revoke', 'confirm', 'digest', 'nudge'])
const MAX_ATTEMPTS = 5
const DEAD_CAP = 200
const QUEUE_CAP = 1000
const EVENT_CAP = 500
const DEDUPE_TTL_MS = 72 * 3600 * 1000

const jobs = new Map() // id -> job
const dedupe = new Map() // key -> { id, exp }
const dead = [] // dead-letter entries, oldest-first
const events = [] // ring buffer { at, ev, ... }
const suppression = new Map() // email -> { reason, until }
const perLeadDay = new Map() // email -> { day, n }
let globalDay = { day: '', n: 0 }
let consecFails = 0
let breakerUntil = 0
let workerTimer = null
const sweeps = []

const todayKey = () => new Date().toISOString().slice(0, 10)

export function logEvent(ev) {
  events.push({ at: new Date().toISOString(), ...ev })
  if (events.length > EVENT_CAP) events.splice(0, events.length - EVENT_CAP)
}

function backoffMs(attempts) {
  const base = 2 * 60 * 1000 * 2 ** Math.min(attempts, 4)
  return base + Math.floor(Math.random() * 30 * 1000)
}

function validJob({ type, to }) {
  if (!JOB_TYPES.has(type)) return 'unknown job type'
  if (!/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(String(to || '').toLowerCase())) return 'bad recipient'
  return null
}

export function enqueue({ type, to, payload = {}, notBefore = null, priority = 5, dedupeKey = null }) {
  const bad = validJob({ type, to })
  if (bad) throw new Error(`queue: ${bad}`)
  const email = String(to).toLowerCase()
  const key = dedupeKey || `${type}:${email}:${todayKey()}`
  const hit = dedupe.get(key)
  if (hit && hit.exp > Date.now()) {
    logEvent({ ev: 'dedupe-skip', type, to: email })
    return { job: jobs.get(hit.id) || null, deduped: true }
  }
  if (jobs.size >= QUEUE_CAP) throw new Error('queue: full');
  const sup = suppression.get(email)
  if (sup && sup.until > Date.now()) {
    logEvent({ ev: 'suppressed-skip', type, to: email, reason: sup.reason })
    return { job: null, suppressed: true };
  }
  // Per-lead + global daily caps are reserved HERE at enqueue (not at send):
  // one enqueue reserves one send, so honest rejection happens up front.
  const day = todayKey()
  const rec = perLeadDay.get(email)
  if (type !== 'digest') {
    if (rec && rec.day === day && rec.n >= 3) {
      logEvent({ ev: 'cap-lead', type, to: email })
      throw new Error('queue: per-lead daily cap reached')
    }
    if (globalDay.day !== day) globalDay = { day, n: 0 }
    if (globalDay.n >= 50) {
      logEvent({ ev: 'cap-global', type, to: email })
      throw new Error('queue: global daily cap reached')
    }
  }
  const job = {
    id: crypto.randomUUID(),
    type, to: email,
    payload: { ...payload },
    attempts: 0,
    notBefore: notBefore || new Date().toISOString(),
    priority,
    createdAt: new Date().toISOString(),
    lastError: null,
  }
  jobs.set(job.id, job)
  if (type !== 'digest') {
    perLeadDay.set(email, { day, n: (rec && rec.day === day ? rec.n : 0) + 1 })
    globalDay.n += 1
  }
  dedupe.set(key, { id: job.id, exp: Date.now() + DEDUPE_TTL_MS })
  logEvent({ ev: 'queued', id: job.id, type, to: email })
  return { job, deduped: false }
}

function dueJobs(now) {
  return [...jobs.values()]
    .filter(j => new Date(j.notBefore).getTime() <= now)
    .sort((a, b) => (a.priority - b.priority) || (a.createdAt < b.createdAt ? -1 : 1))
}

async function attempt(job, sendFn) {
  // Budget was reserved at enqueue; the send itself just delivers.
  return sendFn(job)
}

export async function drainOnce(sendFn) {
  return tick(sendFn)
}

async function tick(sendFn) {
  if (Date.now() < breakerUntil) return
  const [job] = dueJobs(Date.now())
  if (!job) return
  jobs.delete(job.id)
  try {
    const res = await attempt(job, sendFn)
    consecFails = 0
    logEvent({ ev: 'sent', id: job.id, type: job.type, to: job.to, provider: res?.provider || '?' })
  } catch (e) {
    consecFails += 1
    job.attempts += 1
    job.lastError = String(e?.message || e).slice(0, 300)
    if (/smtp-5\d\d|hard bounce|dead|invalid|policy|auth/i.test(job.lastError)) {
      // Permanent: straight to dead-letter, plus suppression on hard bounces.
      if (/550|551|552|553|mailbox|unknown/i.test(job.lastError)) {
        suppression.set(job.to, { reason: job.lastError.slice(0, 120), until: Date.now() + 30 * 86400000 })
      }
      dead.push({ ...job, failedAt: new Date().toISOString() })
      if (dead.length > DEAD_CAP) dead.splice(0, dead.length - DEAD_CAP)
      logEvent({ ev: 'dead', id: job.id, type: job.type, to: job.to, error: job.lastError })
    } else if (job.attempts >= MAX_ATTEMPTS) {
      dead.push({ ...job, failedAt: new Date().toISOString() })
      if (dead.length > DEAD_CAP) dead.splice(0, dead.length - DEAD_CAP)
      logEvent({ ev: 'dead', id: job.id, type: job.type, to: job.to, error: job.lastError })
    } else {
      job.notBefore = new Date(Date.now() + backoffMs(job.attempts)).toISOString()
      jobs.set(job.id, job)
      logEvent({ ev: 'retry', id: job.id, type: job.type, to: job.to, attempts: job.attempts })
    }
    if (consecFails >= 5) {
      breakerUntil = Date.now() + 15 * 60 * 1000
      logEvent({ ev: 'breaker-open' })
    }
  }
}

export function startWorker(sendFn, { everyMs = 5000 } = {}) {
  if (workerTimer) return
  workerTimer = setInterval(() => {
    tick(sendFn).catch(e => console.error('[queue] tick failed:', e.message))
  }, everyMs)
  workerTimer.unref?.()
}

export function registerSweep(name, ms, fn) {
  const t = setInterval(() => {
    Promise.resolve()
      .then(fn)
      .catch(e => console.error(`[sweep:${name}] failed:`, e.message))
  }, ms)
  t.unref?.()
  sweeps.push({ name, timer: t })
}

export function queueStatus() {
  return {
    depth: jobs.size,
    dead: dead.length,
    breakerOpen: Date.now() < breakerUntil,
    consecFails,
    global: globalDay,
  }
}

export function deadList() {
  return dead.map(d => ({ id: d.id, type: d.type, to: d.to, attempts: d.attempts, lastError: d.lastError, failedAt: d.failedAt }))
}

export function replayJob(id) {
  const i = dead.findIndex(d => d.id === id)
  if (i < 0) return null
  const [d] = dead.splice(i, 1)
  const job = { ...d, attempts: 0, lastError: null, notBefore: new Date().toISOString() }
  delete job.failedAt
  jobs.set(job.id, job)
  logEvent({ ev: 'replay', id: job.id, type: job.type, to: job.to })
  return job
}

export function suppress(email, reason = 'manual') {
  suppression.set(String(email).toLowerCase(), { reason, until: Date.now() + 30 * 86400000 })
}

export function unsuppress(email) {
  return suppression.delete(String(email).toLowerCase())
}

export function suppressionList() {
  return [...suppression.entries()].map(([email, v]) => ({ email, ...v }))
}

export function eventLog() {
  return events.slice(-500)
}

// Test-only: force all pending jobs due now (NODE_ENV=test flows).
export function __forceDue() {
  for (const j of jobs.values()) j.notBefore = new Date(0).toISOString()
}

// Test-only reset (NODE_ENV=test or explicit): clears all queue state.
export function __reset() {
  jobs.clear()
  dedupe.clear()
  dead.length = 0
  events.length = 0
  suppression.clear()
  perLeadDay.clear()
  globalDay = { day: '', n: 0 }
  consecFails = 0
  breakerUntil = 0
}
