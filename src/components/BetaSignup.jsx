import React from 'react'
import BetaForm from './BetaForm'

export default function BetaSignup({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="surface fade-in relative w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] transition hover:text-[var(--fg)]"
          aria-label="Close"
        >
          ✕
        </button>
        <BetaForm />
      </div>
    </div>
  )
}
