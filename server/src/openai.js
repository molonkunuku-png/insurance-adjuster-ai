import { config } from './config.js'

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
    return JSON.parse(stripFences(content))
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

function stripFences(s = '') {
  const t = s.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  }
  return t
}
