import React, { useState, useEffect } from 'react'
import { apiPost, apiErrorMessage } from '../lib/api'
import { useI18n } from '../i18n'

const ROLES = [
  { value: 'Independent (IA)', key: 'role.ia' },
  { value: 'Staff adjuster', key: 'role.staff' },
  { value: 'CAT adjuster', key: 'role.cat' },
  { value: 'Desk adjuster', key: 'role.desk' },
  { value: 'Other', key: 'role.other' },
]

export default function BetaForm() {
  const { t, lang } = useI18n()
  const [form, setForm] = useState({ name: '', email: '', role: ROLES[0].value, claims: '', company: '', volume: '' })
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const [granted, setGranted] = useState(false)
  const [accessUrl, setAccessUrl] = useState(null)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const valid = form.name.trim() && /\S+@\S+\.\S+/.test(form.email)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setStatus('sending')
    setError('')
    try {
      const res = await apiPost('/api/beta', { ...form, source: 'themis-beta', lang })
      setGranted(Boolean(res.granted))
      setAccessUrl(res.accessUrl || null)
      setStatus('done')
    } catch (err) {
      setError(apiErrorMessage(err, t, t('error.generic')))
      setStatus('error')
    }
  }

  const resend = async () => {
    if (cooldown > 0) return
    setResent(false)
    setError('')
    try {
      const res = await apiPost('/api/beta/resend', { email: form.email })
      if (res.accessUrl) setAccessUrl(res.accessUrl)
      setResent(true)
    } catch (err) {
      if (err?.status === 429 && err?.data?.retryAfter) {
        setCooldown(Number(err.data.retryAfter) || 60)
        return
      }
      setError(apiErrorMessage(err, t, t('error.generic')))
    }
  }

  if (status === 'done') {
    const waitlist = !granted
    const emailBlocked = granted && accessUrl
    return (
      <div className="py-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        {emailBlocked ? (
          <>
            <h3 className="mt-4 text-lg font-semibold">{t('beta.doneIn', "You're in")}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('beta.testMode', "Your access link couldn't be e-mailed — the sender is in test mode.")}
            </p>
            <a
              href={accessUrl}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition hover:brightness-110"
            >
              {t('beta.openWorkspace', 'Open your workspace →')}
            </a>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              {t('beta.testNote', 'This fallback only shows in test mode and disappears once a sending domain is verified.')}
            </p>
          </>
        ) : waitlist ? (
          <>
            <h3 className="mt-4 text-lg font-semibold">{t('beta.onList', "You're on the list")}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('beta.listThanks', 'Thanks')} {form.name.split(' ')[0]} — {t('beta.listBodyA', 'a confirmation is on its way to')} <span className="text-[var(--fg)]">{form.email}</span>. {t('beta.listBodyB', "We'll email your access link as soon as a spot opens.")}
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-4 text-lg font-semibold">{t('beta.doneIn', "You're in")}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('beta.emailedBodyA', 'Check')} <span className="text-[var(--fg)]">{form.email}</span> — {t('beta.emailedBodyB', 'we emailed your access link. Click it to open Themis.')}
            </p>
          </>
        )}

        {!emailBlocked && (
          <>
            <button
              onClick={resend}
              disabled={cooldown > 0}
              className="mt-4 text-xs text-[var(--muted)] underline transition hover:text-[var(--accent)] disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0
                ? t('resend.wait', 'Wait {n}s to resend').replace('{n}', cooldown)
                : resent ? t('beta.resent', 'Access link resent ✓') : t('beta.resend', "Didn't get it? Resend")}
            </button>
            {error && (
              <p className="mt-2 text-xs text-[var(--rose)]">{error}</p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
          {t('beta.badge', 'Free beta · limited spots')}
        </span>
        <h3 className="mt-3 text-xl font-bold tracking-tight">{t('beta.title', 'Become a beta tester')}</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-[var(--muted)]">
          {t('beta.sub', 'Get free access in exchange for honest feedback. Takes 20 seconds.')}
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <Field label={t('beta.name', 'Name')}>
          <input required autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('beta.namePh', 'Jane Adjuster')} className="input" />
        </Field>
        <Field label={t('beta.workEmail', 'Work email')}>
          <input required autoComplete="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={t('beta.emailPh', 'jane@claimsco.com')} className="input" />
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Field label={t('beta.role', 'Role')}>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input min-w-0 text-[13px] sm:text-sm">
              {ROLES.map(r => <option key={r.value} value={r.value}>{t(r.key, r.value)}</option>)}
            </select>
          </Field>
          <Field label={t('beta.claims', 'Claims handled / month')}>
            <input inputMode="numeric" value={form.claims} onChange={e => setForm({ ...form, claims: e.target.value })} placeholder={t('beta.claimsPh', 'how many you handle, e.g. 40')} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <Field label={t('beta.company', 'Company (optional)')}>
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder={t('beta.companyPh', 'Carrier / agency')} maxLength={120} className="input" />
          </Field>
          <Field label={t('beta.volume', 'Claims / month (optional)')}>
            <input inputMode="numeric" value={form.volume} onChange={e => setForm({ ...form, volume: e.target.value })} placeholder={t('beta.volumePh', 'e.g. 200')} maxLength={20} className="input" />
          </Field>
        </div>

        {status === 'error' && (
          <p role="alert" className="text-xs text-[var(--rose)]">{error || t('error.generic')}</p>
        )}

        <button
          type="submit"
          disabled={!valid || status === 'sending'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'sending' ? t('beta.sending', 'Sending…') : t('beta.request', 'Request access')}
        </button>
        <p className="text-center text-[11px] text-[var(--muted)]">
          {t('beta.noSpam', 'No spam. We only use this to invite you to the beta.')}
        </p>
      </form>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium uppercase leading-snug tracking-normal text-[var(--muted)] text-balance">{label}</span>
      {children}
    </label>
  )
}
