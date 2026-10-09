import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

import { config, isProd } from './config.js'
import { saveBetaLead, listBetaLeads, dbMode } from './db.js'
import { sendBetaConfirmation, sendAdminNotification, smtpConfigured } from './email.js'
import { analyzeDamageAndPolicy, generateReport } from './openai.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', '..', 'dist')

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)

  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (config.clientOrigins.includes(origin)) return cb(null, true)
      if (!isProd && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true)
      return cb(new Error(`Origin not allowed: ${origin}`))
    },
  }))

  app.use(express.json({ limit: '30mb' }))

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  const betaLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: dbMode(),
      email: smtpConfigured(),
      openai: Boolean(config.openaiKey),
      env: config.nodeEnv,
    })
  })

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

      let confirmation = 'skipped'
      let notified = 'skipped'
      if (smtpConfigured()) {
        try {
          await sendBetaConfirmation(clean)
          confirmation = 'sent'
        } catch (e) {
          confirmation = `failed: ${e.message}`
          console.error('[email] confirmation failed:', e.message)
        }
        try {
          await sendAdminNotification({ ...clean, created })
          notified = 'sent'
        } catch (e) {
          notified = `failed: ${e.message}`
          console.error('[email] admin notification failed:', e.message)
        }
      } else {
        console.warn('[email] RESEND_API_KEY not set — skipping emails')
      }

      console.log(`[beta] lead ${created ? 'created' : 'updated'} id=${lead.id} email=${clean.email} confirm=${confirmation} notify=${notified}`)
      res.status(created ? 201 : 200).json({ ok: true, id: lead.id, created, confirmation, notified })
    } catch (e) {
      console.error('[beta] error:', e)
      res.status(500).json({ error: 'Could not process request' })
    }
  })

  app.get('/api/beta', apiLimiter, async (_req, res) => {
    try {
      res.json({ leads: await listBetaLeads() })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.post('/api/analyze', apiLimiter, async (req, res) => {
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

  app.post('/api/report', apiLimiter, async (req, res) => {
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

  // Optionally serve the built client (single-service deploy)
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

function str(v, max) {
  if (v === undefined || v === null) return ''
  return String(v).trim().slice(0, max)
}
