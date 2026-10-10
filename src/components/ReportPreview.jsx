import React, { useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { FileText, Download, Code2, Eye, Sparkles, RefreshCw, Printer, FileDown, PenLine, CheckCircle2 } from 'lucide-react'
import Mascot from './Mascot'
import { exportDocx } from '../lib/ai'
import { useI18n, useFormat } from '../i18n'

function ReportPreview({ report, onGenerate, loading, onExported, onSigned, onMarkdownUpdate }) {
  const { t } = useI18n()
  const { dateTime } = useFormat()
  const [showRaw, setShowRaw] = useState(false)
  const [busy, setBusy] = useState(null) // 'docx' | null
  const [signName, setSignName] = useState('')
  const [signNote, setSignNote] = useState('')
  const [signed, setSigned] = useState(null) // { name, at }
  const markdown = report?.markdown

  const download = () => {
    const blob = new Blob([markdown || ''], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loss-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const signDraft = () => {
    if (!markdown || !signName.trim()) return
    const at = new Date().toISOString()
    const block = `\n\n## Adjuster sign-off\n${signNote.trim()}\n\nSigned by ${signName.trim()} · ${at}\n`
    onMarkdownUpdate?.((markdown || '') + block)
    setSigned({ name: signName.trim(), at: Date.now() })
    setSignNote('')
    onSigned?.()
  }

  const downloadDocx = async () => {
    setBusy('docx')
    try {
      const blob = await exportDocx({ markdown: report?.markdown, analysis: report?.analysis })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `themis-loss-report-${Date.now()}.docx`
      a.click()
      URL.revokeObjectURL(url)
      onExported?.()
    } catch (e) {
      alert(e.message || t('error.docxFailed', 'DOCX export failed'))
    } finally {
      setBusy(null)
    }
  }

  // Sanitize the rendered markdown: the report body can contain model output
  // derived from untrusted policy text / photo captions (prompt injection),
  // so we never hand raw HTML to the DOM.
  const html = useMemo(() => {
    if (!markdown) return ''
    const raw = marked.parse(markdown, { breaks: true, gfm: true })
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    })
  }, [markdown])

  return (
    <div className="mt-6">
      <div className="surface fade-in overflow-hidden" style={{ animationDelay: '320ms' }}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold">{t('report.title', 'Loss report')}</span>
            <span className="badge lifecycle-reviewing">{t('report.draft', 'Draft — not the final report')}</span>
            {markdown && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                <Sparkles size={10} /> {t('report.generated', 'Generated')}
              </span>
            )}
          </div>
          {markdown && (
            <div className="flex items-center gap-2" data-print-hide>
              <button
                onClick={() => setShowRaw(v => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
              >
                {showRaw ? <><Eye size={12} /> {t('report.preview', 'Preview')}</> : <><Code2 size={12} /> {t('report.markdown', 'Markdown')}</>}
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                <Printer size={12} /> PDF
              </button>
              <button
                onClick={downloadDocx}
                disabled={busy === 'docx'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'docx' ? <RefreshCw size={12} className="animate-spin" /> : <FileDown size={12} />}
                DOCX
              </button>
              <button
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                <Download size={12} /> .md
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {!markdown && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Mascot size={92} mood="idle" decorative />
              <p className="mt-2 text-sm font-medium">{t('report.readyTitle', 'Ready when you are')}</p>
              <p className="max-w-xs text-xs text-[var(--muted)]">
                {t('report.readySub', 'Generate the full loss report to see the draft appear here in seconds.')}
              </p>
            </div>
          )}

          {markdown && showRaw && (
            <pre className="max-h-[28rem] overflow-auto rounded-xl bg-[var(--bg-2)] p-4 font-mono text-xs leading-relaxed text-[var(--muted)]">
              {markdown}
            </pre>
          )}

          {markdown && !showRaw && (
            <div className="prose-report max-h-[32rem] overflow-auto pr-1" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={loading}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--grape)] to-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#0b0d17] shadow-lg shadow-[var(--grape)]/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        data-print-hide
      >
        {loading ? (
          <>
            <RefreshCw size={16} className="animate-spin" />
            {t('report.drafting', 'Drafting report…')}
          </>
        ) : markdown ? (
          <><RefreshCw size={16} /> {t('report.regenerate', 'Regenerate report')}</>
        ) : (
          <><Sparkles size={16} /> {t('report.generate', 'Generate full report')}</>
        )}
      </button>

      {markdown && (
        <div className="surface fade-in mt-4 p-5" data-print-hide>
          <div className="mb-3 flex items-center gap-2 text-[var(--muted)]">
            <PenLine size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('sign.title', 'Adjuster notes & sign-off')}</span>
            {signed && (
              <span className="badge lifecycle-approved ml-auto">
                <CheckCircle2 size={11} /> {t('sign.signed', 'Signed')} · {signed.name} · {dateTime(signed.at)}
              </span>
            )}
          </div>
          {!signed && (
            <div className="space-y-2.5">
              <textarea
                value={signNote}
                onChange={e => setSignNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t('sign.notesPh', 'Adjuster comments on the draft…')}
                className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
              />
              <div className="flex gap-2">
                <input
                  value={signName}
                  onChange={e => setSignName(e.target.value)}
                  placeholder={t('sign.name', 'Your name')}
                  maxLength={120}
                  className="input flex-1"
                />
                <button
                  onClick={signDraft}
                  disabled={!signName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PenLine size={14} /> {t('sign.button', 'Sign this draft')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ReportPreview
