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
  countByStatus,
} from './db.js'
import {
  sendBetaConfirmation, sendBetaAccess, sendAdminNotification, resendConfigured,
} from './email.js'
import { analyzeDamageAndPolicy, generateReport, askPolicy } from './openai.js'
import { localAnalyze, localAsk, localReport } from './engine.js'
import { buildDocx, exportFilename } from './docx.js'
import {
  generateAccessToken, hashToken, createSession, verifySession,
  parseCookies, sessionCookie, clearSessionCookie, safeEqual, cookieName,
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

  // 16MB: 12 images at the per-image byte cap below, plus policy text headroom.
  app.use(express.json({ limit: '16mb' }))

  // Parse the session cookie and attach req.session
  app.use((req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie)
    req.session = verifySession(cookies[cookieName()])
    next()
  })

  const noStore = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  }

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
  const analyzeLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false })
  const betaLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
  const adminLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })

  // In-memory daily analysis tally per lead (single-instance beta discipline).
  const dailyUse = new Map() // leadId -> { day: 'YYYY-MM-DD', n: number }
  function checkDailyCap(leadId) {
    const today = new Date().toISOString().slice(0, 10)
    const rec = dailyUse.get(leadId)
    if (!rec || rec.day !== today) {
      dailyUse.set(leadId, { day: today, n: 1 })
      return true
    }
    if (rec.n >= config.dailyAnalysisCap) return false
    rec.n += 1
    return true
  }

  function requireAuth(req, res, next) {
    if (!req.session) return res.status(401).json({ error: 'Access required. Request a beta invite to continue.' })
    // Fail closed on revoked leads: sessions are stateless HMAC, so re-check
    // status on every gated request (cheap at beta scale).
    findLeadByEmail(req.session.email || '')
      .then(lead => {
        if (!lead || (lead.status !== 'invited' && lead.status !== 'active')) {
          return res.status(401).json({ error: 'Access required. Request a beta invite to continue.' })
        }
        next()
      })
      .catch(next)
  }

  function requireAdmin(req, res, next) {
    const secret = req.get('x-admin-secret') || ''
    if (!config.adminSecret || !safeEqual(secret, config.adminSecret)) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    next()
  }

  // ---- health ----
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: dbMode(),
      email: resendConfigured(),
      openai: config.usesOpenAI(),
      engine: config.usesOpenAI() ? 'openai' : 'local',
      auth: Boolean(config.sessionSecret),
      betaLimit: config.betaLimit,
      env: config.nodeEnv,
      uptime: Math.round(process.uptime()),
      build: process.env.RENDER_GIT_COMMIT || 'dev',
    })
  })

  // ---- auth session ----
  app.get('/api/auth/me', noStore, (req, res) => {
    res.json({ authorized: Boolean(req.session), email: req.session?.email || null })
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.json({ ok: true })
  })

  // ---- magic-link verify ----
  app.get('/api/access/verify', noStore, async (req, res) => {
    const fail = (reason) => res.redirect(`${config.appUrl}/?access=${reason}`)
    try {
      const token = req.query.token
      if (!token) return fail('invalid')
      const lead = await findLeadByTokenHash(hashToken(token))
      if (!lead) return fail('invalid')
      // Fail closed: revoked/pending leads can't ride an old link in.
      if (lead.status !== 'invited' && lead.status !== 'active') return fail('invalid')
      // Memory store uses camelCase, postgres snake_case — check both.
      const expiry = lead.token_expires_at ?? lead.tokenExpiresAt
      if (expiry && new Date(expiry) < new Date()) return fail('expired')
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
      if (!isEmail(clean.email)) {
        return res.status(400).json({ error: 'A valid email is required' })
      }

      const { lead, created } = await saveBetaLead(clean)

      const invitedSoFar = await countInvited()
      const grantAccess = invitedSoFar < config.betaLimit

      let accessSent = 'skipped'
      let waitlistSent = 'skipped'
      let notified = 'skipped'
      let accessUrl = null

      if (resendConfigured()) {
        if (grantAccess) {
          const r = await grantAndSend(clean)
          accessSent = r.emailSent ? 'sent' : `failed: ${r.error}`
          // Configured mailer: never hand the magic link back in JSON.
        } else {
          waitlistSent = await sendBetaConfirmation(clean).then(() => 'sent').catch(e => `failed: ${e.message}`)
        }
        notified = await sendAdminNotification({ ...clean, created }).then(() => 'sent').catch(e => `failed: ${e.message}`)
      } else {
        if (grantAccess) {
          const r = await grantAndSend(clean)
          accessUrl = r.accessUrl
        }
        console.warn('[email] RESEND_API_KEY not set — skipping emails')
      }

      console.log(`[beta] ${created ? 'created' : 'updated'} id=${lead.id} grant=${grantAccess} access=${accessSent} waitlist=${waitlistSent} notify=${notified}`)
      res.status(created ? 201 : 200).json({
        ok: true, granted: grantAccess,
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
      if (!isEmail(email)) {
        return res.status(400).json({ error: 'A valid email is required' })
      }
      const lead = await findLeadByEmail(email)
      let accessUrl = null
      if (lead && (lead.status === 'invited' || lead.status === 'active')) {
        if (resendConfigured()) {
          await grantAndSend({ name: lead.name, email }).catch(() => {})
        } else {
          // No mailer (local dev): mint + return the link so sign-in works offline.
          const r = await grantAndSend({ name: lead.name, email })
          accessUrl = r.accessUrl
        }
      } else if (lead && resendConfigured()) {
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
  // 8MB per image (base64 inflates ~33%, so ~10.6M chars is the wire ceiling).
  const MAX_IMAGE_B64 = 11_000_000
  app.post('/api/analyze', noStore, analyzeLimiter, requireAuth, async (req, res) => {
    try {
      if (!checkDailyCap(req.session.id)) {
        return res.status(429).json({ error: `Daily analysis limit reached (${config.dailyAnalysisCap}/day). Try again tomorrow.` })
      }
      const { images, policyText, damageNotes } = req.body || {}
      const imgs = Array.isArray(images) ? images : []
      const notes = str(damageNotes, 4000)
      if (imgs.length === 0 && !notes) {
        return res.status(400).json({ error: 'At least one image or a damage description is required' })
      }
      if (imgs.length > 12) return res.status(400).json({ error: 'Too many images (max 12)' })
      for (const img of imgs) {
        if (!img?.base64 || !img?.type) return res.status(400).json({ error: 'Malformed image payload' })
        if (String(img.base64).length > MAX_IMAGE_B64) return res.status(400).json({ error: 'Image too large (max ~8 MB per image)' })
        if (!looksLikeImage(img.base64)) return res.status(400).json({ error: 'Unsupported image encoding (JPEG, PNG, GIF, or WebP required)' })
      }
      const policy = str(policyText, 20000)
      // With no key we run fully on the deterministic local engine — no AI bills.
      const analysis = config.usesOpenAI()
        ? await analyzeDamageAndPolicy(imgs, policy)
        : localAnalyze({ policyText: policy, damageNotes: notes, imageCount: imgs.length })
      res.json({ analysis })
    } catch (e) {
      console.error('[analyze] error:', e.message)
      res.status(500).json({ error: 'Analysis failed. Please try again.' })
    }
  })

  app.post('/api/report', noStore, apiLimiter, requireAuth, async (req, res) => {
    try {
      const { analysis } = req.body || {}
      if (!analysis) return res.status(400).json({ error: 'analysis is required' })
      const markdown = config.usesOpenAI()
        ? await generateReport(analysis)
        : localReport(analysis)
      res.json({ markdown })
    } catch (e) {
      console.error('[report] error:', e.message)
      res.status(500).json({ error: 'Report generation failed. Please try again.' })
    }
  })

  app.post('/api/ask', noStore, apiLimiter, requireAuth, async (req, res) => {
    try {
      const { policyText, question, history } = req.body || {}
      const q = str(question, 1200)
      if (!q) return res.status(400).json({ error: 'question is required' })
      if (policyText && policyText.length > 40000) {
        return res.status(400).json({ error: 'policy text is too large (max 40,000 characters)' })
      }
      const args = {
        policyText: str(policyText, 40000),
        question: q,
        history: Array.isArray(history) ? history.slice(-6) : [],
      }
      const response = config.usesOpenAI() ? await askPolicy(args) : localAsk(args)
      res.json({ response })
    } catch (e) {
      console.error('[ask] error:', e.message)
      res.status(500).json({ error: 'Question failed. Please try again.' })
    }
  })

  app.post('/api/export/docx', apiLimiter, requireAuth, async (req, res) => {
    try {
      const { markdown, analysis, lang } = req.body || {}
      if (!markdown && !analysis) return res.status(400).json({ error: 'nothing to export' })
      const buf = await buildDocx({ markdown: str(markdown, 60000), analysis: analysis || null, lang: lang === 'ms' ? 'ms' : 'en' })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`)
      res.send(buf)
    } catch (e) {
      console.error('[export] error:', e.message)
      res.status(500).json({ error: 'Export failed. Please try again.' })
    }
  })

  // ---- admin ----
  app.get('/api/admin/leads', adminLimiter, requireAdmin, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    res.json({ leads: await listBetaLeads(limit, offset), counts: await countByStatus(), betaLimit: config.betaLimit })
  })

  app.post('/api/admin/invite', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' })
      const lead = await findLeadByEmail(email)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      if ((await countInvited()) >= config.betaLimit) {
        return res.status(403).json({ error: 'Beta cap reached — raise BETA_LIMIT to invite more' })
      }
      if (resendConfigured()) await grantAndSend({ name: lead.name, email })
      console.log(`[admin] invite email=${email} by=${req.ip}`)
      res.json({ ok: true, email })
    } catch (e) {
      console.error('[admin/invite] error:', e.message)
      res.status(500).json({ error: 'Invite failed' })
    }
  })

  app.post('/api/admin/revoke', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      await revokeLead(email)
      console.log(`[admin] revoke ok by=${req.ip}`)
      // Neutral response either way: with a valid admin secret the caller
      // already passed the gate; nothing about other users leaks here.
      res.json({ ok: true })
    } catch (e) {
      console.error('[admin/revoke] error:', e.message)
      res.status(500).json({ error: 'Revoke failed' })
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
    // Log the failure, never the link: the URL is only returned to callers
    // that are explicitly allowed to receive it (local dev, no mailer).
    console.warn(`[email] magic-link email FAILED for lead id lookup — see errors table`)
    return { accessUrl, emailSent: false, error: e.message }
  }
}

function str(v, max) {
  if (v === undefined || v === null) return ''
  return String(v).trim().slice(0, max)
}

// Tighter than the bare minimum: local part ≤64, domain has a 2+ char TLD.
function isEmail(v) {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(String(v || ''))
}

// Magic-byte allowlist for data-URL image uploads: JPEG, PNG, GIF, WebP.
// Runs before any downstream use so mislabeled uploads fail fast.
function looksLikeImage(dataUrlOrB64) {
  try {
    const b64 = String(dataUrlOrB64 || '').includes(',')
      ? String(dataUrlOrB64).split(',').slice(1).join(',')
      : String(dataUrlOrB64 || '')
    const head = Buffer.from(b64.slice(0, 24), 'base64')
    if (head.length < 4) return false
    if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return true // JPEG
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return true // PNG
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return true // GIF
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return true // WebP (RIFF)
    return false
  } catch {
    return false
  }
}
