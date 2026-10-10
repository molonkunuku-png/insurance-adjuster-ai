/**
 * Client-side PDF helpers (pdfjs-dist, lazy-loaded).
 *
 * extractPdfText()  — pulls the real policy text out of a text-based PDF and
 *                     sends it to the API. This replaces the old hardcoded
 *                     placeholder in FileUpload.jsx.
 * renderPdfPages()  — for scanned / image-only PDFs that expose no text
 *                     layer, rasterizes the first pages so Vision can read
 *                     them as images instead.
 *
 * pdfjs is imported dynamically so its ~400KB only loads when a user actually
 * attaches a PDF — the rest of the app stays light.
 *
 * Everything runs in the browser: the PDF never leaves the device unless the
 * caller chooses to forward the extracted text.
 */
const TEXT_PAGE_CAP = 30
const RENDER_PAGE_CAP = 4
// Fewer than this many extracted characters ⇒ almost certainly a scanned PDF.
const SCANNED_TEXT_THRESHOLD = 40

let pdfjsPromise
let workerEnsured = false

async function ensureWorker(pdfjs) {
  if (workerEnsured || pdfjs.GlobalWorkerOptions.workerSrc) return
  try {
    const mod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = mod?.default || mod
    workerEnsured = true
    return
  } catch {
    // ignore, try next fallback
  }
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href
    workerEnsured = true
    return
  } catch {
    // ignore, try next fallback
  }
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).href
    workerEnsured = true
    return
  } catch (err2) {
    console.warn('PDF.js worker failed to load:', err2?.message)
  }
}

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist')
      .then(async (pdfjs) => {
        await ensureWorker(pdfjs)
        return pdfjs
      })
  }
  return pdfjsPromise
}

async function open(file) {
  const { getDocument } = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  return getDocument({ data }).promise
}

export async function extractPdfText(file, { maxPages = TEXT_PAGE_CAP } = {}) {
  const pdf = await open(file)
  const pagesToRead = Math.min(pdf.numPages, maxPages)
  const chunks = []
  try {
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const line = content.items.map(it => (typeof it.str === 'string' ? it.str : '')).join(' ')
      chunks.push(line)
    }
  } finally {
    pdf.destroy?.()
  }
  const text = chunks
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return {
    text,
    numPages: pdf.numPages,
    pagesRead: pagesToRead,
    truncated: pdf.numPages > maxPages,
    scanned: text.length < SCANNED_TEXT_THRESHOLD,
  }
}

export async function renderPdfPages(file, { maxPages = RENDER_PAGE_CAP, scale = 1.6 } = {}) {
  const pdf = await open(file)
  const pagesToRender = Math.min(pdf.numPages, maxPages)
  const images = []
  try {
    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      images.push({ base64: canvas.toDataURL('image/jpeg', 0.85), type: 'image/jpeg' })
    }
  } finally {
    pdf.destroy?.()
  }
  return images
}
