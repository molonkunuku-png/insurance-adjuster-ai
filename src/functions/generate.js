/**
 * Cloudflare Worker: /api/generate
 * 
 * Receives: { analysis, template }
 * Does: Calls OpenAI to generate a full loss report in markdown
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { analysis } = await request.json()

    if (!analysis) {
      return new Response(
        JSON.stringify({ error: 'analysis is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const openAiKey = env.VITE_OPENAI_KEY
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing OpenAI key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const systemPrompt = `You are a professional insurance claim document specialist. 
    Generate a comprehensive loss report markdown document based on the analysis data provided.
    
    The report should include:
    1. Claim header: Type of claim, date range, policy reference
    2. Executive summary: 3-4 sentence overview
    3. Coverage analysis: Detailed coverage/exclusions breakdown
    4. Damage assessment: Detailed findings from the images
    5. Estimated costs: Repair/replacement costs
    6. Recommended next steps: Specific action items
    7. Adjuster signature block
    
    Format: Proper markdown with headings, bullet points, and tables where appropriate.
    Use professional insurance terminology. Be thorough but concise.
    Do not invent policy details not present in the analysis - mark as "not provided" if unknown.`
    
    userPrompt = `Analysis data to base the report on:\n${JSON.stringify(analysis, null, 2)}`

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!openAiResponse.ok) {
      const errTxt = await openAiResponse.text()
      console.error('OpenAI generate error:', errTxt)
      return new Response(
        JSON.stringify({ error: 'Report generation failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const openAiData = await openAiResponse.json()
    const markdownReport = openAiData.choices[0].message.content

    return new Response(
      JSON.stringify({ markdown: markdownReport }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  },
}
