import React from 'react'

function LoadingState({ error = false, message = 'Processing…' }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner w-16 h-16 border-4 border-border border-t-accent rounded-full animate-spin bg-bg"></div>
        <p className="text-muted">{message}</p>
        {error && (
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-1 bg-error text-bg rounded hover:bg-error/90 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export default LoadingState
