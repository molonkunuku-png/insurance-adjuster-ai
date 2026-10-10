/**
 * Mail-engine regression suite — node:test, zero new dependencies:
 *   npm test  (server/)
 *
 * Own SMTP client against a scripted dummy server, MIME/DKIM units,
 * queue idempotency/caps/breaker/dead-letter, template EN/BM parity.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import net from 'net'
import crypto from 'crypto'

import { SmtpClient, buildMime, dkimSign, probePorts } from './mailer.js'
import {
  enqueue, drainOnce, queueStatus, deadList, replayJob,
  suppress, unsuppress, eventLog, __reset, __forceDue,
} from './queue.js'
import { renderTemplate, TEMPLATE_TYPES } from './templates.js'
import { adminNotificationHtml, adminNotificationText } from './email.js'

before(() => { __reset() })

/** Scripted dummy SMTP server. mode: 'ok' | 'rcpt550'. */
function dummyServer(mode = 'ok') {
  const transcript = []
  const server = net.createServer((sock) => {
    sock.write('220 dummy ESMTP ready\r\n')
    let inData = false
    sock.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split('\r\n')
      for (const line of lines) {
        if (!line) continue
        if (inData) {
          if (line === '.') {
            inData = false
            sock.write('250 ok id=test123\r\n')
          }
          continue
        }
        transcript.push(line)
        if (/^EHLO/i.test(line)) {
          sock.write('250-Hello dummy\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n')
        } else if (/^AUTH PLAIN/i.test(line)) sock.write('235 authenticated\r\n')
        else if (/^MAIL FROM/i.test(line)) sock.write('250 sender ok\r\n')
        else if (/^RCPT TO/i.test(line)) {
          sock.write(mode === 'rcpt550' ? '550 mailbox unknown\r\n' : '250 recipient ok\r\n')
        } else if (/^DATA/i.test(line)) {
          inData = true
          sock.write('354 end with dot\r\n')
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n')
          sock.end()
        } else if (/^RSET/i.test(line)) sock.write('250 reset\r\n')
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, transcript }))
  })
}

const clientOpts = (port) => ({
  host: '127.0.0.1', port, user: 'u', pass: 'p',
  connectMs: 3000, cmdMs: 3000, dataMs: 5000, totalMs: 15000,
})

describe('SmtpClient (own protocol)', () => {
  it('completes EHLO→AUTH→MAIL→RCPT→DATA→QUIT with multiline EHLO', async () => {
    process.env.SMTP_ALLOW_PLAIN = '1'
    const { server, port, transcript } = await dummyServer('ok')
    try {
      const r = await new SmtpClient(clientOpts(port)).send({
        from: 'a@x.test', to: 'b@x.test', subject: 'Hi', text: 'hello', html: '<p>hello</p>',
      })
      assert.equal(r.ok, true)
      assert.equal(r.messageId, 'test123')
      assert.ok(transcript.some(l => /^EHLO /.test(l)))
      assert.ok(transcript.some(l => /^AUTH PLAIN /.test(l)))
    } finally {
      delete process.env.SMTP_ALLOW_PLAIN
      server.close()
    }
  })

  it('surfaces 5xx as permanent-class errors', async () => {
    process.env.SMTP_ALLOW_PLAIN = '1'
    const { server, port } = await dummyServer('rcpt550')
    try {
      await assert.rejects(
        new SmtpClient(clientOpts(port)).send({ from: 'a@x.test', to: 'b@x.test', subject: 's', text: 't', html: '<p>t</p>' }),
        /smtp-550/
      )
    } finally {
      delete process.env.SMTP_ALLOW_PLAIN
      server.close()
    }
  })
})

describe('MIME + DKIM', () => {
  it('builds multipart/alternative with Message-ID and Date', () => {
    const mime = buildMime({ from: 'a@x.test', fromName: 'Themis', to: 'b@x.test', subject: 'Café ☕', text: 'a=b', html: '<p>x</p>' })
    assert.match(mime, /multipart\/alternative/)
    assert.match(mime, /Message-ID: <[^>]+>/)
    assert.match(mime, /=\?UTF-8\?B\?/)
    assert.match(mime, /=3D/) // '=' quoted-printable escaped
  })

  it('DKIM signs verifiably with RSA-SHA256', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })
    const key = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const header = dkimSign({
      domain: 'x.test', selector: 'themis', key,
      from: '<a@x.test>', to: '<b@x.test>', subject: 'Hi', date: 'Thu, 01 Jan 2026 00:00:00 GMT',
      messageId: '<1@x.test>', body: 'hello',
    })
    assert.match(header, /^DKIM-Signature: v=1; a=rsa-sha256/)
    const unfolded = header.replace(/\r\n /g, '')
    const b64 = unfolded.split('b=').pop().replace(/\s+/g, '')
    const signed = unfolded.replace(/b=\S+/, 'b=')
    // Reconstruct exactly what the signer signed: canonical headers + tag line.
    const canon = ['from:<a@x.test>', 'to:<b@x.test>', 'subject:Hi', 'date:Thu, 01 Jan 2026 00:00:00 GMT', 'message-id:<1@x.test>'].join('\r\n')
    const tagLine = signed.replace(/^DKIM-Signature: /, 'dkim-signature:')
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${canon}\r\n${tagLine}`), publicKey, Buffer.from(b64, 'base64'))
    assert.equal(ok, true)
  })
})

describe('queue', () => {
  it('dedupes identical triggers', () => {
    const a = enqueue({ type: 'access', to: 'Q@x.test', payload: {}, dedupeKey: 'k1' })
    const b = enqueue({ type: 'access', to: 'q@x.test', payload: {}, dedupeKey: 'k1' })
    assert.equal(a.deduped, false)
    assert.equal(b.deduped, true)
  })

  it('enforces the per-lead daily cap', () => {
    for (let i = 0; i < 3; i++) enqueue({ type: 'access', to: 'cap@x.test', payload: {}, dedupeKey: `c${i}` })
    assert.throws(() => enqueue({ type: 'access', to: 'cap@x.test', payload: {}, dedupeKey: 'c3' }), /per-lead daily cap/)
  })

  it('sends due jobs and audits the event', async () => {
    __reset()
    enqueue({ type: 'confirm', to: 's@x.test', payload: {} })
    const r = await drainOnce(async () => ({ ok: true, provider: 'fake' }))
    assert.equal(r, undefined)
    assert.equal(queueStatus().depth, 0)
    assert.ok(eventLog().some(e => e.ev === 'sent' && e.provider === 'fake'))
  })

  it('dead-letters after five failures and opens the breaker', async () => {
    __reset()
    enqueue({ type: 'access', to: 'd@x.test', payload: {} })
    const fail = async () => { throw new Error('smtp-timeout:DATA') }
    for (let i = 0; i < 6; i++) { __forceDue(); await drainOnce(fail) }
    assert.equal(deadList().length, 1)
    assert.equal(queueStatus().breakerOpen, true)
    const replayed = replayJob(deadList()[0].id)
    assert.ok(replayed && replayed.attempts === 0)
  })

  it('suppresses hard-bounce addresses', async () => {
    __reset()
    suppress('b@x.test', 'test')
    const r = enqueue({ type: 'access', to: 'b@x.test', payload: {} })
    assert.equal(r.suppressed, true)
    assert.equal(unsuppress('b@x.test'), true)
  })
})

describe('admin notification delivery row', () => {
  const lead = { name: 'Jane', email: 'jane@claimsco.com', role: 'IA', claimsPerMonth: '40', created: true }
  it('states sent with provider, never the link', () => {
    const html = adminNotificationHtml({ ...lead, delivery: { status: 'sent', provider: 'gmail' } })
    assert.match(html, /Magic link/)
    assert.match(html, /sent via gmail/)
    assert.ok(!html.includes('access/verify?token='))
  })
  it('states queued and failed honestly in both formats', () => {
    const q = adminNotificationText({ ...lead, delivery: { status: 'queued' } })
    assert.match(q, /queued for retry/)
    const f = adminNotificationHtml({ ...lead, delivery: { status: 'failed', error: 'smtp-550 nope' } })
    assert.match(f, /FAILED/)
    assert.match(f, /smtp-550 nope/)
  })
  it('states waitlisted with no link minted', () => {
    const t = adminNotificationText({ ...lead, delivery: { status: 'waitlisted' } })
    assert.match(t, /not minted/)
  })
})

describe('templates', () => {
  it('every type renders EN+BM with CTA parity', () => {
    for (const type of TEMPLATE_TYPES) {
      for (const lang of ['en', 'ms']) {
        const vars = { name: 'Jane', accessUrl: 'https://app.test/x', ttl: '48 hours' }
        const t = renderTemplate(type, lang, type === 'access' || type === 'nudge' ? vars : { name: 'Jane' })
        assert.ok(t.subject.length > 0 && t.text.length > 0 && t.html.length > 0, `${type}/${lang}`)
        if (type === 'access' || type === 'nudge') {
          assert.ok(t.text.includes('https://app.test/x') && t.html.includes('https://app.test/x'))
        }
      }
    }
  })

  it('escapes names in HTML and rejects non-https links', () => {
    const t = renderTemplate('access', 'en', { name: '<b>evil</b>', accessUrl: 'https://app.test/x', ttl: '48h' })
    assert.ok(!t.html.includes('<b>evil</b>') && t.html.includes('&lt;b&gt;evil&lt;/b&gt;'))
    assert.throws(() => renderTemplate('access', 'en', { name: 'x', accessUrl: 'http://evil.test/x', ttl: '1h' }), /must be https/)
  })

  it('probe helper runs offline-safe', async () => {
    const r = await probePorts('127.0.0.1', [9])
    assert.equal(r[0].port, 9)
    assert.ok(['open', 'refused', 'timeout', 'filtered'].includes(r[0].state))
  })
})
