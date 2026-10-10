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
  countByStatus, findExpiringLeads,
} from './db.js'
import {
  sendBetaConfirmation, sendAdminNotification, resendConfigured,
} from './email.js'
import { analyzeDamageAndPolicy, generateReport, askPolicy } from './openai.js'
import { localAnalyze, localAsk, localReport } from './engine.js'
import { buildDocx, exportFilename } from './docx.js'
import {
  generateAccessToken, hashToken, createSession, verifySession,
  parseCookies, sessionCookie, clearSessionCookie, safeEqual, cookieName,
} from './auth.js'
import {
  enqueue, registerSweep, queueStatus, deadList, replayJob,
  suppress, unsuppress, suppressionList, eventLog,
} from './queue.js'
import { trySendNow } from './send.js'
import { issuePairingCode } from './telegram.js'

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

  // Resend cooldown: one link email per address per 60s (enforced + visible).
  const resendAt = new Map() // email -> timestamp ms
  // In-memory daily analysis tally per lead (single-instance beta discipline).
  const dailyUse = new Map() // leadId -> { day: 'YYYY-MM-DD', n: number }
  function resendCooldown(email) {
    const last = resendAt.get(email) || 0
    const wait = 60000 - (Date.now() - last)
    if (wait > 0) return Math.ceil(wait / 1000)
    resendAt.set(email, Date.now())
    return 0
  }
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

      let mail = { status: 'skipped', provider: null, error: null }
      let waitlistSent = 'skipped'
      let notified = 'skipped'
      let accessUrl = null

      if (resendConfigured()) {
        if (grantAccess) {
          const r = await grantAndSend(clean)
          mail = { status: r.emailSent ? 'sent' : (r.queued ? 'queued' : 'failed'), provider: r.provider || null, error: r.error || null }
          // Honest rule (lockout postmortem): the link is returned whenever
          // delivery did NOT confirm — never a silent "check your inbox".
          if (!r.emailSent) accessUrl = r.accessUrl
        } else {
          waitlistSent = await sendBetaConfirmation(clean).then(() => 'sent').catch(e => `failed: ${e.message}`)
        }
        // Owner delivery line: tells the admin mail exactly what happened
        // to the lead's magic link (metadata only — never the link itself).
        const delivery = !grantAccess
          ? { status: 'waitlisted' }
          : mail.status === 'sent' ? { status: 'sent', provider: mail.provider }
          : mail.status === 'queued' ? { status: 'queued', provider: mail.provider }
          : mail.status === 'failed' ? { status: 'failed', error: mail.error }
          : { status: 'skipped' }
        notified = await sendAdminNotification({ ...clean, created, delivery }).then(() => 'sent').catch(e => `failed: ${e.message}`)
      } else {
        if (grantAccess) {
          const r = await grantAndSend(clean)
          accessUrl = r.accessUrl
          mail = { status: 'failed', provider: null, error: 'no mailer configured (dev fallback link shown)' }
        }
        console.warn('[email] RESEND_API_KEY not set — skipping emails')
      }

      console.log(`[beta] ${created ? 'created' : 'updated'} id=${lead.id} grant=${grantAccess} mail=${mail.status} waitlist=${waitlistSent} notify=${notified}`)
      res.status(created ? 201 : 200).json({
        ok: true, granted: grantAccess,
        mail, access: mail.status, waitlist: waitlistSent, notified,
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
      const wait = resendCooldown(email)
      if (wait > 0) {
        return res.status(429).json({ error: 'Resend cooldown active', retryAfter: wait })
      }
      const lead = await findLeadByEmail(email)
      let accessUrl = null
      let mail = { status: 'skipped', provider: null, error: null }
      if (lead && (lead.status === 'invited' || lead.status === 'active')) {
        if (resendConfigured()) {
          const r = await grantAndSend({ name: lead.name, email })
          mail = { status: r.emailSent ? 'sent' : (r.queued ? 'queued' : 'failed'), provider: r.provider || null, error: r.error || null }
          if (!r.emailSent) accessUrl = r.accessUrl
        } else {
          // No mailer (local dev): mint + return the link so sign-in works offline.
          const r = await grantAndSend({ name: lead.name, email })
          accessUrl = r.accessUrl
          mail = { status: 'failed', provider: null, error: 'no mailer configured (dev fallback link shown)' }
        }
      } else if (lead && resendConfigured()) {
        await sendBetaConfirmation({ name: lead.name, email }).catch(() => {})
      }
      // Always respond the same (don't reveal whether the email exists)
      res.json({ ok: true, mail, ...(accessUrl ? { accessUrl } : {}) })
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

  // ---- break-glass + mail ops + Telegram pairing ----
  // Emergency one-time login URL. Disabled unless BREAK_GLASS=1, 5-minute
  // TTL, single-use (markLogin nulls on verify), fully audited. This is the
  // H0 answer to "no email arrives and no DNS can change".
  app.post('/api/admin/mint', adminLimiter, requireAdmin, async (req, res) => {
    if (process.env.BREAK_GLASS !== '1') {
      return res.status(403).json({ error: 'Break-glass minting is disabled (set BREAK_GLASS=1 to enable)' })
    }
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' })
      const lead = await findLeadByEmail(email)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      const token = generateAccessToken()
      await approveLead({ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 5 * 60000) })
      const accessUrl = `${config.publicApiUrl}/api/access/verify?token=${encodeURIComponent(token)}`
      console.log(`[admin] break-glass mint email=${email} by=${req.ip}`)
      res.json({ ok: true, accessUrl, expiresIn: 300 })
    } catch (e) {
      console.error('[admin/mint] error:', e.message)
      res.status(500).json({ error: 'Mint failed' })
    }
  })

  app.get('/api/admin/mail', adminLimiter, requireAdmin, (_req, res) => {
    res.json({ status: queueStatus(), dead: deadList(), suppression: suppressionList(), events: eventLog().slice(-50) })
  })

  app.post('/api/admin/mail/replay', adminLimiter, requireAdmin, (req, res) => {
    const job = replayJob(req.body?.id)
    if (!job) return res.status(404).json({ error: 'Dead job not found' })
    console.log(`[admin] mail replay id=${job.id} by=${req.ip}`)
    res.json({ ok: true, job })
  })

  app.post('/api/admin/mail/suppress', adminLimiter, requireAdmin, (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase()
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' })
    if (req.body?.clear) {
      unsuppress(email)
      console.log(`[admin] unsuppress email=${email} by=${req.ip}`)
    } else {
      suppress(email, str(req.body?.reason, 120) || 'manual')
      console.log(`[admin] suppress email=${email} by=${req.ip}`)
    }
    res.json({ ok: true })
  })

  // Telegram pairing code for the signed-in lead (bot token required server-side).
  app.get('/api/telegram/pair', requireAuth, async (req, res) => {
    try {
      const code = await issuePairingCode(req.session.email)
      res.json({ ok: true, code })
    } catch {
      res.status(500).json({ error: 'Pairing unavailable' })
    }
  })

  // Hourly expiry-nudge sweep: fresh single-use links for links dying <24h out.
  registerSweep('expiry-nudge', 3600000, async () => {
    const leads = await findExpiringLeads(24)
    for (const lead of leads.slice(0, 20)) {
      try {
        const token = generateAccessToken()
        await approveLead({ email: lead.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.tokenTtlDays * 86400000) })
        const accessUrl = `${config.publicApiUrl}/api/access/verify?token=${encodeURIComponent(token)}`
        enqueue({
          type: 'nudge', to: lead.email,
          payload: { name: lead.name, accessUrl, ttl: '24 hours', lang: 'en' },
          dedupeKey: `nudge:${String(lead.email).toLowerCase()}:${new Date().toISOString().slice(0, 10)}`,
        })
      } catch (e) {
        console.warn('[sweep:nudge] failed for lead:', lead.id, e.message)
      }
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
 * Mint an access token, mark the lead invited, deliver the magic link.
 *
 * Delivery runs through the mail queue (Gmail own-SMTP → Resend →
 * file-log). For honest request-time status we attempt one synchronous send
 * (8s budget); on failure the job is enqueued for background retries and the
 * caller decides link visibility (failed ⇒ surfaced, never silent).
 */
async function grantAndSend({ name, email, lang = 'en' }) {
  const token = generateAccessToken()
  const expiresAt = new Date(Date.now() + config.tokenTtlDays * 86400000)
  await approveLead({ email, tokenHash: hashToken(token), expiresAt })
  // PUBLIC_API_URL -> APP_URL -> default: points the magic link at the API origin.
  const accessUrl = `${config.publicApiUrl}/api/access/verify?token=${encodeURIComponent(token)}`
  const ttl = config.tokenTtlDays >= 1 ? `${config.tokenTtlDays} days` : `${Math.round(config.tokenTtlDays * 24)} hours`
  const payload = { name, accessUrl, ttl, lang }
  try {
    const r = await trySendNow({ id: `direct-${token.slice(0, 8)}`, type: 'access', to: email, payload, attempts: 0 })
    const sent = r.provider !== 'filelog'
    if (!sent) {
      enqueue({ type: 'access', to: email, payload, dedupeKey: `invite:${email.toLowerCase()}:${new Date().toISOString().slice(0, 10)}` })
    }
    return { accessUrl, emailSent: sent, queued: !sent, provider: r.provider, error: sent ? null : 'no configured sender delivered (dev/file fallback shown)' }
  } catch (e) {
    let queued = false
    try {
      enqueue({ type: 'access', to: email, payload, dedupeKey: `invite:${email.toLowerCase()}:${new Date().toISOString().slice(0, 10)}` })
      queued = true
    } catch (qe) {
      console.warn('[queue] enqueue failed:', qe.message)
    }
    return { accessUrl, emailSent: false, queued, provider: null, error: String(e?.message || e).slice(0, 200) }
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
