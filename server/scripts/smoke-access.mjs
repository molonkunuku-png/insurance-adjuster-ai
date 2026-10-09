// Smoke test: magic-link verify -> session cookie -> gate -> logout.
// Runs against the in-memory store (no DATABASE_URL, no email).
import { createApp } from '../src/app.js'
import { initDb, saveBetaLead, approveLead, revokeLead } from '../src/db.js'
import { hashToken } from '../src/auth.js'

await initDb()

const PORT = 9999
const BASE = `http://localhost:${PORT}`
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}

const email = 'smoke@example.com'
await saveBetaLead({ name: 'Smoke Test', email })
await approveLead({
  email,
  tokenHash: hashToken('test-token'),
  expiresAt: new Date(Date.now() + 7 * 86400000),
})

const app = createApp()
const server = app.listen(PORT)

try {
  const health = await fetch(`${BASE}/api/health`).then(r => r.json())
  ok('health db=memory', health.db === 'memory', JSON.stringify(health))
  ok('health auth=true', health.auth === true)

  const me0 = await fetch(`${BASE}/api/auth/me`).then(r => r.json())
  ok('me unauthorized before', me0.authorized === false)

  const gate = await fetch(`${BASE}/api/auth/me`, { method: 'GET' })
  ok('me 200', gate.status === 200)

  const blocked = await fetch(`${BASE}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: [{ base64: 'x', type: 'image/jpeg' }] }),
  })
  ok('analyze blocked w/o session (401)', blocked.status === 401)

  const verify = await fetch(`${BASE}/api/access/verify?token=test-token`, { redirect: 'manual' })
  ok('verify redirects (302)', verify.status === 302, `got ${verify.status}`)
  const setCookie = verify.headers.get('set-cookie') || ''
  ok('verify sets cookie', setCookie.includes('themis_session='))
  const cookie = setCookie.split(';')[0]

  const me1 = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } }).then(r => r.json())
  ok('me authorized after verify', me1.authorized === true && me1.email === email, JSON.stringify(me1))

  const badVerify = await fetch(`${BASE}/api/access/verify?token=nope`, { redirect: 'manual' })
  ok('bad token redirects to ?access=invalid', (badVerify.headers.get('location') || '').includes('access=invalid'))

  const logout = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } })
  ok('logout clears cookie', (logout.headers.get('set-cookie') || '').includes('Max-Age=0'))

  const admin = await fetch(`${BASE}/api/admin/leads`, { headers: { 'x-admin-secret': 'testadmin' } })
  const adminData = await admin.json()
  ok('admin leads lists 1', admin.status === 200 && adminData.leads?.length === 1, JSON.stringify(adminData).slice(0, 120))

  const adminDeny = await fetch(`${BASE}/api/admin/leads`, { headers: { 'x-admin-secret': 'wrong' } })
  ok('admin denies bad secret (401)', adminDeny.status === 401)

  await revokeLead(email)
  const revoked = await fetch(`${BASE}/api/access/verify?token=test-token`, { redirect: 'manual' })
  ok('revoked token rejected', (revoked.headers.get('location') || '').includes('access=invalid'))
} finally {
  server.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
