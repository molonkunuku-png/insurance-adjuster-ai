// Smoke test (Option C): when the magic-link email fails (Resend test mode),
// the API must return a fallback accessUrl that actually signs the user in.
// Run with RESEND_API_KEY set to an invalid key so the send fails.
import { createApp } from '../src/app.js'
import { initDb } from '../src/db.js'

await initDb()
const PORT = 9998
const BASE = `http://localhost:${PORT}`
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}

const app = createApp()
const server = app.listen(PORT)
try {
  const res = await fetch(`${BASE}/api/beta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Fallback Test', email: 'fallback@example.com', role: 'Staff adjuster', claims: '10' }),
  })
  const data = await res.json()
  ok('granted under cap', data.granted === true, JSON.stringify(data))
  ok('email send failed (as expected in test mode)', String(data.access).startsWith('failed'), String(data.access))
  ok('fallback accessUrl returned', typeof data.accessUrl === 'string' && data.accessUrl.includes('/api/access/verify?token='), JSON.stringify(data))
  if (data.accessUrl) {
    const token = new URL(data.accessUrl).searchParams.get('token')
    const verify = await fetch(`${BASE}/api/access/verify?token=${token}`, { redirect: 'manual' })
    const cookie = verify.headers.get('set-cookie') || ''
    ok('fallback link signs in (302 + cookie)', verify.status === 302 && cookie.includes('themis_session='), `status=${verify.status}`)
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookie.split(';')[0] } }).then(r => r.json())
    ok('session authed as correct email', me.authorized === true && me.email === 'fallback@example.com', JSON.stringify(me))
  }
} finally {
  server.close()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)