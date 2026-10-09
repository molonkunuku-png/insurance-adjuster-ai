import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

import { config, isProd } from './config.js'
import {
  saveBetaLead, listBetaLeads, dbMode, countInvited, approveLead,
  findLeadByTokenHash, findLeadByEmail, markLogin, revokeLead,
} from './db.js'
import {
  sendBetaConfirmation, sendBetaAccess, sendAdminNotification, smtpConfigured,
} from './email.js'
import { analyzeDamageAndPolicy, generateReport } from './openai.js'
import {
  generateAccessToken, hashToken, createSession, verifySession,
  parseCookies, sessionCookie, clearSessionCookie,
} from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', '..', 'dist')

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)

  app.use(cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (config.clientOrigins.includes(origin)) return cb(null, true)
      if (!isProd && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true)
      return cb(new Error(`Origin not allowed: ${origin}`))
    },
  }))

  app.use(express.json({ limit: '30mb' }))

  // Parse the session cookie and attach req.session
  app.use((req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie)
    req.session = verifySession(cookies[config.cookieName])
    next()
  })

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
  const betaLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })

  function requireAuth(req, res, next) {
    if (!req.session) return res.status(401).json({ error: 'Access required. Request a beta invite to continue.' })
    next()
  }

  function requireAdmin(req, res, next) {
    const secret = req.get('x-admin-secret')
    if (!config.adminSecret || secret !== config.adminSecret) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    next()
  }

  // ---- health ----
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: dbMode(),
      email: smtpConfigured(),
      openai: Boolean(config.openaiKey),
      auth: Boolean(config.sessionSecret),
      betaLimit: config.betaLimit,
      env: config.nodeEnv,
    })
  })

  // ---- auth session ----
  app.get('/api/auth/me', (req, res) => {
    res.json({ authorized: Boolean(req.session), email: req.session?.email || null })
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.json({ ok: true })
  })

  // ---- magic-link verify ----
  app.get('/api/access/verify', async (req, res) => {
    const fail = (reason) => res.redirect(`${config.appUrl}/?access=${reason}`)
    try {
      const token = req.query.token
      if (!token) return fail('invalid')
      const lead = await findLeadByTokenHash(hashToken(token))
      if (!lead) return fail('invalid')
      if (lead.token_expires_at && new Date(lead.token_expires_at) < new Date()) return fail('expired')
      await markLogin(lead.id)
      res.setHeader('Set-Cookie', sessionCookie(createSession(lead.id, lead.email)))
      res.redirect(`${config.appUrl}/?access=ok`)
    } catch (e) {
      console.error('[access] verify error:', e)
      res.redirect(`${config.appUrl}/?access=error`)
    }
  })

  // ---- beta signup (auto-approves until the cap) ----
  app.post('/api/beta', betaLimiter, async (req, res) => {
    try {
      const { name, email, role, claims, source } = req.body || {}
      const clean = {
        name: str(name, 120),
        email: str(email, 200).toLowerCase(),
        role: str(role, 60),
        claimsPerMonth: str(claims, 20),
        source: str(source, 60) || 'themis-beta',
      }
      if (!clean.name) return res.status(400).json({ error: 'Name is required' })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
        return res.status(400).json({ error: 'A valid email is required' })
      }

      const { lead, created } = await saveBetaLead(clean)

      const invitedSoFar = await countInvited()
      const grantAccess = invitedSoFar < config.betaLimit

      let accessSent = 'skipped'
      let waitlistSent = 'skipped'
      let notified = 'skipped'
      let accessUrl = null

      if (smtpConfigured()) {
        if (grantAccess) {
          const r = await grantAndSend(clean)
          accessSent = r.emailSent ? 'sent' : `failed: ${r.error}`
          if (!r.emailSent) accessUrl = r.accessUrl
        } else {
          waitlistSent = await sendBetaConfirmation(clean).then(() => 'sent').catch(e => `failed: ${e.message}`)
        }
        notified = await sendAdminNotification({ ...clean, created }).then(() => 'sent').catch(e => `failed: ${e.message}`)
      } else {
        console.warn('[email] RESEND_API_KEY not set — skipping emails')
      }

      console.log(`[beta] ${created ? 'created' : 'updated'} id=${lead.id} email=${clean.email} grant=${grantAccess} access=${accessSent} waitlist=${waitlistSent} notify=${notified}`)
      res.status(created ? 201 : 200).json({
        ok: true, id: lead.id, created, granted: grantAccess,
        access: accessSent, waitlist: waitlistSent, notified,
        ...(accessUrl ? { accessUrl } : {}),
      })
    } catch (e) {
      console.error('[beta] error:', e)
      res.status(500).json({ error: 'Could not process request' })
    }
  })

  app.post('/api/beta/resend', betaLimiter, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email is required' })
      }
      const lead = await findLeadByEmail(email)
      let accessUrl = null
      if (lead && (lead.status === 'invited' || lead.status === 'active') && smtpConfigured()) {
        const r = await grantAndSend({ name: lead.name, email })
        if (!r.emailSent) accessUrl = r.accessUrl
      } else if (lead && smtpConfigured()) {
        await sendBetaConfirmation({ name: lead.name, email }).catch(() => {})
      }
      // Always respond the same (don't reveal whether the email exists)
      res.json({ ok: true, ...(accessUrl ? { accessUrl } : {}) })
    } catch (e) {
      console.error('[beta/resend] error:', e)
      res.status(500).json({ error: 'Could not resend' })
    }
  })

  // ---- gated AI endpoints ----
  app.post('/api/analyze', apiLimiter, requireAuth, async (req, res) => {
    try {
      const { images, policyText } = req.body || {}
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' })
      }
      if (images.length > 12) return res.status(400).json({ error: 'Too many images (max 12)' })
      for (const img of images) {
        if (!img?.base64 || !img?.type) return res.status(400).json({ error: 'Malformed image payload' })
      }
      const analysis = await analyzeDamageAndPolicy(images, str(policyText, 20000))
      res.json({ analysis })
    } catch (e) {
      console.error('[analyze] error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  app.post('/api/report', apiLimiter, requireAuth, async (req, res) => {
    try {
      const { analysis } = req.body || {}
      if (!analysis) return res.status(400).json({ error: 'analysis is required' })
      const markdown = await generateReport(analysis)
      res.json({ markdown })
    } catch (e) {
      console.error('[report] error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // ---- admin ----
  app.get('/api/admin/leads', requireAdmin, async (_req, res) => {
    res.json({ leads: await listBetaLeads(), betaLimit: config.betaLimit })
  })

  app.post('/api/admin/invite', requireAdmin, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      const lead = await findLeadByEmail(email)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      if (smtpConfigured()) await grantAndSend({ name: lead.name, email })
      res.json({ ok: true, email })
    } catch (e) {
      console.error('[admin/invite] error:', e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post('/api/admin/revoke', requireAdmin, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      await revokeLead(email)
      res.json({ ok: true, email })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // ---- optional static client (single-service deploy) ----
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(join(distDir, 'index.html'))
    })
  }

  app.use((err, _req, res, _next) => {
    if (err?.message?.startsWith('Origin not allowed')) {
      return res.status(403).json({ error: 'Origin not allowed' })
    }
    console.error('[unhandled]', err)
    res.status(500).json({ error: 'Internal error' })
  })

  return app
}

/**
 * Mint an access token, mark the lead invited, email the magic link.
 * Always resolves. On email failure it returns emailSent:false + accessUrl and
 * logs the link so the developer can sign in from the server logs (test mode).
 */
async function grantAndSend({ name, email }) {
  const token = generateAccessToken()
  const expiresAt = new Date(Date.now() + config.tokenTtlDays * 86400000)
  await approveLead({ email, tokenHash: hashToken(token), expiresAt })
  // PUBLIC_API_URL -> APP_URL -> default: points the magic link at the API origin.
  const accessUrl = `${config.publicApiUrl}/api/access/verify?token=${encodeURIComponent(token)}`
  try {
    await sendBetaAccess({ name, email, accessUrl })
    return { accessUrl, emailSent: true, error: null }
  } catch (e) {
    console.warn(`[email] magic-link email FAILED for ${email}: ${e.message}`)
    console.warn(`[email] ACCESS URL (test-mode fallback — open this in your browser): ${accessUrl}`)
    return { accessUrl, emailSent: false, error: e.message }
  }
}

function str(v, max) {
  if (v === undefined || v === null) return ''
  return String(v).trim().slice(0, max)
}
