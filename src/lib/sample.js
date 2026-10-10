/**
 * One-tap sample claim (idea 0028): zero-friction trial with no uploads.
 * Policy text + notes are bundled strings; demo photos are generated at
 * runtime on a <canvas> so the bundle stays tiny and it works offline.
 * Every demo image is watermarked SAMPLE so it can never pass as evidence.
 */

export const SAMPLE_POLICY = [
  'SAMPLE HOMEOWNERS POLICY (demo only — not a real policy).',
  'Coverage A - Dwelling: $250,000. Coverage B - Other Structures: $25,000.',
  'Coverage C - Personal Property: $100,000. Coverage D - Loss of Use: $50,000.',
  'Deductible: $1,000 per occurrence. Covered perils: Windstorm, Hail, Fire.',
  'Exclusions: Flood, Earthquake, Wear and tear. Replacement Cost applies to dwelling.',
].join(' ')

export const SAMPLE_NOTES =
  'Windstorm peeled shingles off the south roof slope; one bedroom window cracked; gutters dented — moderate.'

function paintSample(caption) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 640, 480)
  g.addColorStop(0, '#3b3f4d')
  g.addColorStop(1, '#171a23')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 640, 480)
  // Stylized roof slope with missing shingles.
  ctx.fillStyle = '#23262f'
  ctx.beginPath()
  ctx.moveTo(0, 480)
  ctx.lineTo(320, 140)
  ctx.lineTo(640, 480)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0f1117'
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r * 10 + c) % 7 === 0) continue // missing shingles
      ctx.fillRect(40 + c * 56, 200 + r * 44, 50, 38)
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, 640, 56)
  ctx.fillStyle = '#f5c542'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText('SAMPLE — demo photo, not evidence', 18, 36)
  ctx.fillStyle = '#e8eaf0'
  ctx.font = '20px sans-serif'
  ctx.fillText(caption, 18, 452)
  return { base64: canvas.toDataURL('image/png'), type: 'image/png', name: `${caption} (sample)` }
}

export function makeSampleImages() {
  return [
    paintSample('South roof slope — shingle loss'),
    paintSample('Bedroom window — cracked pane'),
  ]
}
