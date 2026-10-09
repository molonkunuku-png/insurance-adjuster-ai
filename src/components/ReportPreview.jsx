import React from 'react'

function ReportPreview({ report, onGenerate }) {
  const [showMarkdown, setShowMarkdown] = useState(false)

  return (
    <div>
      {report && report.analysis && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[var(--accent)] hover:text-[var(--accent-hover)]">
            <span>Show analysis preview</span>
          </summary>
          <pre className="mt-2 text-xs text-[var(--muted)]/70 break-all">{JSON.stringify(report.analysis, null, 2)}</pre>
        </details>
      )}

      {report && report.markdown && (
        <div className="mt-4">
          <h3 className="font-semibold mb-3 text-[var(--fg)]">Report Preview</h3>
          
          <button
            onClick={() => setShowMarkdown(!showMarkdown)}
            className="text-sm text-[var(--accent)] mb-2 hover:text-[var(--accent-hover)] underline"
          >
            {showMarkdown ? 'Hide Markdown' : 'Show Markdown'}
          </button>

          {showMarkdown && (
            <pre className="mt-2 rounded bg-[var(--bg-subtle)] p-4 overflow-x-auto text-sm text-[var(--muted)]/60 break-all">
              {report.markdown}
            </pre>
          )}

          {!showMarkdown && (
            <div className="mt-2 rounded bg-[var(--bg-subtle)] p-4 overflow-x-auto">
              <p className="text-sm text-[var(--muted)]/60">{report.markdown.substring(0, 200)}...</p>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={onGenerate}
              disabled={!report.html}
              className={`w-full py-3 bg-[var(--primary)] text-white font-medium rounded hover:bg-[var(--primary)-hover] transition-colors disabled:opacity-50 cursor-not-allowed`}
            >
              {report.html ? 'Download Report' : 'Generating…'}
            </button>
          </div>
        </div>
      )}

      {report && !report.markdown && (
        <p className="mt-2 text-xs text-[var(--error)]">No report yet — click Generate Full Report above.</p>
      )}
    </div>
  )
}

export default ReportPreview
