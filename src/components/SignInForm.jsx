import React, { useState, useEffect } from 'react'
import { apiPost, apiErrorMessage } from '../lib/api'
import { useI18n } from '../i18n'

export default function SignInForm({ onRequestAccess }) {
  const { t, lang } = useI18n()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const [accessUrl, setAccessUrl] = useState(null)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const valid = /\S+@\S+\.\S+/.test(email)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || cooldown > 0) return
    setStatus('sending')
    setError('')
    try {
      const res = await apiPost('/api/beta/resend', { email, lang })
      setAccessUrl(res.accessUrl || null)
      setStatus('done')
    } catch (err) {
      if (err?.status === 429 && err?.data?.retryAfter) {
        setCooldown(Number(err.data.retryAfter) || 60)
        setStatus('idle')
        return
      }
      setError(apiErrorMessage(err, t, t('error.generic')))
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
        <h3 className="mt-4 text-lg font-semibold">{accessUrl ? t('signin.doneIn', "You're in") : t('signin.inbox', 'Check your inbox')}</h3>
        {accessUrl ? (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('signin.testMode', "Your sign-in link couldn't be e-mailed — the sender is in test mode.")}
            </p>
            <a
              href={accessUrl}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition hover:brightness-110"
            >
              {t('signin.openWorkspace', 'Open your workspace →')}
            </a>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('signin.inboxBodyA', 'We sent a fresh sign-in link to')} <span className="text-[var(--fg)]">{email}</span>. {t('signin.inboxBodyB', 'Click it to get back in.')}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t('signin.noAccess', "Don't have access yet?")}{' '}
              <button type="button" onClick={onRequestAccess} className="text-[var(--accent)] underline">
                {t('signin.requestIt', 'Request it')}
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
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">{t('signin.email', 'Email')}</span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('signin.emailPh', 'the email you signed up with')}
          className="input"
        />
      </label>

      {status === 'error' && <p className="text-xs text-[var(--rose)]">{error || t('error.generic')}</p>}

      <button
        type="submit"
        disabled={!valid || status === 'sending' || cooldown > 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === 'sending' ? t('signin.sending', 'Sending…')
          : cooldown > 0 ? t('resend.wait', 'Wait {n}s to resend').replace('{n}', cooldown)
          : t('signin.sendLink', 'Email me a sign-in link')}
      </button>
      <p className="text-center text-[11px] text-[var(--muted)]">
        {t('signin.sameEmail', 'Use the same email you originally signed up with.')}
      </p>
    </form>
  )
}
