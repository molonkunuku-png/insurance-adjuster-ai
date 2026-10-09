import React, { useState } from 'react'
import { apiPost } from '../lib/api'

const ROLES = ['Independent (IA)', 'Staff adjuster', 'CAT adjuster', 'Desk adjuster', 'Other']

export default function BetaForm({ compact = false }) {
  const [form, setForm] = useState({ name: '', email: '', role: ROLES[0], claims: '' })
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const [granted, setGranted] = useState(false)
  const [accessUrl, setAccessUrl] = useState(null)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const valid = form.name.trim() && /\S+@\S+\.\S+/.test(form.email)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setStatus('sending')
    setError('')
    try {
      const res = await apiPost('/api/beta', { ...form, source: 'themis-beta' })
      setGranted(Boolean(res.granted))
      setAccessUrl(res.accessUrl || null)
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setStatus('error')
    }
  }

  const resend = async () => {
    setResent(false)
    try {
      const res = await apiPost('/api/beta/resend', { email: form.email })
      if (res.accessUrl) setAccessUrl(res.accessUrl)
      setResent(true)
    } catch (err) {
      setError(err.message || 'Could not resend')
    }
  }

  if (status === 'done') {
    const waitlist = !granted
    const emailBlocked = granted && accessUrl
    return (
      <div className={compact ? 'text-center' : 'py-4 text-center'}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        {emailBlocked ? (
          <>
            <h3 className="mt-4 text-lg font-semibold">You're in</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Your access link couldn't be e-mailed — the sender is in test mode.
            </p>
            <a
              href={accessUrl}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition hover:brightness-110"
            >
              Open your workspace →
            </a>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              This fallback only shows in test mode and disappears once a sending domain is verified.
            </p>
          </>
        ) : waitlist ? (
          <>
            <h3 className="mt-4 text-lg font-semibold">You're on the list</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Thanks {form.name.split(' ')[0]} — a confirmation is on its way to <span className="text-[var(--fg)]">{form.email}</span>. We'll email your access link as soon as a spot opens.
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-4 text-lg font-semibold">You're in</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Check <span className="text-[var(--fg)]">{form.email}</span> — we emailed your access link. Click it to open Themis.
            </p>
          </>
        )}

        {!emailBlocked && (
          <button
            onClick={resend}
            className="mt-4 text-xs text-[var(--muted)] underline transition hover:text-[var(--accent)]"
          >
            {resent ? 'Access link resent ✓' : "Didn't get it? Resend"}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {!compact && (
        <>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
            Free beta · limited spots
          </span>
          <h3 className="mt-3 text-xl font-bold tracking-tight">Become a beta tester</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Get free access in exchange for honest feedback. Takes 20 seconds.
          </p>
        </>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <Field label="Name">
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Adjuster" className="input" />
        </Field>
        <Field label="Work email">
          <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@claimsco.com" className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input">
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Claims handled / month">
            <input value={form.claims} onChange={e => setForm({ ...form, claims: e.target.value })} placeholder="how many you handle, e.g. 40" className="input" />
          </Field>
        </div>

        {status === 'error' && (
          <p className="text-xs text-[var(--rose)]">{error || 'Something went wrong. Please try again.'}</p>
        )}

        <button
          type="submit"
          disabled={!valid || status === 'sending'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'sending' ? 'Sending…' : 'Request access'}
        </button>
        <p className="text-center text-[11px] text-[var(--muted)]">
          No spam. We only use this to invite you to the beta.
        </p>
      </form>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}
