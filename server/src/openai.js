import { config } from './config.js'
import { buildGaps, buildPerils } from './engine.js'

const API = 'https://api.openai.com/v1/chat/completions'

function assertKey() {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY is not set on the server')
}

async function chat(body) {
  assertKey()
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function analyzeDamageAndPolicy(images, policyText) {
  const contentParts = [
    {
      type: 'text',
      text: `You are an insurance adjuster AI. Analyze the policy text and damage images.\n\nPolicy text: ${policyText || '(no policy text provided)'}\n\nBest practices: base the coverage and damage descriptions on what is actually visible or stated; do not invent policy details. Ground the estimate in visible damage with stated assumptions.`,
    },
  ]
  for (const img of images) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.type};base64,${img.base64}` },
    })
  }

  const content = await chat({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: 'You are a precise insurance adjuster AI. Output ONLY valid JSON with keys: coverage (string), damage (string), estimatedValue (string), nextSteps (array of strings), confidence (one of "low"|"medium"|"high"), needsReview (boolean).',
      },
      { role: 'user', content: contentParts },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  })

  try {
    const parsed = JSON.parse(stripFences(content))
    // Contract parity with the local engine: clamp confidence, default review,
    // and attach deterministic gaps/perils so the UI never silently loses them.
    const confidence = ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low'
    return {
      coverage: String(parsed.coverage || ''),
      damage: String(parsed.damage || ''),
      estimatedValue: String(parsed.estimatedValue || ''),
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String) : [],
      confidence,
      needsReview: parsed.needsReview !== false,
      gaps: buildGaps(policyText, ''),
      perils: buildPerils(policyText, ''),
    }
  } catch {
    return {
      coverage: content.substring(0, 500),
      damage: 'See detailed analysis',
      estimatedValue: 'See detailed analysis',
      nextSteps: ['Review full report'],
      confidence: 'low',
      needsReview: true,
    }
  }
}

export async function generateReport(analysis) {
  return chat({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional insurance claim document specialist. Generate a loss report in markdown. Include: claim header, executive summary, coverage analysis, damage assessment, estimated costs, next steps, and a human sign-off block. Use professional terminology. Do not invent policy details. Mark every dollar figure as an estimate. End with a prominent disclaimer that this is an AI-drafted document requiring human adjuster review and is not a binding estimate.',
      },
      { role: 'user', content: JSON.stringify(analysis, null, 2) },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  })
}

const SYSTEM_ASK =
  'You are a precise insurance adjuster AI. Answer the question ONLY from the policy text provided between the POLICY markers. Do not rely on general knowledge about the insurer or policy wording. If the text does not contain enough to answer, say so plainly and set grounded=false. Quote the exact, verbatim policy language as citations. Output ONLY valid JSON with keys: answer (plain markdown, under 180 words), grounded (boolean), citations (array of {quote, note} where quote is an exact verbatim substring of the policy text and note explains what it means for this claim), confidence (one of "low"|"medium"|"high"). If grounded is false, citations MUST be an empty array.'

/**
 * Grounded policy Q&A. Given the policy text (extracted client-side), a question,
 * and prior turns, return a grounded answer + verbatim citations.
 */
export async function askPolicy({ policyText, question, history = [] }) {
  const messages = [{ role: 'system', content: SYSTEM_ASK }]
  // Validate history shape: only well-formed turns ride along, max 4.
  // (The client sends { q, r }; accept legacy { q, response } too.)
  for (const h of (Array.isArray(history) ? history : []).slice(-4)) {
    if (!h || typeof h.q !== 'string') continue
    const prior = h.r ?? h.response
    if (typeof prior === 'undefined') continue
    messages.push({ role: 'user', content: `Question: ${String(h.q).slice(0, 1200)}` })
    messages.push({ role: 'assistant', content: JSON.stringify(prior).slice(0, 4000) })
  }
  messages.push({
    role: 'user',
    content: `POLICY TEXT (between the markers):\n---POLICY START---\n${clip(policyText || '', 32000)}\n---POLICY END---\n\nQUESTION: ${question}`,
  })

  const out = await chatJSON({ model: config.openaiModel, messages, temperature: 0.2, max_tokens: 1100 })
  if (out && typeof out.answer === 'string') {
    return {
      answer: out.answer,
      grounded: out.grounded !== false,
      citations: Array.isArray(out.citations)
        ? out.citations.filter(c => c && typeof c.quote === 'string').slice(0, 6).map(c => ({ quote: String(c.quote).slice(0, 600), note: String(c.note || '').slice(0, 400) }))
        : [],
      confidence: ['low', 'medium', 'high'].includes(out.confidence) ? out.confidence : 'low',
    }
  }
  return { answer: '', grounded: false, citations: [], confidence: 'low' }
}

async function chatJSON(body) {
  const text = await chat(body)
  try {
    return JSON.parse(stripFences(text))
  } catch {
    return null
  }
}

function clip(s, n) {
  const t = String(s || '')
  return t.length > n ? `${t.slice(0, n)}\n…[truncated]` : t
}

function stripFences(s = '') {
  const t = s.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  }
  return t
}
