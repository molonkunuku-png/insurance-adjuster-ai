/**
 * AI client — talks to the Themis API (server).
 * The OpenAI key lives on the server only (OPENAI_API_KEY) and is never
 * bundled into the browser. The browser only calls our own /api endpoints.
 */
import { apiPost, apiPostBlob } from './api'

export async function analyzeDamageAndPolicy(imagesBase64, pdfText, damageNotes = '', { signal } = {}) {
  const { analysis } = await apiPost('/api/analyze', {
    images: imagesBase64,
    policyText: pdfText,
    damageNotes,
  }, { signal })
  return analysis
}

export async function generateReport(analysis) {
  const { markdown } = await apiPost('/api/report', { analysis })
  return markdown
}

export async function askPolicy(policyText, question, history = []) {
  const { response } = await apiPost('/api/ask', { policyText, question, history })
  return response
}

export async function exportDocx({ markdown, analysis }) {
  return apiPostBlob('/api/export/docx', { markdown, analysis })
}
