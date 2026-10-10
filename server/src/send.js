/**
 * Send dispatcher: routes a queue job across providers with honest errors.
 *
 * Order per plan ruling: Telegram (only if paired) → own SMTP/Gmail →
 * Resend adapter → durable file log. Throws on retryable failures so the
 * queue backs off; throws permanent-marked errors for policy/config dead
 * ends (Resend 403, bad auth) so they land in dead-letter, not retry loops.
 */
import { mailEnv, SmtpClient, fileLogSend } from './mailer.js'
import { sendTemplated } from './email.js'
import { renderTemplate } from './templates.js'
import { pairedChat, sendTelegram, telegramEnabled } from './telegram.js'

const permanent = (msg) => {
  const e = new Error(msg)
  e.permanent = true
  return e
}

async function viaTelegram(job) {
  const pair = pairedChat(job.to)
  if (!pair || !telegramEnabled()) return null
  const t = renderTemplate(job.type, pair.lang, {
    name: job.payload.name || 'there',
    accessUrl: job.payload.accessUrl,
    ttl: job.payload.ttl || '48 hours',
  })
  await sendTelegram(pair.chatId, `${t.subject}\n\n${t.text}`)
  return { ok: true, provider: 'telegram' }
}

async function viaSmtp(job) {
  const cfg = mailEnv()
  if (!cfg.enabled || !cfg.user || !cfg.pass) return null
  const lang = job.payload.lang || 'en'
  const t = renderTemplate(job.type, lang, {
    name: job.payload.name || 'there',
    accessUrl: job.payload.accessUrl,
    ttl: job.payload.ttl || (lang === 'ms' ? '48 jam' : '48 hours'),
  })
  const client = new SmtpClient({
    host: cfg.host, port: cfg.port, user: cfg.user, pass: cfg.pass,
    connectMs: cfg.connectMs, cmdMs: cfg.cmdMs, dataMs: cfg.dataMs, totalMs: cfg.totalMs,
  })
  try {
    return await client.send({
      from: cfg.from || cfg.user,
      to: job.to,
      subject: t.subject,
      text: t.text,
      html: t.html,
      dkim: cfg.dkimDomain && cfg.dkimKey
        ? { domain: cfg.dkimDomain, selector: cfg.dkimSelector, key: cfg.dkimKey }
        : null,
    })
  } catch (e) {
    const msg = String(e?.message || e)
    if (/smtp-(?:5\d\d|no-auth)|EAUTH|535|534/i.test(msg)) throw permanent(`smtp-policy: ${msg.slice(0, 160)}`)
    throw new Error(`smtp-retryable: ${msg.slice(0, 160)}`)
  }
}

async function viaResend(job) {
  // Single source of truth: templates.js renders per payload.lang.
  const t = renderTemplate(job.type, job.payload.lang || 'en', {
    name: job.payload.name || 'there',
    accessUrl: job.payload.accessUrl,
    ttl: job.payload.ttl || '48 hours',
  })
  try {
    await sendTemplated({ to: job.to, subject: t.subject, text: t.text, html: t.html })
    return { ok: true, provider: 'resend' }
  } catch (e) {
    const msg = String(e?.message || e)
    if (/only send testing|testing email|403|verified|policy/i.test(msg)) throw permanent(`resend-policy: ${msg.slice(0, 160)}`)
    throw new Error(`resend-retryable: ${msg.slice(0, 160)}`)
  }
}

export async function sendJob(job) {
  const errors = []
  for (const attempt of [viaTelegram, viaSmtp, viaResend]) {
    try {
      const r = await attempt(job)
      if (r) return r
    } catch (e) {
      errors.push(String(e?.message || e))
      if (e?.permanent || /policy/i.test(String(e?.message || ''))) break
    }
  }
  // Durable file log: the link is never lost even when every sender fails.
  const t = (() => {
    try {
      return renderTemplate(job.type, job.payload.lang || 'en', {
        name: job.payload.name || 'there',
        accessUrl: job.payload.accessUrl,
        ttl: job.payload.ttl || '48 hours',
      })
    } catch { return { subject: job.type, text: JSON.stringify(job.payload).slice(0, 1000) } }
  })()
  await fileLogSend({ to: job.to, subject: t.subject, text: t.text, template: job.type })
  const err = new Error(`all-senders-failed: ${errors.join(' | ').slice(0, 240) || 'no sender configured'}`)
  err.logged = true
  throw err
}

/** Synchronous best-effort attempt for honest request-time status (8s budget). */
export async function trySendNow(job, ms = 8000) {
  return Promise.race([
    sendJob(job),
    new Promise((_, reject) => setTimeout(() => reject(new Error('send-timeout:8s')), ms)),
  ])
}
