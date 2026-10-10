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
  Table,
  TableRow,
  TableCell,
  WidthType,
  Header,
  Footer,
  ExternalHyperlink,
} from 'docx'

const MAX_MARKDOWN = 60000

// Section headings per export language (client sends lang: 'en' | 'ms').
const DOCX_LANG = {
  en: {
    coverage: 'Coverage', damage: 'Damage', estimated: 'Estimated value',
    next: 'Next steps', gaps: 'Coverage gaps to verify', perils: 'Detected perils',
    signoff: 'Adjuster sign-off', reviewBy: 'Reviewing adjuster', date: 'Date',
    draftNote: 'This is an AI-drafted draft for human adjuster review — not a binding estimate.',
    none: 'None detected in the extracted text.',
  },
  ms: {
    coverage: 'Liputan', damage: 'Kerosakan', estimated: 'Anggaran nilai',
    next: 'Langkah seterusnya', gaps: 'Jurang liputan untuk disahkan', perils: 'Peril dikesan',
    signoff: 'Pengesahan penyelaras', reviewBy: 'Penyelaras penyemak', date: 'Tarikh',
    draftNote: 'Ini draf janaan AI untuk semakan penyelaras — bukan anggaran muktamad.',
    none: 'Tiada dikesan dalam teks yang diekstrak.',
  },
}
const pickLang = (lang) => (lang === 'ms' ? DOCX_LANG.ms : DOCX_LANG.en)

const BRAND = '12D9B0'
const INK = '20242E'
const MUTED = '6B7086'

/** Parse inline conventions in a markdown fragment into docx runs. */
function runs(text) {
  const out = []
  // Links first: [label](url) become hyperlink + visible URL in parentheses.
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m
  const pushInline = (frag) => {
    // Split on **bold**, *italic*, and `code` while keeping plain text.
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
    let l2 = 0
    let m2
    while ((m2 = re.exec(frag)) !== null) {
      if (m2.index > l2) out.push(new TextRun({ text: frag.slice(l2, m2.index) }))
      const tok = m2[0]
      if (tok.startsWith('**')) {
        out.push(new TextRun({ text: tok.slice(2, -2), bold: true }))
      } else if (tok.startsWith('`')) {
        out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', color: MUTED }))
      } else if (tok.startsWith('*')) {
        out.push(new TextRun({ text: tok.slice(1, -1), italics: true }))
      } else {
        out.push(new TextRun({ text: tok }))
      }
      l2 = m2.index + tok.length
    }
    if (l2 < frag.length) out.push(new TextRun({ text: frag.slice(l2) }))
  }
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushInline(text.slice(last, m.index))
    out.push(new ExternalHyperlink({
      link: m[2],
      children: [new TextRun({ text: m[1], style: 'Hyperlink' })],
    }))
    out.push(new TextRun({ text: ` (${m[2]})`, color: MUTED }))
    last = m.index + m[0].length
  }
  if (last < text.length) pushInline(text.slice(last))
  return out.length ? out : [new TextRun({ text: '' })]
}

function heading(line, level) {
  const text = line.replace(/^#{1,6}\s*/, '').trim()
  const map = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
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
  let inFence = false
  let tableBuf = []

  const flushTable = () => {
    if (tableBuf.length === 0) return
    // Drop the |---|---| separator row; keep header + body rows.
    const dataRows = tableBuf.filter(r => !/^[\s|:-]+$/.test(r))
    if (dataRows.length === 0) {
      for (const r of tableBuf) children.push(paragraph(r))
    } else {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: dataRows.map((r, ri) => new TableRow({
          children: r.split('|').filter(c => c.trim() !== '').map(cell => new TableCell({
            children: [new Paragraph({ children: runs(cell.trim()) })],
            ...(ri === 0 ? { shading: { type: 'clear', fill: 'F2F4F8' } } : {}),
          })),
        })),
      }))
    }
    tableBuf = []
  }

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()

    if (!t) {
      consecutiveBlank += 1
      continue
    }

    // Fenced code: keep every line break in a monospace paragraph.
    if (/^```/.test(t)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      children.push(new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: line, font: 'Consolas', size: 18 })],
      }))
      continue
    }

    // Pipe-table rows accumulate until a non-table line.
    if (/^\|.*\|\s*$/.test(t) && t.includes('|')) {
      tableBuf.push(t)
      continue
    }
    flushTable()

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
  flushTable()

  return children
}

/** Structured analysis block when markdown was not generated yet. */
function analysisBlock(analysis, lang = 'en') {
  const L = pickLang(lang)
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
  add(L.coverage, a.coverage)
  add(L.damage, a.damage)
  add(L.estimated, a.estimatedValue)
  if (Array.isArray(a.nextSteps) && a.nextSteps.length) {
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: `${L.next}:`, bold: true })],
    }))
    for (const [i, step] of a.nextSteps.entries()) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        indent: { left: 360 },
        children: [new TextRun({ text: `${i + 1}. ${step}` })],
      }))
    }
  }
  if (Array.isArray(a.gaps) && a.gaps.length) {
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: `${L.gaps}:`, bold: true })],
    }))
    for (const g of a.gaps) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        indent: { left: 360 },
        children: [new TextRun({ text: `•  ${g.label || g.key || '?'}: ${g.note || ''}` })],
      }))
    }
  }
  if (Array.isArray(a.perils) && a.perils.length) {
    children.push(new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: `${L.perils}: ${a.perils.map(p => p.label || p.key).join(', ')}` })],
    }))
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
    children: [new TextRun({ text: L.draftNote, italics: true, color: MUTED })],
  }))
  children.push(new Paragraph({
    spacing: { before: 240 },
    children: [
      new TextRun({ text: `${L.signoff}`, bold: true }),
      new TextRun({ text: `\n${L.reviewBy}: _________________________________\n${L.date}: _____________________________________________` }),
    ],
  }))
  return children
}

export async function buildDocx({ markdown, analysis, lang = 'en' }) {
  const children = []
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 240 },
    children: [
      new TextRun({ text: 'Themis Adjuster AI', color: BRAND, bold: true }),
      new TextRun({ text: '   ·   Loss Report Draft', color: MUTED }),
    ],
  }))

  const source = String(markdown || '')
  if (source.trim()) {
    children.push(...markdownToDocx(source))
    if (source.length > MAX_MARKDOWN) {
      children.push(new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: 'Note: the source draft exceeded the export size cap; content after the cap was truncated.', italics: true, color: MUTED })],
      }))
    }
  } else if (analysis) {
    children.push(...analysisBlock(analysis, lang))
  } else {
    children.push(paragraph('Nothing to export.'))
  }

  const letterhead = (text) => new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text, color: MUTED, size: 16 })],
    })],
  })
  const foot = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Themis Adjuster AI · Draft — not the final report · verify before relying', color: MUTED, size: 16 })],
    })],
  })

  const doc = new Document({
    creator: 'Themis Adjuster AI',
    title: 'Loss Report (Draft)',
    description: 'AI-drafted loss report requiring human adjuster review',
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        headers: { default: letterhead('Themis Adjuster AI · Loss Report (Draft)') },
        footers: { default: foot },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}

export function exportFilename() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `themis-loss-report-${stamp}.docx`
}