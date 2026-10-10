/**
 * Client-side upload guards: magic-byte sniffing + size caps.
 * Mirrors the server allowlist in server/src/app.js (looksLikeImage).
 * PDFs are checked for the %PDF header; images for JPEG/PNG/GIF/WebP.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PDF_BYTES = 15 * 1024 * 1024
const SNIFF_LEN = 16

function hex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sniffKind(file) {
  try {
    const buf = new Uint8Array(await file.slice(0, SNIFF_LEN).arrayBuffer())
    const h = hex(buf)
    const ascii = String.fromCharCode(...buf.slice(0, 8))
    if (ascii.startsWith('%PDF')) return 'pdf'
    if (h.startsWith('ffd8ff')) return 'jpg'
    if (h.startsWith('89504e47')) return 'png'
    if (ascii.startsWith('GIF8')) return 'gif'
    if (ascii.startsWith('RIFF') && hex(buf.slice(8, 12)) === '57454250') return 'webp'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function isImageKind(kind) {
  return kind === 'jpg' || kind === 'png' || kind === 'gif' || kind === 'webp'
}
