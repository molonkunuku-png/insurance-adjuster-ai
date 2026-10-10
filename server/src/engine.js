/**
 * Deterministic local adjuster engine.
 *
 * Runs with zero AI bills and zero third-party calls when OPENAI_API_KEY /
 * AI_PROVIDER=openai are not configured. It is deliberately conservative:
 *
 *  - It NEVER invents a currency amount or a policy fact.
 *  - It only reports what it can extract from the supplied policy text and
 *    damage notes, and flags every result for human review.
 *  - Results mirror the exact shapes returned by the OpenAI path so the API
 *    contracts in app.js are interchangeable.
 */

const MAX_SNIPPETS = 6
const MAX_CITATIONS = 6

/** Peril / coverage signals with a human label + a search pattern. */
const SIGNALS = [
  { label: 'Dwelling', pattern: /\b(dwelling|building)\b/i },
  { label: 'Other structures', pattern: /\b(other structures|detached garage)\b/i },
  { label: 'Personal property', pattern: /\b(personal property|contents|household goods)\b/i },
  { label: 'Loss of use', pattern: /\b(loss of use|additional living expense)\b/i },
  { label: 'Loss of use (ALE)', pattern: /\bALE\b/ },
  { label: 'Liability', pattern: /\b(liability)\b/i },
  { label: 'Replacement cost', pattern: /\b(replacement cost|RCV|replacement value)\b/i },
  { label: 'Actual cash value', pattern: /\b(actual cash value|ACV)\b/i },
  { label: 'Deductible', pattern: /\b(deductible|hurricane deductible|named.storm deductible)\b/i },
  { label: 'Exclusions', pattern: /\b(exclud|limitation|sublimit|do[es]? not cover|not covered|limited\b)/i },
  { label: 'Coinsurance', pattern: /\b(coinsurance|co-insurance)\b/i },
  { label: 'Flood', pattern: /\b(flood)\b/i },
  { label: 'Earthquake', pattern: /\b(earthquake)\b/i },
  { label: 'Wind & hail', pattern: /\b(wind|windstorm|hail|hailstorm|hurricane|tornado|cyclone)\b/i },
  { label: 'Water', pattern: /\b(water damage|seepage|backup|sewer|sump|drain)\b/i },
  { label: 'Ordinance & law', pattern: /\b(ordinance|code upgrade|law and ordinance)\b/i },
  { label: 'Theft', pattern: /\b(theft|vandalism|malicious mischief|burglary)\b/i },
  { label: 'Mold', pattern: /\b(mold|mildew|fungus|rot)\b/i },
]

/** Damage descriptors likely to appear in a policy or loss notes. */
const DAMAGE_SIGNALS = [
  { label: 'Hail', pattern: /\bhail\b/i },
  { label: 'Wind', pattern: /\bwind\b/i },
  { label: 'Water / flooding', pattern: /\b(water|flood|leak|seepage|saturat)\b/i },
  { label: 'Fire & smoke', pattern: /\b(fire|smoke|soot|burn|char)\b/i },
  { label: 'Structural impact', pattern: /\b(impact|collision|collapse|fallen tree|vehicle)\b/i },
  { label: 'Roof', pattern: /\b(roof|shingle|slate|tile|granule|crease|dent)\b/i },
  { label: 'Exterior cladding', pattern: /\b(siding|brick|stucco|facade|vinyl)\b/i },
  { label: 'Windows & doors', pattern: /\b(window|glass|door)\b/i },
  { label: 'Gutters & downspouts', pattern: /\b(gutter|downspout)\b/i },
  { label: 'Interior', pattern: /\b(ceiling|wall|floor|drywall|carpet|interior)\b/i },
  { label: 'Contents', pattern: /\b(furniture|appliance|electronic|contents)\b/i },
  { label: 'Electrical', pattern: /\b(electrical|wiring|panel)\b/i },
  { label: 'Plumbing', pattern: /\b(plumb|pipe|burst|rupture|appliance leak)\b/i },
  { label: 'Lightning', pattern: /\b(lightning|thunder|power surge)\b/i },
  { label: 'Foundation', pattern: /\b(foundation|crawlspace|structural)\b/i },
  { label: 'Mold', pattern: /\b(mold|mildew)\b/i },
]

/**
 * Coverage-gap checklist. A gap is NEVER stated as a fact — the engine only
 * reports that no matching language was detected in the extracted text, so a
 * human must verify against the full policy. `damage` marks whether the loss
 * notes even mention the peril (relevance flag, not a conclusion).
 */
const GAP_CHECKLIST = [
  { key: 'flood', label: 'Flood', policy: /\bflood\b/i, damage: /\b(flood|water|leak|seepage|saturat)\b/i },
  { key: 'quake', label: 'Earthquake', policy: /\bearthquake\b/i, damage: /\b(earthquake|tremor|seismic)\b/i },
  { key: 'windhail', label: 'Wind & hail', policy: /\b(wind|hail)\b/i, damage: /\b(wind|hail|storm|shingle)\b/i },
  { key: 'waterbackup', label: 'Water backup / sewer', policy: /\b(backup|sewer|sump)\b/i, damage: /\b(backup|sewer|drain|sump|overflow)\b/i },
  { key: 'ordinance', label: 'Ordinance & law', policy: /\b(ordinance|code upgrade|law and ordinance)\b/i, damage: /\b(code|permit|rebuild)\b/i },
  { key: 'replacement', label: 'Replacement cost', policy: /\b(replacement cost|RCV|replacement value)\b/i, damage: /\b(replace|new roof|rebuild)\b/i },
  { key: 'lossofuse', label: 'Loss of use', policy: /\b(loss of use|additional living expense|ALE)\b/i, damage: /\b(uninhabitable|hotel|relocat|displaced)\b/i },
  { key: 'liability', label: 'Liability', policy: /\bliability\b/i, damage: /\b(injur|liab|third party|neighbor)\b/i },
]

function buildGaps(policyText, damageNotes) {
  const gaps = []
  for (const g of GAP_CHECKLIST) {
    if (g.policy.test(policyText || '')) continue
    const relevant = g.damage.test(damageNotes || '')
    gaps.push({
      key: g.key,
      label: g.label,
      damageRelevant: relevant,
      note: relevant
        ? 'Damage notes mention this peril but no matching language was detected in the extracted policy text — verify coverage before quoting.'
        : 'No language for this protection was detected in the extracted text — confirm with the full policy; consider whether the insured needs it.',
    })
  }
  return gaps.slice(0, 8)
}

/** Peril chips: which perils appear in the policy text, the loss notes, or both. */
const PERIL_MAP = [
  { key: 'wind', label: 'Wind', pattern: /\b(wind|windstorm|hurricane|tornado|cyclone)\b/i },
  { key: 'hail', label: 'Hail', pattern: /\b(hail|hailstorm)\b/i },
  { key: 'flood', label: 'Flood', pattern: /\bflood\b/i },
  { key: 'fire', label: 'Fire', pattern: /\b(fire|smoke|soot|char)\b/i },
  { key: 'water', label: 'Water', pattern: /\b(water|leak|seepage|saturat)\b/i },
  { key: 'quake', label: 'Earthquake', pattern: /\bearthquake\b/i },
  { key: 'theft', label: 'Theft', pattern: /\b(theft|vandalism|burglary)\b/i },
  { key: 'snow', label: 'Snow & ice', pattern: /\b(snow|ice|freez|frost)\b/i },
  { key: 'lightning', label: 'Lightning', pattern: /\b(lightning|thunder|power surge)\b/i },
]

export { buildGaps, buildPerils }

function buildPerils(policyText, damageNotes) {
  const out = []
  for (const p of PERIL_MAP) {
    const inPolicy = p.pattern.test(policyText || '')
    const inNotes = p.pattern.test(damageNotes || '')
    if (inPolicy || inNotes) {
      out.push({ key: p.key, label: p.label, source: inPolicy && inNotes ? 'both' : inPolicy ? 'policy' : 'notes' })
    }
  }
  return out
}

/** Split a body of text into trimmed, non-empty lines with source attribution. */
function splitLines(text) {
  const out = []
  const seen = new Set()
  for (const raw of String(text || '').split(/\r?\n/)) {
    // Strip control characters (pasted PDFs/OCR junk) before matching.
    // eslint-disable-next-line no-control-regex -- intentional: strips pasted PDF/OCR control junk
    const line = raw.replace(/[\u0000-\u001F\u007F]+/g, '').trim()
    if (line) {
      const cleaned = line.replace(/[ \t]+/g, ' ').slice(0, 500)
      const key = cleaned.toLowerCase()
      if (cleaned && !seen.has(key)) {
        seen.add(key)
        out.push(cleaned)
      }
    }
  }
  return out
}

/** Find up to n non-empty lines that match a pattern, keeping source lines short. */
function matchLines(lines, pattern, n = MAX_SNIPPETS) {
  const hits = []
  for (const line of lines) {
    if (pattern.test(line) && !hits.includes(line)) hits.push(line)
    if (hits.length >= n) break
  }
  return hits
}

/**
 * Turn raw policy text into a compact fact sheet: which signal labels have at
 * least one matching line, and the first matching lines as evidence.
 */
function extractPolicyFacts(policyText) {
  const lines = splitLines(policyText)
  const facts = []
  for (const signal of SIGNALS) {
    const evidence = matchLines(lines, signal.pattern, 2)
    if (evidence.length > 0) {
      facts.push({ label: signal.label, evidence })
    }
  }
  return facts
}

/** Coverage description assembled from extracted facts — never fabricated. */
function buildCoverage(facts) {
  if (!facts || facts.length === 0) {
    return 'No coverage language could be automatically identified. The policy text is required for a coverage determination.'
  }
  const labels = facts.map((f, i) => `${i + 1}) ${f.label}`).join('; ')
  return `Detected coverage/limit signals (verify against the original policy): ${labels}.`
}

/** Damage assessment built strictly from the notes + policy lines that match. */
function buildDamage(damageNotes, policyLines, imageCount) {
  const hits = []
  for (const signal of DAMAGE_SIGNALS) {
    const inNotes = damageNotes ? signal.pattern.test(damageNotes) : false
    const inPolicy = matchLines(policyLines, signal.pattern, 1).length > 0
    if (inNotes || inPolicy) hits.push(signal.label)
  }

  const seen = imageCount > 0 ? `${imageCount} damage image(s) supplied but not machine-read in local mode.` : 'No damage images supplied.'
  if (hits.length === 0) {
    return `Damage descriptors not confidently identified from the free-text notes alone. ${seen} Every item below is based on the typed description and must be confirmed against the actual loss photos.`
  }
  return `Reported damage dimensions to verify: ${hits.join(', ')}. ${seen} A human adjuster must confirm extent and cause against the actual loss photos and the policy's covered perils.`
}

/** Local mode never assigns money: that decision is reserved for a human or a paid model pass. */
function buildEstimate() {
  return 'No automated dollar estimate in local draft mode. Estimated value must be produced by the reviewing human adjuster from a verified scope of loss.'
}

/** Deterministic next steps grounded in what the engine could and could not do. */
function buildNextSteps(facts) {
  const steps = []
  if (facts.length === 0) {
    steps.push('Attach the policy PDF (or paste its text) so coverage language can be checked.')
  }
  steps.push('Human adjuster: reconcile the detected coverage signals against the original policy document.')
  steps.push(`Human adjuster: confirm damage extent, cause, and covered perils on-site against the supplied photos (${'images not machine-verified in local mode'}).`)
  steps.push('Review exclusions and special limits before any figure is quoted to the insured.')
  steps.push('Add carrier-specific template fields before issuing the final report.')
  return steps
}

export function localAnalyze({ policyText, damageNotes, imageCount = 0 }) {
  const policy = String(policyText || '').slice(0, 20000)
  const notes = String(damageNotes || '').slice(0, 4000)
  const policyLines = splitLines(policy)
  const facts = extractPolicyFacts(policy)
  const hasNotes = notes.trim().length > 0
  const hasImages = Number(imageCount) > 0
  // Mirror the route cap so direct callers can't smuggle more images in.
  const cappedImages = Math.min(Math.max(Number(imageCount) || 0, 0), 12)

  if (!hasNotes && !hasImages && !policy) {
    return {
      coverage: 'No policy text, damage notes, or images were received.',
      damage: 'Nothing to assess.',
      estimatedValue: buildEstimate(),
      nextSteps: ['Provide a policy document, damage photos, or a written description to begin.'],
      confidence: 'low',
      needsReview: true,
      gaps: [],
      perils: [],
      partial: false,
    }
  }

  return {
    coverage: buildCoverage(facts),
    damage: buildDamage(notes, policyLines, cappedImages),
    estimatedValue: buildEstimate(),
    nextSteps: buildNextSteps(facts),
    confidence: 'low',
    needsReview: true,
    gaps: buildGaps(policy, notes),
    perils: buildPerils(policy, notes),
    // True when only half the inputs arrived — the UI shows a partial-input notice.
    partial: (!policy && (hasNotes || hasImages)) || (Boolean(policy) && !hasNotes && !hasImages),
  }
}

// ---------------------------------------------------------------------------
// Grounded policy Q&A
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'will',
  'would', 'can', 'could', 'should', 'of', 'to', 'in', 'on', 'for', 'with',
  'and', 'or', 'but', 'if', 'about', 'my', 'me', 'i', 'you', 'your', 'it',
  'this', 'that', 'what', 'when', 'where', 'who', 'which', 'how', 'policy',
  'policy?', 'cover', 'covered', 'coverage',
])

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function scoreSentence(sentence, want) {
  const words = tokens(sentence)
  if (words.length === 0) return 0
  let score = 0
  for (const w of words) {
    if (want.has(w)) score += 1
  }
  return score
}

export function localAsk({ policyText, question, history: _history = [] }) {
  // NOTE: localAsk is intentionally stateless — history is accepted for API
  // shape parity with the OpenAI path but never influences the answer. Every
  // answer is keyword grounding against the supplied policy text only.
  const q = String(question || '').trim().slice(0, 1200)
  // Enforce the route's 40k cap here too so direct importers get the same guard.
  const policy = String(policyText || '').slice(0, 40000)

  if (!q) return { answer: '', grounded: false, citations: [], confidence: 'low' }
  if (!policy) {
    return {
      answer: 'No policy text was attached, so I cannot ground an answer. Attach the policy PDF and ask again.',
      grounded: false,
      citations: [],
      confidence: 'low',
    }
  }

  const want = new Set(tokens(q))
  const scored = sentences(policy)
    .map(sentence => ({ sentence, score: scoreSentence(sentence, want) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return {
      answer: `I could not find language in the provided policy that directly addresses "${q.slice(0, 200)}". A human adjuster should confirm against the full policy wording.`,
      grounded: false,
      citations: [],
      confidence: 'low',
    }
  }

  const top = scored.slice(0, MAX_CITATIONS)
  const citations = top.map(m => ({
    quote: m.sentence.slice(0, 600),
    note: `Exact language from the supplied policy, ranked ${m.score} keyword match(es) for the question.`,
  }))
  const confidence = scored[0].score >= 3 ? 'medium' : 'low'

  const answer = [
    `Found ${top.length} passage${top.length > 1 ? 's' : ''} in the supplied policy relevant to "${q.slice(0, 200)}".`,
    ...top.slice(0, 3).map(m => `• ${m.sentence}`),
    'All figures and limits below are as written in the policy; verify page references before quoting.',
  ].join('\n')

  return { answer, grounded: true, citations, confidence }
}

// ---------------------------------------------------------------------------
// Report draft (markdown)
// ---------------------------------------------------------------------------

function section(label) {
  return `## ${label}\n`
}

export function localReport(analysis) {
  const a = analysis || {}
  // Local calendar date (not UTC slice) so the stamp matches the adjuster's wall clock.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const lines = []
  lines.push('# Loss Report (Draft)')
  lines.push('')
  lines.push(`_Generated ${today} · Themis Adjuster AI · local draft engine_`)
  lines.push('')
  lines.push('> This is an AI-drafted document for human adjuster review. It is NOT a binding estimate. All dollar figures must be produced and verified by the reviewing adjuster.')
  lines.push('')
  lines.push(`> Confidence: ${a.confidence || 'low'} · ${a.needsReview === false ? 'Review recorded' : 'Needs human review'}`)
  lines.push('')
  lines.push(section('Executive summary'))
  lines.push(a.damage || 'See assessment below.')
  lines.push('')
  lines.push(section('Coverage analysis'))
  lines.push(a.coverage || 'Coverage not evaluated.')
  lines.push('')
  lines.push(section('Damage assessment'))
  lines.push(a.damage || 'No damage description provided.')
  lines.push('')
  lines.push(section('Estimated costs'))
  lines.push(a.estimatedValue || 'Not estimated.')
  lines.push('')
  lines.push(section('Coverage gaps to verify'))
  if (Array.isArray(a.gaps) && a.gaps.length > 0) {
    for (const g of a.gaps) {
      const label = g.label || g.key || 'Unlabeled protection'
      const note = g.note || 'Verify against the original policy.'
      lines.push(`- ${label}${g.damageRelevant ? ' (mentioned in loss notes)' : ''}: ${note}`)
    }
  } else {
    lines.push('No checklist gaps detected in the extracted text. Confirm against the full policy before advising the insured.')
  }
  lines.push('')
  lines.push(section('Detected perils'))
  if (Array.isArray(a.perils) && a.perils.length > 0) {
    lines.push(a.perils.map(p => `- ${p.label || p.key} (${p.source || 'unverified source'})`).join('\n'))
  } else {
    lines.push('No peril signals detected in the supplied inputs.')
  }
  lines.push('')
  lines.push(section('Next steps'))
  const steps = Array.isArray(a.nextSteps) && a.nextSteps.length ? a.nextSteps : ['Proceed with human adjuster review.']
  for (const [i, step] of steps.entries()) {
    lines.push(`${i + 1}. ${step}`)
  }
  lines.push('')
  lines.push(section('Human sign-off'))
  lines.push('')
  lines.push('Reviewing adjuster: _________________________________')
  lines.push('Date: _____________________________________________')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('Disclaimer: this draft was produced by an AI assistant and may contain errors or omissions. It is not a binding estimate and does not constitute an admission of coverage. Final liability determinations require review by a licensed human adjuster against the original policy and verified loss documentation.')

  return lines.join('\n')
}