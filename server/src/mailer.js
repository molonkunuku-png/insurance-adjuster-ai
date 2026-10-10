/**
 * Own SMTP sending engine ("same engine, different code").
 *
 * Speaks SMTP submission directly with Node stdlib (net/tls/crypto) —
 * no nodemailer, no paid service. Gmail relay (587/STARTTLS or 465/SSL
 * with an App Password) needs no verified domain, which is exactly the
 * Resend test-mode trap that locked the owner out.
 *
 * Direct MX over port 25 is deliberately NOT attempted: cloud egress
 * throttles it, so any attempt would only burn time and reputation.
 */
import net from 'net'
import tls from 'tls'
import crypto from 'crypto'
import { appendFile, mkdir, stat, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { config } from './config.js'

export const mailEnv = () => ({
  provider: config.mail.provider,
  enabled: config.mail.enabled,
  host: config.mail.host,
  port: config.mail.port,
  user: config.mail.user,
  pass: config.mail.pass,
  from: config.mail.from,
  fromName: config.mail.fromName,
  dkimDomain: config.mail.dkimDomain,
  dkimSelector: config.mail.dkimSelector,
  dkimKey: config.mail.dkimKey,
  // Test-only plaintext escape hatch. Forcibly off in production: credentials
  // must never traverse the wire unencrypted outside a local dummy server.
  allowPlain: config.mail.allowPlain,
  connectMs: 10000,
  cmdMs: 15000,
  dataMs: 30000,
  totalMs: 60000,
})

const withDeadline = (promise, ms, phase) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`smtp-timeout:${phase}`)), ms)),
  ])

/** Minimal SMTP submission client. One connection, one mail, sequential commands. */
export class SmtpClient {
  constructor(opts) {
    // allowPlain defaults from config (forced off in prod); tests pass it
    // explicitly since config snapshots env at import time.
    this.o = { allowPlain: false, ...opts }
    this.sock = null
    this.buf = ''
    this.waiters = []
  }

  _onData(chunk) {
    this.buf += chunk.toString('utf8')
    const lines = this.buf.split('\r\n')
    this.buf = lines.pop()
    for (const line of lines) {
      const m = /^(\d{3})([ -])/.exec(line)
      if (!m) continue
      this.pending = (this.pending || []).concat(line)
      if (m[2] === ' ') {
        const block = this.pending
        this.pending = []
        const w = this.waiters.shift()
        if (w) w(block)
      }
      // Hyphen lines accumulate until the final "250 <text>" line.
    }
  }

  _code(block) {
    const last = block[block.length - 1] || ''
    return parseInt(last.slice(0, 3), 10)
  }

  _text(block) {
    return block.map(l => l.slice(4)).join('\n')
  }

  _cmd(sock, text, ms) {
    return withDeadline(new Promise((resolve, reject) => {
      this.waiters.push((block) => {
        const code = this._code(block)
        if (code < 200 || code >= 400) reject(new Error(`smtp-${code}:${this._text(block).slice(0, 160)}`))
        else resolve(block)
      })
      sock.write(`${text}\r\n`, (err) => { if (err) reject(err) })
    }), ms, text.split(' ')[0])
  }

  async _greet(sock) {
    const block = await withDeadline(new Promise((resolve, reject) => {
      this.waiters.push(resolve)
      sock.once('error', reject)
    }), this.o.connectMs, 'greet')
    if (this._code(block) !== 220) throw new Error(`smtp-greet:${this._text(block).slice(0, 80)}`)
  }

  async _ehlo(sock, host) {
    const block = await withDeadline(new Promise((resolve, reject) => {
      this.waiters.push(resolve)
      sock.write(`EHLO ${host}\r\n`, (err) => { if (err) reject(err) })
    }), this.o.cmdMs, 'EHLO')
    if (this._code(block) !== 250) throw new Error(`smtp-ehlo:${this._text(block).slice(0, 80)}`)
    return this._text(block)
  }

  async send({ from, to, subject, text, html, headers = {}, dkim = null }) {
    const o = this.o
    const deadline = Date.now() + o.totalMs
    const left = () => Math.max(1000, deadline - Date.now())
    const sock = o.port === 465
      ? tls.connect({ host: o.host, port: o.port, servername: o.host, minVersion: 'TLSv1.2' })
      : net.createConnection({ host: o.host, port: o.port })
    this.sock = sock
    sock.setTimeout(o.connectMs)
    sock.on('data', (c) => this._onData(c))
    sock.on('error', () => {
      // Fail any pending command so sends never hang silently on RST.
      const ws = this.waiters.splice(0)
      for (const w of ws) w(['000 connection lost'])
    })
    try {
      await this._greet(sock)
      const host = (process.env.APP_URL || 'https://insurance-adjuster-ai1.onrender.com').replace(/^https?:\/\//, '').split('/')[0] || 'localhost'
      let exts = await this._ehlo(sock, host)
      // Test-only escape hatch (constructor opt, forced off in production
      // config): skip TLS against a local dummy server. Never set outside tests.
      const allowPlain = Boolean(this.o.allowPlain)
      if (o.port !== 465 && !allowPlain) {
        if (!/STARTTLS/i.test(exts)) throw new Error('smtp-no-starttls')
        await this._cmd(sock, 'STARTTLS', Math.min(o.cmdMs, left()))
        sock.removeAllListeners('data')
        this.buf = ''
        this.waiters = []
        await withDeadline(new Promise((resolve, reject) => {
          const secured = tls.connect({ socket: sock, servername: o.host, minVersion: 'TLSv1.2' }, () => resolve(secured))
          secured.once('error', reject)
        }), Math.min(o.cmdMs, left()), 'tls-upgrade').then((secured) => {
          this.sock = secured
          secured.on('data', (c) => this._onData(c))
          secured.setTimeout(o.cmdMs)
        })
        exts = await this._ehlo(this.sock, host)
      }
      const s = this.sock
      // AUTH PLAIN preferred, LOGIN fallback — never before TLS on 587.
      if (/AUTH.*PLAIN/i.test(exts)) {
        const token = Buffer.from(`\0${o.user}\0${o.pass}`).toString('base64')
        await this._cmd(s, `AUTH PLAIN ${token}`, Math.min(o.cmdMs, left()))
      } else if (/AUTH.*LOGIN/i.test(exts)) {
        await this._cmd(s, 'AUTH LOGIN', Math.min(o.cmdMs, left()))
        await this._cmd(s, Buffer.from(o.user).toString('base64'), Math.min(o.cmdMs, left()))
        await this._cmd(s, Buffer.from(o.pass).toString('base64'), Math.min(o.cmdMs, left()))
      } else {
        throw new Error('smtp-no-auth')
      }
      await this._cmd(s, `MAIL FROM:<${from}>`, Math.min(o.cmdMs, left()))
      await this._cmd(s, `RCPT TO:<${to}>`, Math.min(o.cmdMs, left()))
      await this._cmd(s, 'DATA', Math.min(o.cmdMs, left()))
      const mime = buildMime({ from, fromName: o.fromName, to, subject, text, html, headers, dkim })
      await withDeadline(new Promise((resolve, reject) => {
        s.write(mime, (err) => { if (err) reject(err); else resolve() })
      }), Math.min(o.dataMs, left()), 'data-xmit')
      const done = await this._cmd(s, '.', Math.min(o.dataMs, left()))
      try { await this._cmd(s, 'QUIT', 5000) } catch { /* close anyway */ }
      const lastLine = done[done.length - 1] || ''
      const id = /250[^\n]*id=([^\s;]+)/i.exec(lastLine)?.[1] || null
      return { ok: true, provider: 'smtp', messageId: id }
    } finally {
      try { this.sock?.destroy() } catch { /* ignore */ }
      this.sock = null
      this.waiters = []
      this.buf = ''
    }
  }
}

/** Quoted-printable encoder that folds at 76 chars (RFC 2045 §6.7). */
const qp = (s) => {
  const bytes = Buffer.from(String(s || ''), 'utf8')
  let out = ''
  let line = ''
  const push = (tok) => {
    if ((line + tok).length > 75) {
      // Never break inside an =XX triplet and never leave trailing space bare.
      out += `${line}=\r\n`
      line = ''
    }
    line += tok
  }
  for (const b of bytes) {
    const t = (b >= 33 && b <= 126 && b !== 61)
      ? String.fromCharCode(b)
      : `=${b.toString(16).toUpperCase().padStart(2, '0')}`
    push(t)
  }
  // A trailing space/tab must be encoded, not left bare at line end.
  line = line.replace(/[ \t]$/, (c) => `=${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return out + line
}

const rfc2047 = (s) => /[^\x20-\x7E]/.test(String(s || ''))
  ? `=?UTF-8?B?${Buffer.from(String(s), 'utf8').toString('base64')}?=`
  : String(s || '')

/** Relaxed/simple DKIM-SHA256 signer. No DNS benefit until the TXT publishes. */
export function dkimSign({ domain, selector, key, from, to, subject, date, messageId, body }) {
  const h = (n, v) => `${n.toLowerCase()}:${String(v).replace(/\s+/g, ' ').trim()}`
  const headers = [h('from', from), h('to', to), h('subject', subject), h('date', date), h('message-id', messageId)]
  const canon = headers.join('\r\n')
  const bodyHash = crypto.createHash('sha256').update(`${String(body || '').replace(/\r?\n/g, '\r\n')}\r\n`).digest('base64')
  const sigT = `v=1; a=rsa-sha256; c=relaxed/simple; d=${domain}; s=${selector}; t=${Math.floor(Date.now() / 1000)}; bh=${bodyHash}; h=from:to:subject:date:message-id; b=`
  const tagLine = `dkim-signature:${sigT} `
  const s2 = crypto.createSign('RSA-SHA256')
  s2.update(`${canon}\r\n${tagLine.trim()}`)
  const sig = s2.sign(key, 'base64')
  return `DKIM-Signature: ${sigT}${sig.replace(/(.{1,72})/g, '$1\r\n ')}`.trim()
}

export function buildMime({ from, fromName, to, subject, text, html, headers = {}, dkim = null }) {
  const boundary = `themis-${crypto.randomBytes(12).toString('hex')}`
  const date = new Date().toUTCString()
  const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${(process.env.APP_URL || 'themis.local').replace(/^https?:\/\//, '').split('/')[0]}>`
  const head = [
    `From: ${fromName ? `"${fromName.replace(/"/g, '')}" ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${rfc2047(subject)}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ]
  if (dkim?.domain && dkim?.key) {
    try {
      head.push(dkimSign({ domain: dkim.domain, selector: dkim.selector || 'themis', key: dkim.key, from: `<${from}>`, to: `<${to}>`, subject, date, messageId, body: `${text}\n${html}` }))
    } catch (e) {
      console.warn('[dkim] sign failed, sending unsigned:', e.message)
    }
  }
  const parts = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(html),
    '',
    `--${boundary}--`,
    '',
  ]
  // RFC 5321 §4.5.2: dot-stuff any body line beginning with '.' so a lone
  // dot can never truncate the message at the DATA terminator.
  return `${head.join('\r\n')}\r\n${parts.join('\r\n')}`.replace(/^\./gm, '..')
}

/** File-log adapter: durable dev fallback, never sends anywhere. */
export async function fileLogSend({ to, subject, text, template }) {
  const dir = config.mail.outboxDir || join(tmpdir(), 'themis-outbox')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'outbox.log')
  // Bearer tokens must never persist: redact magic-link URLs at write time.
  const safeText = String(text || '').replace(/verify\?token=[^\s"']+/g, 'verify?token=[redacted]').slice(0, 2000)
  const line = JSON.stringify({ at: new Date().toISOString(), to, subject, template, text: safeText })
  await appendFile(file, `${line}\n`)
  // Rotate: keep the log bounded (last ~500 lines) instead of growing forever.
  try {
    const st = await stat(file)
    if (st.size > 1024 * 1024) {
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean).slice(-500)
      await writeFile(file, `${lines.join('\n')}\n`)
    }
  } catch { /* rotation is best-effort */ }
  return { ok: true, provider: 'filelog', path: file }
}

/** Quick TCP dial probe per port (3s each). Never blocks boot. */
export function probePorts(host = null, ports = [25, 587, 465]) {
  const cfg = mailEnv()
  const target = host || cfg.host
  const dial = (port) => new Promise((resolve) => {
    const sock = net.createConnection({ host: target, port, timeout: 3000 })
    sock.once('connect', () => { sock.destroy(); resolve({ port, state: 'open' }) })
    sock.once('timeout', () => { sock.destroy(); resolve({ port, state: 'timeout' }) })
    sock.once('error', (e) => resolve({ port, state: e.code === 'ECONNREFUSED' ? 'refused' : 'filtered' }))
  })
  return Promise.all(ports.map(dial))
}

let probeCache = null
export async function cachedProbe() {
  if (probeCache && Date.now() - probeCache.at < 10 * 60 * 1000) return probeCache.result
  const result = await probePorts()
  probeCache = { at: Date.now(), result }
  return result
}
