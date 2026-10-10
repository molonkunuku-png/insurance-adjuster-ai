import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

let pool = null
let useMemory = false

// ---------------------------------------------------------------------------
// Data-retention notes (beta policy, Top200 D36/D38):
// - beta_leads holds names + work emails (PII). No claim photos, policy text,
//   or report contents are ever stored server-side.
// - Magic-token hashes are purged on a schedule (purgeExpiredTokens, 24h).
// - The `claims` table below is intentionally RESERVED and unwired: turning it
//   on requires a retention/deletion policy + per-agency consent first.
// - Nightly owner exports (D37) stay manual until beta exceeds 50 leads.
// ---------------------------------------------------------------------------

// In-memory fallback so the server runs locally / without Postgres.
const memory = {
  betaLeads: [],
  seq: 1,
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS beta_leads (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT,
  claims_per_month TEXT,
  source        TEXT DEFAULT 'themis-beta',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS beta_leads_email_idx ON beta_leads (lower(email));
CREATE INDEX IF NOT EXISTS beta_leads_token_idx ON beta_leads (access_token_hash);
CREATE INDEX IF NOT EXISTS beta_leads_token_expiry_idx ON beta_leads (token_expires_at) WHERE access_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS beta_leads_status_created_idx ON beta_leads (status, created_at DESC);
CREATE TABLE IF NOT EXISTS telegram_pairs (
  email        TEXT PRIMARY KEY,
  chat_id      TEXT NOT NULL,
  lang         TEXT NOT NULL DEFAULT 'en',
  paired_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access / invite columns (added incrementally for existing deployments)
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS lang TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS volume TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS budget TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS pilot TEXT;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS uses INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT,
  analysis      JSONB,
  report_md     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

export async function initDb() {
  if (!config.databaseUrl) {
    useMemory = true
    console.warn('[db] DATABASE_URL not set — using in-memory store (data will not persist)')
    return
  }
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('localhost') ? false : (process.env.PGSSL_VERIFY === 'strict' ? true : { rejectUnauthorized: false }),
  })
  try {
    await pool.query(SCHEMA)
    console.log('[db] connected and schema ready')
  } catch (err) {
    // Fail closed in production: a silent memory fallback would lose every
    // lead and bypass the beta cap. Local dev (no DATABASE_URL) keeps memory.
    console.error('[db] init failed:', err.message)
    useMemory = true
    pool = null
    if ((process.env.NODE_ENV || 'development') === 'production') {
      throw new Error(`[db] refusing to boot without Postgres in production: ${err.message}`)
    }
    console.warn('[db] development fallback to memory store')
  }
  // Daily purge of expired magic-token hashes (stale hashes must not accumulate).
  const timer = setInterval(() => {
    purgeExpiredTokens().catch(e => console.error('[db] purge failed:', e.message))
  }, 24 * 3600 * 1000)
  timer.unref?.()
}

export async function saveBetaLead({ name, email, role, claimsPerMonth, source, lang, company, volume, budget, pilot }) {
  const cleanLang = lang === 'ms' ? 'ms' : 'en'
  const cleanCompany = String(company || '').slice(0, 120)
  const cleanVolume = String(volume || '').slice(0, 20)
  const cleanBudget = String(budget || '').slice(0, 40)
  const cleanPilot = pilot === true || pilot === 'yes' ? 'yes' : ''
  if (useMemory) {
    const existing = memory.betaLeads.find(l => l.email.toLowerCase() === email.toLowerCase())
    if (existing) {
      existing.name = name
      existing.role = role
      existing.claimsPerMonth = claimsPerMonth
      existing.lang = cleanLang
      existing.company = cleanCompany
      existing.volume = cleanVolume
      existing.budget = cleanBudget
      existing.pilot = cleanPilot
      return { lead: existing, created: false }
    }
    const lead = {
      id: memory.seq++,
      name,
      email,
      role,
      claimsPerMonth,
      source: source || 'themis-beta',
      lang: cleanLang,
      company: cleanCompany,
      volume: cleanVolume,
      budget: cleanBudget,
      pilot: cleanPilot,
      status: 'pending',
      accessTokenHash: null,
      tokenExpiresAt: null,
      invitedAt: null,
      lastLoginAt: null,
      uses: 0,
      createdAt: new Date().toISOString(),
    }
    memory.betaLeads.push(lead)
    return { lead, created: true }
  }

  const res = await pool.query(
    `INSERT INTO beta_leads (name, email, role, claims_per_month, source, lang, company, volume, budget, pilot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (lower(email))
     DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
                   claims_per_month = EXCLUDED.claims_per_month, lang = EXCLUDED.lang,
                   company = EXCLUDED.company, volume = EXCLUDED.volume,
                   budget = EXCLUDED.budget, pilot = EXCLUDED.pilot
     RETURNING id, name, email, role, claims_per_month, status, lang, created_at, (xmax = 0) AS created`,
    [name, email, role || null, claimsPerMonth || null, source || 'themis-beta', cleanLang, cleanCompany || null, cleanVolume || null, cleanBudget || null, cleanPilot || null]
  )
  const row = res.rows[0]
  return { lead: row, created: row.created }
}

export async function countInvited() {
  if (useMemory) {
    return memory.betaLeads.filter(l => l.status === 'invited' || l.status === 'active').length
  }
  const res = await pool.query(
    `SELECT COUNT(*)::int AS n FROM beta_leads WHERE status IN ('invited','active')`
  )
  return res.rows[0].n
}

export async function countByStatus() {
  if (useMemory) {
    const out = { pending: 0, invited: 0, active: 0 }
    for (const l of memory.betaLeads) {
      if (out[l.status] !== undefined) out[l.status] += 1
      else out.pending += 1
    }
    return out
  }
  const res = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM beta_leads GROUP BY status`
  )
  const out = { pending: 0, invited: 0, active: 0 }
  for (const row of res.rows) {
    if (out[row.status] !== undefined) out[row.status] = row.n
  }
  return out
}

export async function oldestPending(excludeEmail = null) {
  const ex = excludeEmail ? String(excludeEmail).toLowerCase() : null
  if (useMemory) {
    const pend = memory.betaLeads
      .filter(l => l.status === 'pending' && (!ex || l.email.toLowerCase() !== ex))
      .sort((a, b) => String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1)
    return pend[0] || null
  }
  const res = await pool.query(
    `SELECT id, name, email, status, lang FROM beta_leads
     WHERE status = 'pending' AND ($2::text IS NULL OR lower(email) <> $2)
     ORDER BY created_at ASC LIMIT 1`,
    [ex]
  )
  return res.rows[0] || null
}

export async function purgeExpiredTokens() {  const now = new Date()
  if (useMemory) {
    let n = 0
    for (const l of memory.betaLeads) {
      if (l.accessTokenHash && l.tokenExpiresAt && new Date(l.tokenExpiresAt) < now) {
        l.accessTokenHash = null
        l.tokenExpiresAt = null
        n += 1
      }
    }
    return n
  }
  const res = await pool.query(
    `UPDATE beta_leads SET access_token_hash = NULL, token_expires_at = NULL
     WHERE access_token_hash IS NOT NULL AND token_expires_at < now()`
  )
  return res.rowCount || 0
}

export async function approveLead({ email, tokenHash, expiresAt }) {
  if (useMemory) {
    const lead = memory.betaLeads.find(l => l.email.toLowerCase() === email.toLowerCase())
    if (!lead) return null
    // Preserve active sessions: re-mints (resend/nudge) must not demote.
    if (lead.status !== 'active') lead.status = 'invited'
    lead.accessTokenHash = tokenHash
    lead.tokenExpiresAt = expiresAt
    lead.invitedAt = new Date().toISOString()
    return lead
  }
  const res = await pool.query(
    `UPDATE beta_leads
     SET status = CASE WHEN status = 'active' THEN 'active' ELSE 'invited' END,
         access_token_hash = $2, token_expires_at = $3, invited_at = now()
     WHERE lower(email) = lower($1)
     RETURNING id, name, email, status`,
    [email, tokenHash, expiresAt]
  )
  return res.rows[0] || null
}

export async function findLeadByTokenHash(tokenHash) {
  if (useMemory) {
    return memory.betaLeads.find(l => l.accessTokenHash === tokenHash) || null
  }
  const res = await pool.query(
    `SELECT id, name, email, status, lang, token_expires_at, uses
     FROM beta_leads WHERE access_token_hash = $1`,
    [tokenHash]
  )
  return res.rows[0] || null
}

export async function findLeadByEmail(email) {
  if (useMemory) {
    return memory.betaLeads.find(l => l.email.toLowerCase() === email.toLowerCase()) || null
  }
  const res = await pool.query(
    `SELECT id, name, email, status, lang, token_expires_at FROM beta_leads WHERE lower(email) = lower($1)`,
    [email]
  )
  return res.rows[0] || null
}

export async function findExpiringLeads(withinHours = 24) {
  const cutoff = new Date(Date.now() + withinHours * 3600000)
  if (useMemory) {
    return memory.betaLeads.filter(l =>
      l.status === 'invited' && l.accessTokenHash && l.tokenExpiresAt && new Date(l.tokenExpiresAt) < cutoff
    )
  }
  const res = await pool.query(
    `SELECT id, name, email, status, lang, token_expires_at FROM beta_leads
     WHERE status = 'invited' AND access_token_hash IS NOT NULL AND token_expires_at < $1`,
    [cutoff.toISOString()]
  )
  return res.rows
}

export async function markLogin(id) {
  if (useMemory) {
    const lead = memory.betaLeads.find(l => l.id === id)
    if (lead) {
      lead.lastLoginAt = new Date().toISOString()
      lead.uses = (lead.uses || 0) + 1
      lead.status = 'active'
      lead.accessTokenHash = null
      lead.tokenExpiresAt = null
    }
    return
  }
  await pool.query(
    `UPDATE beta_leads SET last_login_at = now(), uses = uses + 1, status = 'active',
       access_token_hash = NULL, token_expires_at = NULL WHERE id = $1`,
    [id]
  )
}

export async function revokeLead(email) {
  if (useMemory) {
    const lead = memory.betaLeads.find(l => l.email.toLowerCase() === email.toLowerCase())
    if (lead) { lead.status = 'pending'; lead.accessTokenHash = null; lead.tokenExpiresAt = null }
    return
  }
  await pool.query(
    `UPDATE beta_leads SET status = 'pending', access_token_hash = NULL, token_expires_at = NULL
     WHERE lower(email) = lower($1)`,
    [email]
  )
}

export async function listBetaLeads(limit = 200, offset = 0) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 200)
  const off = Math.max(Number(offset) || 0, 0)
  // Memory branch projects the exact safe column set the PG branch selects —
  // token hashes must never reach the admin API from either store.
  const project = (l) => ({
    id: l.id, name: l.name, email: l.email, role: l.role ?? null,
    claims_per_month: l.claimsPerMonth ?? l.claims_per_month ?? null,
    company: l.company ?? null, volume: l.volume ?? null,
    budget: l.budget ?? null, pilot: l.pilot ?? null,
    status: l.status, created_at: l.createdAt ?? l.created_at,
    invited_at: l.invitedAt ?? l.invited_at ?? null,
    last_login_at: l.lastLoginAt ?? l.last_login_at ?? null,
    uses: l.uses ?? 0,
  })
  if (useMemory) return memory.betaLeads.slice(off, off + lim).map(project)
  const res = await pool.query(
    `SELECT id, name, email, role, claims_per_month, status, company, volume, budget, pilot, created_at, invited_at, last_login_at, uses
     FROM beta_leads ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [lim, off]
  )
  return res.rows
}

export function dbMode() {
  return useMemory ? 'memory' : 'postgres'
}

// ---------------------------------------------------------------------------
// Telegram pairings (chat_id <-> lead email). Memory-first like leads;
// Postgres table when configured. Re-pairing after a restart is supported.
// ---------------------------------------------------------------------------
const memoryPairs = new Map() // email -> { chatId, lang, pairedAt }

export async function pairGet(email) {
  const key = String(email).toLowerCase()
  if (useMemory) return memoryPairs.get(key) || null
  const res = await pool.query(
    `SELECT email, chat_id AS "chatId", lang, paired_at AS "pairedAt" FROM telegram_pairs WHERE email = $1`,
    [key]
  )
  return res.rows[0] || null
}

export async function pairSet(email, chatId, lang = 'en') {
  const key = String(email).toLowerCase()
  const row = { chatId: String(chatId), lang: lang === 'ms' ? 'ms' : 'en', pairedAt: new Date().toISOString() }
  if (useMemory) {
    memoryPairs.set(key, row)
    return row
  }
  await pool.query(
    `INSERT INTO telegram_pairs (email, chat_id, lang, paired_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (email) DO UPDATE SET chat_id = EXCLUDED.chat_id, lang = EXCLUDED.lang, paired_at = now()`,
    [key, row.chatId, row.lang]
  )
  return row
}

export async function pairDelByChatId(chatId) {
  const cid = String(chatId)
  if (useMemory) {
    for (const [email, p] of memoryPairs) {
      if (String(p.chatId) === cid) memoryPairs.delete(email)
    }
    return
  }
  await pool.query(`DELETE FROM telegram_pairs WHERE chat_id = $1`, [cid])
}

export async function pairFindByChatId(chatId) {
  const cid = String(chatId)
  if (useMemory) {
    for (const [email, p] of memoryPairs) {
      if (String(p.chatId) === cid) return { email, ...p }
    }
    return null
  }
  const res = await pool.query(
    `SELECT email, chat_id AS "chatId", lang, paired_at AS "pairedAt" FROM telegram_pairs WHERE chat_id = $1 LIMIT 1`,
    [cid]
  )
  return res.rows[0] || null
}
