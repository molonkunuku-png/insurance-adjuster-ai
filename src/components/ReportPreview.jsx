import React, { useMemo, useState } from 'react'
import { marked } from 'marked'

function ReportPreview({ report, onGenerate, loading }) {
  const [showRaw, setShowRaw] = useState(false)
  const markdown = report?.markdown

  const html = useMemo(() => {
    if (!markdown) return ''
    return marked.parse(markdown, { breaks: true, gfm: true })
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <span className="text-sm font-semibold">Loss report</span>
            {markdown && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                Generated
              </span>
            )}
          </div>
          {markdown && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRaw(v => !v)}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
              >
                {showRaw ? 'Preview' : 'Markdown'}
              </button>
              <button
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                .md
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {!markdown && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
              <div className="skeleton h-3 w-2/3" />
              <p className="mt-3 text-xs text-[var(--muted)]">Generate a full report to fill this in.</p>
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
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0b0d17]/40 border-t-[#0b0d17]" />
            Drafting report…
          </>
        ) : markdown ? (
          'Regenerate report'
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            </svg>
            Generate full report
          </>
        )}
      </button>
    </div>
  )
}

export default ReportPreview
