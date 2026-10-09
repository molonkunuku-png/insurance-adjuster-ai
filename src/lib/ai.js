/**
 * AI client - calls OpenAI directly from the browser
 * The OpenAI key is stored in Cloudflare Pages env vars (VITE_OPENAI_KEY)
 * 
 * NOTE: The key is technically visible in the bundled JS, but this is an MVP
 * for internal/team use. For production, use a Cloudflare Worker proxy.
 */

export async function analyzeDamageAndPolicy(imagesBase64, pdfText) {
  const openAiKey = import.meta.env.VITE_OPENAI_KEY
  if (!openAiKey) {
    throw new Error('OpenAI key not configured - set VITE_OPENAI_KEY in Cloudflare Pages')
  }

  // Build the content parts for vision
  const contentParts = [
    { type: 'text', text: `You are an insurance adjuster AI. Analyze the policy text and damage images.\n\nPolicy text: ${pdfText}\n\nProvide a JSON response with: coverage (2-3 sentences on policy coverage), damage (description of observed damage), estimatedValue (rough USD estimate), nextSteps (2-3 action items). Be concise and grounded.` }
  ]

  // Add images
  for (const img of imagesBase64) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.type};base64,${img.base64}` }
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a precise insurance adjuster AI. Output ONLY valid JSON with keys: coverage, damage, estimatedValue, nextSteps.' },
        { role: 'user', content: contentParts }
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI analysis failed: ${err}`)
  }

  const data = await res.json()
  const content = data.choices[0].message.content

  // Try to parse as JSON, fallback
  let analysis
  try {
    analysis = JSON.parse(content)
  } catch {
    analysis = {
      coverage: content.substring(0, 500),
      damage: 'See detailed analysis',
      estimatedValue: 'See detailed analysis',
      nextSteps: ['Review full report'],
    }
  }

  return analysis
}

export async function generateReport(analysis) {
  const openAiKey = import.meta.env.VITE_OPENAI_KEY
  if (!openAiKey) {
    throw new Error('OpenAI key not configured')
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional insurance claim document specialist. Generate a comprehensive loss report in markdown format based on the analysis data. Include: claim header, executive summary, coverage analysis, damage assessment, estimated costs, next steps, and signature block. Use professional terminology. Do not invent policy details.' },
        { role: 'user', content: JSON.stringify(analysis, null, 2) }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Report generation failed: ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}
