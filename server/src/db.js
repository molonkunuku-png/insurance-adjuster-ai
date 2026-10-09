import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

let pool = null
let useMemory = false

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
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  })
  try {
    await pool.query(SCHEMA)
    console.log('[db] connected and schema ready')
  } catch (err) {
    console.error('[db] init failed, falling back to memory:', err.message)
    useMemory = true
    pool = null
  }
}

export async function saveBetaLead({ name, email, role, claimsPerMonth, source }) {
  if (useMemory) {
    const existing = memory.betaLeads.find(l => l.email.toLowerCase() === email.toLowerCase())
    if (existing) {
      existing.name = name
      existing.role = role
      existing.claimsPerMonth = claimsPerMonth
      return { lead: existing, created: false }
    }
    const lead = {
      id: memory.seq++,
      name,
      email,
      role,
      claimsPerMonth,
      source: source || 'themis-beta',
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    memory.betaLeads.push(lead)
    return { lead, created: true }
  }

  const res = await pool.query(
    `INSERT INTO beta_leads (name, email, role, claims_per_month, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(email))
     DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
                   claims_per_month = EXCLUDED.claims_per_month
     RETURNING id, name, email, role, claims_per_month, status, created_at, (xmax = 0) AS created`,
    [name, email, role || null, claimsPerMonth || null, source || 'themis-beta']
  )
  const row = res.rows[0]
  return { lead: row, created: row.created }
}

export async function listBetaLeads(limit = 200) {
  if (useMemory) return memory.betaLeads.slice(0, limit)
  const res = await pool.query(
    `SELECT id, name, email, role, claims_per_month, status, created_at
     FROM beta_leads ORDER BY created_at DESC LIMIT $1`,
    [limit]
  )
  return res.rows
}

export function dbMode() {
  return useMemory ? 'memory' : 'postgres'
}
