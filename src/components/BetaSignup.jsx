import React, { useState } from 'react'

const ROLES = ['Independent (IA)', 'Staff adjuster', 'CAT adjuster', 'Desk adjuster', 'Other']

const endpoint = import.meta.env.VITE_BETA_FORM_ENDPOINT
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'hello@example.com'

export default function BetaSignup({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', role: ROLES[0], claims: '' })
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const valid = form.name.trim() && /\S+@\S+\.\S+/.test(form.email)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setStatus('sending')
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...form, source: 'themis-beta' }),
        })
        if (!res.ok) throw new Error('request failed')
        setStatus('done')
      } else {
        // Fallback: open the user's mail client pre-filled
        const subject = encodeURIComponent(`Themis beta request — ${form.name}`)
        const body = encodeURIComponent(
          `Name: ${form.name}\nEmail: ${form.email}\nRole: ${form.role}\nClaims/mo: ${form.claims}\n`
        )
        window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`
        setStatus('done')
      }
    } catch {
      setStatus('error')
    }
  }

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

        {status === 'done' ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold">You're on the list</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Thanks {form.name.split(' ')[0]} — we'll email {form.email} with beta access shortly.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
              Free beta · 10 spots
            </span>
            <h3 className="mt-3 text-xl font-bold tracking-tight">Become a beta tester</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Get free lifetime access in exchange for honest feedback. Takes 20 seconds.
            </p>

            <form onSubmit={submit} className="mt-5 space-y-3">
              <Field label="Name">
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Jane Adjuster"
                  className="input"
                />
              </Field>
              <Field label="Work email">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@claimsco.com"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input">
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Claims / month">
                  <input
                    value={form.claims}
                    onChange={e => setForm({ ...form, claims: e.target.value })}
                    placeholder="e.g. 40"
                    className="input"
                  />
                </Field>
              </div>

              {status === 'error' && (
                <p className="text-xs text-[var(--rose)]">Something went wrong. Email us at {contactEmail}.</p>
              )}

              <button
                type="submit"
                disabled={!valid || status === 'sending'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === 'sending' ? 'Sending…' : 'Request beta access'}
              </button>
              <p className="text-center text-[11px] text-[var(--muted)]">
                No spam. We only use this to invite you to the beta.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
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
