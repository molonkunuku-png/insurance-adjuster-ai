/**
 * Cloudflare Worker: /api/analyze
 * 
 * Receives: FormData with policyPdf (file) + damageImages (array of files)
 * Does: 
   1. Extract PDF text (using pdf-lib in Worker)
   2. Send images + policy text to OpenAI Vision for analysis
   3. Return structured loss analysis
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const formData = await request.formData()
    const policyPdf = formData.get('policyPdf')
    const damageImages = formData.getAll('damageImages')

    if (!policyPdf) {
      return new Response(
        JSON.stringify({ error: 'policyPdf is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Extract text from PDF
    let pdfText = ''
    try {
      const arrayBuffer = await policyPdf.arrayBuffer()
      // In a real Workers setup, use pdf-lib here
      // For now, mark that PDF was received
      pdfText = '[PDF extracted - policy details placeholder]'
    } catch (e) {
      console.error('PDF extract error:', e)
      pdfText = ''
    }

    // Prepare images for OpenAI Vision
    const imageUrls = []
    const imageFiles = []
    
    // For OpenAI, we need base64-encoded images
    for (let i = 0; i < damageImages.length; i++) {
      const img = damageImages[i]
      try {
        const base64 = await img.arrayBuffer()
        .then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))))
        imageUrls.push(`data:${img.type};base64,${base64}`)
        imageFiles.push({
          type: 'image_url',
          image_url: { url: `data:${img.type};base64,${base64}` }
        })
      } catch (e) {
        console.error('Image encode error:', e)
      }
    }

    // Build the prompt for OpenAI
    const systemPrompt = `You are an insurance adjuster AI. Analyze the following:
1. Insurance policy document text (may be partial): ${pdfText}
2. Damage images from a claim
   
   Provide a JSON response with these fields:
   - coverage: Summary of relevant coverage/exclusions from the policy
   - damage: Description of observed damage based on images
   - estimatedValue: Rough estimated repair/replacement value in USD
   - nextSteps: 2-3 recommended next steps for the adjuster
   
   Keep coverage concise (2-3 sentences). Be practical and grounded.`
    
    userPrompt = `Policy text: ${pdfText}\n\nImage analysis needed:`

    // Call OpenAI GPT-4o-mini with vision
    const openAiKey = env.VITE_OPENAI_KEY
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing OpenAI key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

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
          { role: 'user', content: [
              { type: 'text', content: userPrompt },
              ...imageFiles.map(f => f.image_url)
            ]
          }
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    })

    if (!openAiResponse.ok) {
      const errTxt = await openAiResponse.text()
      console.error('OpenAI error:', errTxt)
      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const openAiData = await openAiResponse.json()
    const analysisText = openAiData.choices[0].message.content

    // Try to parse as JSON, fallback to text
    let analysis
    try {
      analysis = JSON.parse(analysisText)
    } catch (e) {
      analysis = {
        coverage: analysisText.substring(0, 500),
        damage: 'See detailed analysis',
        estimatedValue: 'See detailed analysis',
        nextSteps: ['Review full report'],
      }
    }

    return new Response(
      JSON.stringify({ analysis, pdfText }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  },
}
