import React from 'react'
import BetaForm from './BetaForm'

const MESSAGES = {
  ok: { tone: 'ok', text: 'Access confirmed — loading your workspace…' },
  invalid: { tone: 'err', text: 'That access link is invalid. Request a new one below.' },
  expired: { tone: 'err', text: 'That access link has expired. Request a new one below.' },
  error: { tone: 'err', text: 'Something went wrong verifying your link. Request a new one below.' },
}

export default function GateView({ accessStatus }) {
  const msg = accessStatus ? MESSAGES[accessStatus] : null
  return (
    <div className="fade-in mx-auto max-w-md pt-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--grape)] shadow-lg shadow-[var(--accent)]/20">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0b0d17" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight">
        Beta access required
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--muted)]">
        Themis is in private beta. Request access and we'll email you a link that opens
        your workspace instantly.
      </p>

      {msg && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
          msg.tone === 'ok'
            ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'border-[var(--rose)]/40 bg-[var(--rose)]/10 text-[var(--rose)]'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="surface mt-6 p-6 text-left">
        <BetaForm />
      </div>
    </div>
  )
}
