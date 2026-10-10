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
  countByStatus, findExpiringLeads, oldestPending,
  mintApiKey, findApiKey, touchApiKey, listApiKeys, revokeApiKey,
  persistSession, findSession, listSessions, revokeSession, findSessionByPrefix,
} from './db.js'
import {
  sendAdminNotification, resendConfigured,
} from './email.js'
import { analyzeDamageAndPolicy, generateReport, askPolicy } from './openai.js'
import { localAnalyze, localAsk, localReport } from './engine.js'
import { buildDocx, exportFilename } from './docx.js'
import {
  generateAccessToken, hashToken, createSession, verifySession,
  parseCookies, sessionCookie, clearSessionCookie, safeEqual, cookieName,
  sessionSid,
} from './auth.js'
import {
  enqueue, registerSweep, queueStatus, deadList, replayJob,
  suppress, unsuppress, suppressionList, eventLog, pruneStale,
} from './queue.js'
import { trySendNow } from './send.js'
import { issuePairingCode, telegramEnabled } from './telegram.js'
import { mailEnv } from './mailer.js'

// The live sender is Gmail SMTP, not Resend: gate generic mail flows on
// either credential set, never on the Resend key alone.
const mailConfigured = () => Boolean(mailEnv().user && mailEnv().pass) || resendConfigured()

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
    checkSession(req).then((id) => {
      if (!id) return res.status(401).json({ error: 'Access required. Request a beta invite to continue.' })
      req.auth = id
      next()
    }).catch(next)
  }

  // Session identity: HMAC validity + lead status + server-side registry.
  // Pre-registry sessions are adopted on first sight so nobody is logged out
  // by the upgrade; revoked rows fail closed immediately.
  async function checkSession(req) {
    if (!req.session) return null
    const raw = parseCookies(req.headers.cookie)[cookieName()]
    const sid = raw ? sessionSid(raw) : null
    if (sid) {
      const row = await findSession(sid).catch(() => null)
      if (!row) {
        await persistSession({ sid, leadId: req.session.id, email: req.session.email, exp: req.session.exp }).catch(() => {})
      } else if (row.revoked_at || row.revokedAt) {
        return null
      }
    }
    const lead = await findLeadByEmail(req.session.email || '').catch(() => null)
    if (!lead || (lead.status !== 'invited' && lead.status !== 'active')) return null
    return { type: 'session', email: lead.email, id: lead.id }
  }

  // API-key identity (TPA/headless): x-api-key header, hashed at rest.
  async function checkApiKey(req) {
    const key = req.get('x-api-key') || ''
    if (!key) return null
    const row = await findApiKey(key).catch(() => null)
    if (!row) return null
    touchApiKey(row.id).catch(() => {})
    return { type: 'key', email: row.lead_email, id: `key:${row.id}`, name: row.name }
  }

  function requireAuthOrKey(req, res, next) {
    checkApiKey(req).then((k) => {
      if (k) {
        req.auth = k
        return next()
      }
      requireAuth(req, res, next)
    }).catch(next)
  }

  function requireAdmin(req, res, next) {
    const secret = req.get('x-admin-secret') || ''
    if (config.adminSecret && safeEqual(secret, config.adminSecret)) return next()
    // Owner session gate: the CONTACT_EMAIL session is admin without the
    // header secret, so a future admin UI never needs the secret in-browser.
    if (req.session && config.contactEmail &&
        String(req.session.email || '').toLowerCase() === String(config.contactEmail).toLowerCase()) {
      return next()
    }
    return res.status(401).json({ error: 'unauthorized' })
  }

  // ---- health ----
  app.get('/api/health', (_req, res) => {
    const cfg = mailEnv()
    const lastMail = [...eventLog()].reverse().find(e => e.ev === 'sent' || e.ev === 'dead' || e.ev === 'breaker-open')
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
      mail: {
        gmailCreds: Boolean(cfg.user && cfg.pass),
        telegram: telegramEnabled(),
        queue: queueStatus(),
        last: lastMail ? { ev: lastMail.ev, type: lastMail.type, at: lastMail.at } : null,
      },
    })
  })

  // ---- auth session ----
  app.get('/api/auth/me', noStore, (req, res) => {
    res.json({ authorized: Boolean(req.session), email: req.session?.email || null })
  })

  app.post('/api/auth/logout', (req, res) => {
    try {
      const raw = parseCookies(req.headers.cookie)[cookieName()]
      const sid = raw ? sessionSid(raw) : null
      if (sid) revokeSession(sid).catch(() => {})
    } catch { /* logout never fails on bookkeeping */ }
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.json({ ok: true })
  })

  // ---- own sessions: list + remote revoke ----
  app.get('/api/auth/sessions', requireAuth, async (req, res) => {
    const raw = parseCookies(req.headers.cookie)[cookieName()]
    const current = raw ? sessionSid(raw) : null
    const rows = await listSessions(req.session.email)
    res.json({ sessions: rows.map(r => ({ ...r, current: Boolean(current && current.startsWith(r.sid)) })) })
  })

  app.post('/api/auth/sessions/revoke', requireAuth, async (req, res) => {
    try {
      const raw = parseCookies(req.headers.cookie)[cookieName()]
      const current = raw ? sessionSid(raw) : null
      if (req.body?.all) {
        const rows = await listSessions(req.session.email)
        let n = 0
        for (const r of rows) {
          // listSessions returns truncated sid prefixes; match by prefix.
          const full = await findSessionByPrefix(req.session.email, r.sid).catch(() => null)
          if (full && full !== current && await revokeSession(full, req.session.email).catch(() => false)) n += 1
        }
        return res.json({ ok: true, revoked: n })
      }
      const sid = str(req.body?.sid, 200)
      if (!sid) return res.status(400).json({ error: 'sid is required' })
      // Resolve prefix → full sid server-side; never trust blind prefixes alone.
      const full = await findSessionByPrefix(req.session.email, sid).catch(() => null)
      if (!full) return res.status(404).json({ error: 'Session not found' })
      await revokeSession(full, req.session.email)
      res.json({ ok: true })
    } catch {
      res.status(500).json({ error: 'Revoke failed' })
    }
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
      const signed = createSession(lead.id, lead.email)
      await persistSession({
        sid: sessionSid(signed),
        leadId: lead.id,
        email: lead.email,
        exp: JSON.parse(Buffer.from(signed.split('.')[0], 'base64url').toString()).exp,
      }).catch(() => {})
      res.setHeader('Set-Cookie', sessionCookie(signed))
      res.redirect(`${config.appUrl}/?access=ok`)
    } catch (e) {
      console.error('[access] verify error:', e)
      res.redirect(`${config.appUrl}/?access=error`)
    }
  })

  // ---- beta signup (auto-approves until the cap) ----
  app.post('/api/beta', betaLimiter, async (req, res) => {
    try {
      const { name, email, role, claims, source, lang, company, volume, budget, pilot } = req.body || {}
      const clean = {
        name: str(name, 120),
        email: str(email, 200).toLowerCase(),
        role: str(role, 60),
        claimsPerMonth: str(claims, 20),
        source: str(source, 60) || 'themis-beta',
        lang: lang === 'ms' ? 'ms' : 'en',
        company: str(company, 120),
        volume: str(volume, 20),
        budget: str(budget, 40),
        pilot: pilot === true || pilot === 'yes' ? 'yes' : '',
      }
      if (!clean.name) return res.status(400).json({ error: 'A name is required', code: 'badName' })
      if (!isEmail(clean.email)) {
        return res.status(400).json({ error: 'A valid email is required', code: 'badEmail' })
      }

      const { lead, created } = await saveBetaLead(clean)

      const invitedSoFar = await countInvited()
      const grantAccess = invitedSoFar < config.betaLimit

      let mail = { status: 'skipped', provider: null, error: null }
      let waitlistSent = 'skipped'
      let notified = 'skipped'
      let accessUrl = null

      if (mailConfigured()) {
        if (grantAccess) {
          const r = await grantAndSend({ ...clean, lang: clean.lang })
          mail = { status: r.emailSent ? 'sent' : (r.queued ? 'queued' : 'failed'), provider: r.provider || null, error: r.error || null }
          // Honest rule (lockout postmortem): the link is returned whenever
          // delivery did NOT confirm — never a silent "check your inbox".
          if (!r.emailSent) accessUrl = r.accessUrl
        } else {
          try {
            const w = await trySendNow({ id: `direct-waitlist-${Date.now()}`, type: 'waitlist', to: clean.email, payload: { name: clean.name, lang: clean.lang }, attempts: 0 })
            waitlistSent = w.provider === 'filelog' ? 'logged' : 'sent'
          } catch (e) {
            waitlistSent = `failed: ${String(e?.message || e).slice(0, 120)}`
            try {
              enqueue({ type: 'waitlist', to: clean.email, payload: { name: clean.name, lang: clean.lang }, dedupeKey: `waitlist:${clean.email}:${new Date().toISOString().slice(0, 10)}` })
            } catch { /* caps/full — logged above */ }
          }
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
        return res.status(400).json({ error: 'A valid email is required', code: 'badEmail' })
      }
      const wait = resendCooldown(email)
      if (wait > 0) {
        return res.status(429).json({ error: 'Resend cooldown active', retryAfter: wait })
      }
      const lead = await findLeadByEmail(email)
      let accessUrl = null
      let mail = { status: 'skipped', provider: null, error: null }
      if (lead && (lead.status === 'invited' || lead.status === 'active')) {
        const leadLang = lead.lang === 'ms' ? 'ms' : 'en'
        if (mailConfigured()) {
          const r = await grantAndSend({ name: lead.name, email, lang: leadLang })
          mail = { status: r.emailSent ? 'sent' : (r.queued ? 'queued' : 'failed'), provider: r.provider || null, error: r.error || null }
          if (!r.emailSent) accessUrl = r.accessUrl
        } else {
          // No mailer (local dev): mint + return the link so sign-in works offline.
          const r = await grantAndSend({ name: lead.name, email, lang: leadLang })
          accessUrl = r.accessUrl
          mail = { status: 'failed', provider: null, error: 'no mailer configured (dev fallback link shown)' }
        }
      } else if (lead && mailConfigured()) {
        try {
          await trySendNow({ id: `direct-confirm-${Date.now()}`, type: 'confirm', to: email, payload: { name: lead.name, lang: lead.lang === 'ms' ? 'ms' : 'en' }, attempts: 0 })
        } catch { /* confirmation is best-effort; resend stays neutral */ }
      }
      // Always respond the same (don't reveal whether the email exists)
      res.json({ ok: true, mail, ...(accessUrl ? { accessUrl } : {}) })
    } catch (e) {
      console.error('[beta/resend] error:', e)
      res.status(500).json({ error: 'Could not resend' })
    }
  })

  // ---- client error beacon (Tier 4 observability): same-origin, tiny,
  // rate-limited, PII-scrubbed client-side. Never trust or log it raw.
  app.post('/api/client-log', apiLimiter, (req, res) => {
    try {
      const level = req.body?.level === 'warn' ? 'warn' : 'error'
      const msg = String(req.body?.msg || '').slice(0, 300)
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
      const path = String(req.body?.path || '').slice(0, 120)
      if (msg) console.warn(`[client:${level}] ${path} :: ${msg}`)
    } catch { /* never fail logging */ }
    res.json({ ok: true })
  })

  // ---- gated AI endpoints ----
  // 8MB per image (base64 inflates ~33%, so ~10.6M chars is the wire ceiling).
  const MAX_IMAGE_B64 = 11_000_000
  app.post('/api/analyze', noStore, analyzeLimiter, requireAuthOrKey, async (req, res) => {
    try {
      if (!checkDailyCap(req.auth?.id ?? req.session?.id ?? 'anon')) {
        return res.status(429).json({ error: `Daily analysis limit reached (${config.dailyAnalysisCap}/day). Try again tomorrow.` })
      }
      const { images, policyText, damageNotes } = req.body || {}
      const imgs = Array.isArray(images) ? images : []
      const notes = str(damageNotes, 4000)
      if (imgs.length === 0 && !notes) {
        return res.status(400).json({ error: 'At least one image or a damage description is required', code: 'needInput' })
      }
      if (imgs.length > 12) return res.status(400).json({ error: 'Too many images (max 12)', code: 'tooMany' })
      for (const img of imgs) {
        if (!img?.base64 || !img?.type) return res.status(400).json({ error: 'Malformed image payload', code: 'malformed' })
        if (String(img.base64).length > MAX_IMAGE_B64) return res.status(400).json({ error: 'Image too large (max ~8 MB per image)', code: 'tooLargeImg' })
        if (!looksLikeImage(img.base64)) return res.status(400).json({ error: 'Unsupported image encoding (JPEG, PNG, GIF, or WebP required)', code: 'badEncoding' })
        if (bufferHasEicar(img.base64)) return res.status(400).json({ error: 'File blocked by the malware screen', code: 'malware' })
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

  app.post('/api/report', noStore, apiLimiter, requireAuthOrKey, async (req, res) => {
    try {
      const { analysis, lang } = req.body || {}
      if (!analysis) return res.status(400).json({ error: 'analysis is required', code: 'noAnalysis' })
      const reportLang = lang === 'ms' ? 'ms' : 'en'
      const markdown = config.usesOpenAI()
        ? await generateReport(analysis)
        : localReport(analysis, reportLang)
      res.json({ markdown })
    } catch (e) {
      console.error('[report] error:', e.message)
      res.status(500).json({ error: 'Report generation failed. Please try again.' })
    }
  })

  app.post('/api/ask', noStore, apiLimiter, requireAuthOrKey, async (req, res) => {
    try {
      const { policyText, question, history } = req.body || {}
      const q = str(question, 1200)
      if (!q) return res.status(400).json({ error: 'question is required', code: 'noQuestion' })
      if (policyText && policyText.length > 40000) {
        return res.status(400).json({ error: 'policy text is too large (max 40,000 characters)', code: 'policyTooLarge' })
      }
      const args = {
        policyText: str(policyText, 40000),
        question: q,
        history: Array.isArray(history) ? history.slice(-6) : [],
        lang: req.body?.lang === 'ms' ? 'ms' : 'en',
      }
      const response = config.usesOpenAI() ? await askPolicy(args) : localAsk(args)
      res.json({ response })
    } catch (e) {
      console.error('[ask] error:', e.message)
      res.status(500).json({ error: 'Question failed. Please try again.' })
    }
  })

  app.post('/api/export/docx', apiLimiter, requireAuthOrKey, async (req, res) => {
    try {
      const { markdown, analysis, lang } = req.body || {}
      if (!markdown && !analysis) return res.status(400).json({ error: 'nothing to export', code: 'nothingExport' })
      const format = ['standard', 'compact', 'itemized'].includes(req.body?.format) ? req.body.format : 'standard'
      const buf = await buildDocx({ markdown: str(markdown, 60000), analysis: analysis || null, lang: lang === 'ms' ? 'ms' : 'en', format })
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
      if (mailConfigured()) await grantAndSend({ name: lead.name, email })
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
      // A freed slot auto-promotes the oldest waitlisted lead so the cap
      // never strands pending signups with no path forward.
      let promoted = null
      try {
        if ((await countInvited()) < config.betaLimit) {
          // Never re-promote the address just revoked in this same call.
          const next = await oldestPending(email)
          if (next) {
            const r = await grantAndSend({ name: next.name, email: next.email, lang: next.lang || 'en' })
            promoted = { email: next.email, sent: r.emailSent }
          }
        }
      } catch (e) {
        console.warn('[admin] waitlist promotion failed:', e.message)
      }
      // Neutral response either way: with a valid admin secret the caller
      // already passed the gate; nothing about other users leaks here.
      res.json({ ok: true, ...(promoted ? { promoted } : {}) })
    } catch (e) {
      console.error('[admin/revoke] error:', e.message)
      res.status(500).json({ error: 'Revoke failed' })
    }
  })

  // ---- break-glass + mail ops + Telegram pairing ----
  // ---- TPA API keys (headless access; hashed at rest, shown once) ----
  app.post('/api/admin/keys', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const email = str(req.body?.email, 200).toLowerCase()
      const name = str(req.body?.name, 80) || 'default'
      if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' })
      const lead = await findLeadByEmail(email)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      const { key } = await mintApiKey({ email, name })
      console.log(`[admin] key mint email=${email} by=${req.ip}`)
      res.json({ ok: true, key })
    } catch (e) {
      console.error('[admin/keys] error:', e.message)
      res.status(500).json({ error: 'Mint failed' })
    }
  })

  app.get('/api/admin/keys', adminLimiter, requireAdmin, async (req, res) => {
    const email = str(req.query?.email, 200).toLowerCase()
    res.json({ keys: email ? await listApiKeys(email) : [] })
  })

  app.post('/api/admin/keys/revoke', adminLimiter, requireAdmin, async (req, res) => {
    const ok = await revokeApiKey(Number(req.body?.id), req.body?.email ? str(req.body.email, 200) : null)
      .catch(() => false)
    if (!ok) return res.status(404).json({ error: 'Key not found' })
    console.log(`[admin] key revoke id=${req.body?.id} by=${req.ip}`)
    res.json({ ok: true })
  })
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
      if (!telegramEnabled()) {
        return res.status(503).json({ error: 'Telegram channel not configured', code: 'telegramDisabled' })
      }
      const code = await issuePairingCode(req.session.email)
      res.json({ ok: true, code, bot: config.mail.telegramBotName || null })
    } catch {
      res.status(500).json({ error: 'Pairing unavailable' })
    }
  })

  // Hourly expiry-nudge sweep: fresh single-use links for links dying <24h out.
  registerSweep('expiry-nudge', 3600000, async () => {    const leads = await findExpiringLeads(24)
    for (const lead of leads.slice(0, 20)) {
      try {
        const token = generateAccessToken()
        await approveLead({ email: lead.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.tokenTtlDays * 86400000) })
        const accessUrl = `${config.publicApiUrl}/api/access/verify?token=${encodeURIComponent(token)}`
        const lang = lead.lang === 'ms' ? 'ms' : 'en'
        enqueue({
          type: 'nudge', to: lead.email,
          payload: { name: lead.name, accessUrl, ttl: lang === 'ms' ? '24 jam' : '24 hours', lang },
          dedupeKey: `nudge:${String(lead.email).toLowerCase()}:${new Date().toISOString().slice(0, 10)}`,
        })
      } catch (e) {
        console.warn('[sweep:nudge] failed for lead:', lead.id, e.message)
      }
    }
  })

  // Daily owner digest: counts by status so deliverability gets watched
  // without anyone polling the admin API.
  registerSweep('daily-digest', 24 * 3600 * 1000, async () => {
    try {
      const counts = await countByStatus()
      const date = new Date().toISOString().slice(0, 10)
      enqueue({
        type: 'digest', to: config.contactEmail,
        payload: { name: 'Owner', date, counts, lang: 'en' },
        dedupeKey: `digest:${date}`,
      })
    } catch (e) {
      console.warn('[sweep:digest] failed:', e.message)
    }
  })

  // Daily hygiene: prune TTL maps (queue) so single-process memory is bounded.
  registerSweep('prune-stale', 24 * 3600 * 1000, async () => {
    try {
      pruneStale()
    } catch (e) {
      console.warn('[sweep:prune] failed:', e.message)
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
  const ttl = config.tokenTtlDays >= 1
    ? (lang === 'ms' ? `${config.tokenTtlDays} hari` : `${config.tokenTtlDays} days`)
    : (lang === 'ms' ? `${Math.round(config.tokenTtlDays * 24)} jam` : `${Math.round(config.tokenTtlDays * 24)} hours`)
  const payload = { name, accessUrl, ttl, lang }
  try {
    const r = await trySendNow({ id: `direct-${token.slice(0, 8)}`, type: 'access', to: email, payload, attempts: 0 })
    // filelog "success" means durably logged, not emailed: surface the link,
    // do NOT enqueue a duplicate that would only re-log the same content.
    if (r.provider === 'filelog') {
      return { accessUrl, emailSent: false, queued: false, provider: 'filelog', error: 'no configured sender delivered (dev/file fallback shown)' }
    }
    return { accessUrl, emailSent: true, provider: r.provider, queued: false, error: null }
  } catch (e) {
    let queued = false
    try {
      // Token-scoped dedupe: retries of THIS link only, never a second
      // distinct job for the same address that could double-send.
      enqueue({ type: 'access', to: email, payload, dedupeKey: `invite:${email.toLowerCase()}:${token.slice(0, 8)}` })
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

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
function bufferHasEicar(b64) {
  try {
    return Buffer.from(String(b64 || '').split(',').slice(-1)[0], 'base64').toString('latin1').includes(EICAR)
  } catch {
    return false
  }
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
