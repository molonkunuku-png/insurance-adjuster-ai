/**
 * DOCX export for loss-report drafts.
 *
 * Uses the `docx` package (already a server dependency). Renders the report
 * markdown into a Word document, optionally complementing it with the
 * structured analysis fields (coverage / damage / estimate / next steps).
 *
 * The converter is deliberately conservative: it renders headings, bullet and
 * numbered lists, blockquotes, horizontal rules, bold, italic, and inline code.
 * Markup it does not understand is rendered as plain text rather than dropped.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx'

const MAX_MARKDOWN = 60000

const BRAND = '12D9B0'
const INK = '20242E'
const MUTED = '6B7086'

/** Parse inline conventions in a markdown fragment into docx TextRuns. */
function runs(text) {
  const out = []
  // Split on **bold**, *italic*, and `code` while keeping plain text.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index) }))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), bold: true }))
    } else if (tok.startsWith('`')) {
      out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', color: MUTED }))
    } else if (tok.startsWith('*')) {
      out.push(new TextRun({ text: tok.slice(1, -1), italics: true }))
    } else {
      out.push(new TextRun({ text: tok }))
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last) }))
  return out.length ? out : [new TextRun({ text: '' })]
}

function heading(line, level) {
  const text = line.replace(/^#{1,6}\s*/, '').trim()
  const map = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  }
  return new Paragraph({ heading: map[level] || HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 }, children: runs(text) })
}

function paragraph(text, opts = {}) {
  return new Paragraph({
    children: runs(text),
    spacing: { after: 120 },
    ...(opts.border ? {
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, color: BRAND },
        top: { style: BorderStyle.NONE, size: 0, color: INK },
        bottom: { style: BorderStyle.NONE, size: 0, color: INK },
        right: { style: BorderStyle.NONE, size: 0, color: INK },
      },
      indent: { left: 240 },
      shading: { type: 'clear', fill: 'F2F4F8' },
    } : {}),
  })
}

/** Strictly zero-parser markdown → DOCX. Lines we can't classify become plain text. */
export function markdownToDocx(markdownOrNull) {
  const raw = String(markdownOrNull || '').trim().slice(0, MAX_MARKDOWN)
  const children = []
  let consecutiveBlank = 0

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()

    if (!t) {
      consecutiveBlank += 1
      continue
    }

    const headingMatch = /^#{1,6}\s/.exec(t)
    if (headingMatch) {
      children.push(heading(t, headingMatch[0].length - 1))
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MUTED } },
        spacing: { after: 120 },
        children: [new TextRun({ text: '' })],
      }))
      continue
    }
    const quote = /^>\s?/.exec(t)
    if (quote) {
      children.push(paragraph(t.slice(quote[0].length), { border: true }))
      continue
    }
    const bullet = /^[-*]\s+/.exec(t)
    if (bullet) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '•  ' }), ...runs(t.slice(bullet[0].length))],
        spacing: { after: 80 },
        indent: { left: 360 },
      }))
      continue
    }
    const num = /^(\d+)[.)]\s+/.exec(t)
    if (num) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `${num[1]}.  ` }), ...runs(t.slice(num[0].length))],
        spacing: { after: 80 },
        indent: { left: 360 },
      }))
      continue
    }
    children.push(paragraph(t))
  }

  return children
}

/** Structured analysis block when markdown was not generated yet. */
function analysisBlock(analysis) {
  const a = analysis || {}
  const children = []
  const add = (label, value) => {
    if (!value) return
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: String(value) }),
      ],
    }))
  }
  add('Coverage', a.coverage)
  add('Damage', a.damage)
  add('Estimated value', a.estimatedValue)
  if (Array.isArray(a.nextSteps) && a.nextSteps.length) {
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: 'Next steps:', bold: true })],
    }))
    for (const [i, step] of a.nextSteps.entries()) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        indent: { left: 360 },
        children: [new TextRun({ text: `${i + 1}. ${step}` })],
      }))
    }
  }
  if (a.confidence || a.needsReview != null) {
    const flags = [`Confidence: ${String(a.confidence || 'low')}`, a.needsReview ? 'Needs human review' : ''].filter(Boolean).join(' · ')
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: flags, italics: true, color: MUTED })],
    }))
  }
  children.push(new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({ text: 'This is an AI-drafted draft for human adjuster review — not a binding estimate.', italics: true, color: MUTED })],
  }))
  return children
}

export async function buildDocx({ markdown, analysis }) {
  const children = []
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 240 },
    children: [
      new TextRun({ text: 'Themis Adjuster AI', color: BRAND, bold: true }),
      new TextRun({ text: '   ·   Loss Report Draft', color: MUTED }),
    ],
  }))

  if (markdown) {
    children.push(...markdownToDocx(markdown))
  } else if (analysis) {
    children.push(...analysisBlock(analysis))
  } else {
    children.push(paragraph('Nothing to export.'))
  }

  const doc = new Document({
    creator: 'Themis Adjuster AI',
    title: 'Loss Report (Draft)',
    description: 'AI-drafted loss report requiring human adjuster review',
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}

export function exportFilename() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `themis-loss-report-${stamp}.docx`
}