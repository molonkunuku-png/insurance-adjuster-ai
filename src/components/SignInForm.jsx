import React, { useState } from 'react'
import { apiPost } from '../lib/api'

export default function SignInForm({ onRequestAccess }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const [accessUrl, setAccessUrl] = useState(null)
  const [error, setError] = useState('')
  const valid = /\S+@\S+\.\S+/.test(email)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setStatus('sending')
    setError('')
    try {
      const res = await apiPost('/api/beta/resend', { email })
      setAccessUrl(res.accessUrl || null)
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16v12H4zM4 6l8 6 8-6" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold">{accessUrl ? "You're in" : 'Check your inbox'}</h3>
        {accessUrl ? (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Your sign-in link couldn't be e-mailed — the sender is in test mode.
            </p>
            <a
              href={accessUrl}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition hover:brightness-110"
            >
              Open your workspace →
            </a>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">
              We sent a fresh sign-in link to <span className="text-[var(--fg)]">{email}</span>. Click it to get back in.
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Don't have access yet?{' '}
              <button type="button" onClick={onRequestAccess} className="text-[var(--accent)] underline">
                Request it
              </button>
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">Email</span>
        <input
          required
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="the email you signed up with"
          className="input"
        />
      </label>

      {status === 'error' && <p className="text-xs text-[var(--rose)]">{error || 'Something went wrong. Please try again.'}</p>}

      <button
        type="submit"
        disabled={!valid || status === 'sending'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      <p className="text-center text-[11px] text-[var(--muted)]">
        Use the same email you originally signed up with.
      </p>
    </form>
  )
}
