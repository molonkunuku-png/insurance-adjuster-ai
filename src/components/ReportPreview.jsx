import React, { useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { FileText, Download, Code2, Eye, Sparkles, RefreshCw } from 'lucide-react'
import Mascot from './Mascot'

function ReportPreview({ report, onGenerate, loading }) {
  const [showRaw, setShowRaw] = useState(false)
  const markdown = report?.markdown

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

  const download = () => {
    const blob = new Blob([markdown || ''], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loss-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-6">
      <div className="surface fade-in overflow-hidden" style={{ animationDelay: '320ms' }}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold">Loss report</span>
            {markdown && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                <Sparkles size={10} /> Generated
              </span>
            )}
          </div>
          {markdown && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRaw(v => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
              >
                {showRaw ? <><Eye size={12} /> Preview</> : <><Code2 size={12} /> Markdown</>}
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
              <Mascot size={92} mood="idle" />
              <p className="mt-2 text-sm font-medium">Ready when you are</p>
              <p className="max-w-xs text-xs text-[var(--muted)]">
                Generate the full loss report to see the draft appear here in seconds.
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
      >
        {loading ? (
          <>
            <RefreshCw size={16} className="animate-spin" />
            Drafting report…
          </>
        ) : markdown ? (
          <><RefreshCw size={16} /> Regenerate report</>
        ) : (
          <><Sparkles size={16} /> Generate full report</>
        )}
      </button>
    </div>
  )
}

export default ReportPreview
