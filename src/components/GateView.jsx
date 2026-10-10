import React from 'react'
import BetaForm from './BetaForm'
import SignInForm from './SignInForm'
import { useI18n } from '../i18n'

// Only genuine failure states get a message. A successful verify redirects with
// ?access=ok but the session cookie makes the app render, so no message needed.

function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[13px] font-medium transition ${
        active ? 'bg-[var(--bg)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--fg)]'
      }`}
    >
      {children}
    </button>
  )
}

export default function GateView({ accessStatus, mode = 'signup', onModeChange }) {
  const { t } = useI18n()
  const MESSAGES = {
    invalid: 'gate.errInvalid',
    expired: 'gate.errExpired',
    error: 'gate.errFailed',
  }
  const msgKey = accessStatus ? MESSAGES[accessStatus] : null
  const signin = mode === 'signin'
  return (
    <div className="fade-in mx-auto max-w-md pt-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--grape)] shadow-lg shadow-[var(--accent)]/20">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0b0d17" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight">{t('gate.title', 'Beta access required')}</h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--muted)]">
        {signin ? t('gate.subSignin', "Enter your email and we'll send you a link to get back in.")
          : t('gate.subSignup', "Themis is in private beta. Request access and we'll email you a link that opens your workspace instantly.")}
      </p>

      {msgKey && (
        <div role="alert" className="mt-5 rounded-xl border border-[var(--rose)]/40 bg-[var(--rose)]/10 px-4 py-3 text-sm text-[var(--rose)]">
          {t(msgKey)}
        </div>
      )}

      <div className="surface mt-6 p-6 text-left">
        <div role="tablist" aria-label={t('gate.title', 'Beta access required')} className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-2)] p-1">
          <Tab active={!signin} onClick={() => onModeChange?.('signup')}>{t('gate.tabSignup', 'Request access')}</Tab>
          <Tab active={signin} onClick={() => onModeChange?.('signin')}>{t('gate.tabSignin', 'Sign in')}</Tab>
        </div>
        {signin ? <SignInForm onRequestAccess={() => onModeChange?.('signup')} /> : <BetaForm />}
      </div>
    </div>
  )
}
