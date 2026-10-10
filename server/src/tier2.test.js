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
  purgeExpiredTokens,
} from './db.js'
import { generateAccessToken, hashToken, createSession, verifySession } from './auth.js'

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

describe('lead language preference', () => {
  it('persists lang through save + lookup', async () => {
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

describe('magic-link tokens (D55: single-use + expiry)', () => {  it('a used token cannot verify twice', async () => {
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
})
