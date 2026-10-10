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

// EICAR antivirus test string: safe to handle, must never pass validation.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

export async function containsEicar(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    // Chunked decode keeps multi-MB files cheap; EICAR is 68 bytes so a
    // 128-byte overlap guarantees no boundary miss.
    const dec = new TextDecoder('utf-8', { fatal: false })
    const STEP = 1 << 20
    for (let i = 0; i < buf.length; i += STEP) {
      const part = dec.decode(buf.slice(i, Math.min(i + STEP + 128, buf.length)), { stream: true })
      if (part.includes(EICAR)) return true
    }
    return false
  } catch {
    return false
  }
}
