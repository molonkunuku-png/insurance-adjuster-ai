/**
 * Tier 2 regression suite — runs on plain node:test, zero new dependencies:
 *   npm test  (server/)
 *
 * Covers Top200 E55 (gaps/perils/report/ask edge cases), D55 (single-use +
 * expired magic tokens), and E42 (localAsk quotes verbatim only).
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

import {
  localAnalyze, localAsk, localReport, buildGaps, buildPerils,
} from './engine.js'
import {
  initDb, saveBetaLead, approveLead, findLeadByTokenHash, findLeadByEmail, markLogin,
  purgeExpiredTokens, pairGet, pairSet, pairDelByChatId, pairFindByChatId,
  listBetaLeads, oldestPending, mintApiKey, findApiKey, revokeApiKey,
  persistSession, findSession, listSessions, revokeSession, findSessionByPrefix,
  purgeStaleLeads, purgeExpiredSessions,
} from './db.js'
import { generateAccessToken, hashToken, createSession, verifySession, sessionSid } from './auth.js'

before(async () => {
  // No DATABASE_URL in test env → initDb selects the in-memory store.
  delete process.env.DATABASE_URL
  await initDb()
})

const POLICY = 'Dwelling $300000. Deductible $1000. Perils: Windstorm, Hail, Fire. Exclusions: Flood, Earth Movement.'

describe('gaps', () => {
  it('excludes perils present in policy text', () => {
    const keys = buildGaps(POLICY, 'wind damage').map(g => g.key)
    assert.ok(!keys.includes('flood')) // flood IS named in POLICY
    assert.ok(!keys.includes('windhail'))
    assert.ok(keys.includes('quake'))
  })

  it('flags damage-relevant gaps', () => {
    const gaps = buildGaps('Dwelling only.', 'basement sewer backup everywhere')
    const wb = gaps.find(g => g.key === 'waterbackup')
    assert.ok(wb && wb.damageRelevant === true)
  })

  it('never states a gap as fact', () => {
    for (const g of buildGaps('', '')) {
      assert.match(g.note, /verify|confirm/i)
    }
  })
})

describe('perils', () => {
  it('tags windstorm + hailstorm variants', () => {
    const keys = buildPerils('Windstorm and hailstorm season.', '').map(p => p.key)
    assert.ok(keys.includes('wind') && keys.includes('hail'))
  })

  it('does not match hail inside hailbloom', () => {
    assert.deepEqual(buildPerils('hailbloom festival', ''), [])
  })

  it('marks policy/notes/both sources', () => {
    const both = buildPerils('Fire coverage.', 'fire damage seen')
    assert.equal(both.find(p => p.key === 'fire')?.source, 'both')
    assert.equal(buildPerils('', 'flood water').find(p => p.key === 'flood')?.source, 'notes')
  })
})

describe('localAnalyze', () => {
  it('caps imageCount at the route limit of 12', () => {
    const a = localAnalyze({ policyText: POLICY, damageNotes: 'x', imageCount: 99 })
    assert.match(a.damage, /12 damage image/)
  })

  it('sets partial when only half the inputs arrive', () => {
    assert.equal(localAnalyze({ policyText: '', damageNotes: 'roof gone', imageCount: 0 }).partial, true)
    assert.equal(localAnalyze({ policyText: POLICY, damageNotes: '', imageCount: 0 }).partial, true)
    assert.equal(localAnalyze({ policyText: POLICY, damageNotes: 'roof', imageCount: 1 }).partial, false)
  })

  it('always flags needsReview and returns gaps/perils arrays', () => {
    const a = localAnalyze({ policyText: POLICY, damageNotes: 'n', imageCount: 0 })
    assert.equal(a.needsReview, true)
    assert.ok(Array.isArray(a.gaps) && Array.isArray(a.perils))
  })
})

describe('localReport', () => {
  it('renders gaps, perils, and confidence sections', () => {
    const md = localReport(localAnalyze({ policyText: POLICY, damageNotes: 'wind', imageCount: 0 }))
    assert.match(md, /Coverage gaps to verify/)
    assert.match(md, /Detected perils/)
    assert.match(md, /Confidence: low/)
  })

  it('stamps a localized calendar date', () => {
    const now = new Date()
    const md = localReport({})
    assert.ok(md.includes(String(now.getFullYear())))
    const ms = localReport({}, 'ms')
    assert.ok(ms.includes(String(now.getFullYear())))
  })

  it('falls back cleanly on empty analysis', () => {
    const md = localReport({})
    assert.match(md, /Proceed with human adjuster review/)
    assert.match(md, /No checklist gaps detected/)
  })
})

describe('localAsk (E42: verbatim quotes only)', () => {
  it('quotes policy sentences, never general knowledge', () => {
    const r = localAsk({ policyText: 'Deductible is $1000 per storm. Flood is excluded.', question: 'What is the deductible?' })
    assert.equal(r.grounded, true)
    assert.ok(r.citations.length > 0)
    for (const c of r.citations) {
      assert.ok('Deductible is $1000 per storm. Flood is excluded.'.includes(c.quote))
    }
  })

  it('truncates the echoed question at 200 chars', () => {
    const r = localAsk({ policyText: 'Deductible $5.', question: 'd'.repeat(500) })
    assert.ok(!r.answer.includes('d'.repeat(201)))
  })

  it('ignores history (stateless contract)', () => {
    const a = localAsk({ policyText: POLICY, question: 'deductible?' })
    const b = localAsk({ policyText: POLICY, question: 'deductible?', history: [{ q: 'flood?', r: { answer: 'yes flood everywhere' } }] })
    assert.deepEqual(a, b)
  })
})

describe('lead language preference', () => {  it('persists lang through save + lookup', async () => {
    await saveBetaLead({ name: 'BM', email: 'lang-ms@example.com', lang: 'ms' })
    const found = await findLeadByEmail('lang-ms@example.com')
    assert.equal(found?.lang, 'ms')
  })

  it('defaults unknown lang to en', async () => {
    await saveBetaLead({ name: 'EN', email: 'lang-en@example.com', lang: 'xx' })
    const found = await findLeadByEmail('lang-en@example.com')
    assert.equal(found?.lang, 'en')
  })
})

describe('telegram pairings + safe admin projection', () => {
  it('round-trips pair set/get/find/delete', async () => {
    await pairSet('pair@example.com', '12345', 'ms')
    const got = await pairGet('pair@example.com')
    assert.equal(got?.chatId, '12345')
    assert.equal(got?.lang, 'ms')
    assert.equal((await pairFindByChatId('12345'))?.email, 'pair@example.com')
    await pairDelByChatId('12345')
    assert.equal(await pairGet('pair@example.com'), null)
  })

  it('memory admin list omits token hashes', async () => {
    await saveBetaLead({ name: 'H', email: 'hashhide@example.com' })
    await approveLead({ email: 'hashhide@example.com', tokenHash: 'secret-hash', expiresAt: new Date(Date.now() + 3600000) })
    const rows = await listBetaLeads(200, 0)
    const row = rows.find(r => r.email === 'hashhide@example.com')
    assert.ok(row)
    assert.equal(row.accessTokenHash, undefined)
    assert.equal(row.access_token_hash, undefined)
  })

  it('approveLead preserves active status on re-mint', async () => {
    await saveBetaLead({ name: 'A', email: 'stayactive@example.com' })
    await approveLead({ email: 'stayactive@example.com', tokenHash: 'h1', expiresAt: new Date(Date.now() + 3600000) })
    const { lead } = await saveBetaLead({ name: 'A', email: 'stayactive@example.com' })
    lead.status = 'active' // simulate verified login
    await approveLead({ email: 'stayactive@example.com', tokenHash: 'h2', expiresAt: new Date(Date.now() + 3600000) })
    assert.equal((await findLeadByEmail('stayactive@example.com'))?.status, 'active')
  })

  it('oldestPending returns earliest pending lead', async () => {
    await saveBetaLead({ name: 'P1', email: 'pend1@example.com' })
    await saveBetaLead({ name: 'P2', email: 'pend2@example.com' })
    const next = await oldestPending()
    assert.ok(next && next.status === 'pending')
  })

  it('oldestPending skips the just-revoked address', async () => {
    await saveBetaLead({ name: 'R1', email: 'revskip1@example.com' })
    await saveBetaLead({ name: 'R2', email: 'revskip2@example.com' })
    const next = await oldestPending('revskip1@example.com')
    assert.ok(next && next.email !== 'revskip1@example.com' && next.status === 'pending')
  })

  it('purgeStaleLeads removes only old pending leads', async () => {
    const { lead } = await saveBetaLead({ name: 'Old', email: 'staleold@example.com' })
    lead.createdAt = new Date(Date.now() - 100 * 86400000).toISOString()
    lead.status = 'pending'
    const fresh = await saveBetaLead({ name: 'Fresh', email: 'stalefresh@example.com' })
    void fresh
    const n = await purgeStaleLeads()
    assert.ok(n >= 1)
    assert.ok(await findLeadByEmail('stalefresh@example.com'))
    assert.equal(await findLeadByEmail('staleold@example.com'), null)
  })

  it('purgeExpiredSessions removes only expired rows', async () => {
    const s = createSession(77, 'sesspurge@example.com', 1)
    const sid = sessionSid(s)
    await persistSession({ sid, leadId: 77, email: 'sesspurge@example.com', exp: Date.now() - 1000 })
    assert.equal(await purgeExpiredSessions(), 1)
    assert.equal(await findSession(sid), null)
  })

  it('findSessionByPrefix resolves truncated sids per email', async () => {
    const s = createSession(78, 'prefix@example.com', 1)
    const sid = sessionSid(s)
    await persistSession({ sid, leadId: 78, email: 'prefix@example.com', exp: Date.now() + 3600000 })
    assert.equal(await findSessionByPrefix('prefix@example.com', sid.slice(0, 12)), sid)
    assert.equal(await findSessionByPrefix('other@example.com', sid.slice(0, 12)), null)
  })
})

describe('magic-link tokens (D55: single-use + expiry)', () => {
  it('a used token cannot verify twice', async () => {
    const { lead } = await saveBetaLead({ name: 'T', email: 'single-use@example.com' })
    const token = generateAccessToken()
    await approveLead({ email: lead.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) })
    assert.ok(await findLeadByTokenHash(hashToken(token)))
    await markLogin(lead.id)
    assert.equal(await findLeadByTokenHash(hashToken(token)), null)
  })

  it('purge clears expired hashes', async () => {
    const { lead } = await saveBetaLead({ name: 'T', email: 'expired@example.com' })
    await approveLead({ email: lead.email, tokenHash: 'deadbeef', expiresAt: new Date(Date.now() - 1000) })
    assert.equal(await purgeExpiredTokens(), 1)
    const again = await findLeadByTokenHash('deadbeef')
    assert.equal(again, null)
  })
})

describe('sessions', () => {
  it('round-trips and rejects tampering', () => {
    const s = createSession(7, 's@example.com', 1)
    assert.equal(verifySession(s)?.email, 's@example.com')
    assert.equal(verifySession(`${s}tampered`), null)
    assert.equal(verifySession('garbage'), null)
  })

  it('persists, lists, and revokes by sid', async () => {
    const s = createSession(8, 'sess@example.com', 1)
    const sid = sessionSid(s)
    assert.ok(sid)
    await persistSession({ sid, leadId: 8, email: 'sess@example.com', exp: Date.now() + 3600000 })
    assert.ok(await findSession(sid))
    const rows = await listSessions('sess@example.com')
    assert.ok(rows.length >= 1)
    assert.equal(await revokeSession(sid, 'sess@example.com'), true)
    const gone = await findSession(sid)
    assert.ok(gone.revoked_at || gone.revokedAt)
  })
})

describe('api keys (TPA)', () => {
  it('mints once-readable keys verified by hash', async () => {
    const { key } = await mintApiKey({ email: 'tpa@example.com', name: 'tpa-app' })
    assert.match(key, /^thm_/)
    const row = await findApiKey(key)
    assert.ok(row && row.lead_email === 'tpa@example.com')
    assert.equal(await findApiKey('thm_wrong'), null)
  })

  it('revoke kills the key', async () => {
    const { row, key } = await mintApiKey({ email: 'tpa2@example.com', name: 'x' })
    assert.ok(await findApiKey(key))
    assert.equal(await revokeApiKey(row.id, 'tpa2@example.com'), true)
    assert.equal(await findApiKey(key), null)
  })
})
