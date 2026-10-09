import React from 'react'

function LoadingState({ error = false, message = 'Processing…', showProgress }) {
  const progress = showProgress ? (
    <div className="mt-4">
      <div className="text-sm text-[var(--muted)] mb-2">Progress</div>
      <div className="bg-[var(--bg-subtle)] rounded-full h-2 overflow-hidden">
        <div 
          className="bg-[var(--accent)] h-full w-full [width:0%] transition-all duration-500 ease-out"
          style={{ width: `${showProgress.upload}%` }}
        />
        <span>{showProgress.upload}% Upload</span>
        <span className="mx-2">|</span>
        <span>{showProgress.analyze}% AI</span>
        <span className="mx-2">|</span>
        <span>{showProgress.generate}% Report</span>
      </div>
    </div>
  ) : null

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-6 max-w-md w-full">
        <div className="spinner w-20 h-20 rounded-2xl border-4 border-[var(--border)] border-t-[var(--accent)] animate-spin bg-[var(--bg-subtle)]"></div>
        <p className="text-[var(--muted)]">{message}</p>
        {showProgress && (
          <div className="mt-4 text-sm text-[var(--muted)]">
            <span>Upload: {showProgress.upload}%</span>
            <span className="mx-2">|</span>
            <span>AI: {showProgress.analyze}%</span>
            <span className="mx-2">|</span>
            <span>Report: {showProgress.generate}%</span>
          </div>
        )}
        {error && (
          <button
            onClick={() => window.location.reload()}
            className="mt-3 btn btn-ghost text-sm px-4 py-1.5 rounded"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export default LoadingState
