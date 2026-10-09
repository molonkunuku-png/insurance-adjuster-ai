/**
 * AI client — talks to the Themis API (server).
 * The OpenAI key lives on the server only (OPENAI_API_KEY) and is never
 * bundled into the browser. The browser only calls our own /api endpoints.
 */
import { apiPost } from './api'

export async function analyzeDamageAndPolicy(imagesBase64, pdfText) {
  const { analysis } = await apiPost('/api/analyze', {
    images: imagesBase64,
    policyText: pdfText,
  })
  return analysis
}

export async function generateReport(analysis) {
  const { markdown } = await apiPost('/api/report', { analysis })
  return markdown
}
