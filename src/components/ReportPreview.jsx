import React from 'react'

function ReportPreview({ report, onGenerate }) {
  const [showMarkdown, setShowMarkdown] = useState(false)

  return (
    <div>
      {report && report.analysis && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-accent hover:text-accent/90">
            Show analysis preview
          </summary>
          <pre className="mt-2 text-xs text-muted/70 break-all">{JSON.stringify(report.analysis, null, 2)}</pre>
        </details>
      )}

      {report && report.markdown && (
        <div className="mt-4">
          <h3 className="font-semibold mb-3">Report Preview</h3>
          
          <button
            onClick={() => setShowMarkdown(!showMarkdown)}
            className="text-sm text-accent mb-2 hover:text-accent/90 underline"
          >
            {showMarkdown ? 'Hide Markdown' : 'Show Markdown'}
          </button>

          {showMarkdown && (
            <pre className="mt-2 rounded bg-bg p-4 overflow-x-auto text-sm text-muted/60 break-all">
              {report.markdown}
            </pre>
          )}

          {!showMarkdown && (
            <div className="mt-2 rounded bg-bg p-4 overflow-x-auto">
              <p className="text-sm text-muted/60">{report.markdown.substring(0, 200)}...</p>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={onGenerate}
              disabled={!report.html}
              className={`w-full py-2.5 bg-bg text-accent font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50 cursor-not-allowed`}
            >
              {report.html ? 'Download PDF' : 'Generating…'}
            </button>
          </div>
        </div>
      )}

      {report && !report.markdown && (
        <p className="mt-2 text-xs text-error">No report yet — click Generate Full Report above.</p>
      )}
    </div>
  )
}

export default ReportPreview
