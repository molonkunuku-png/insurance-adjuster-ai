import React from 'react'
import { ShieldCheck, ArrowLeft, Lock, EyeOff, FileCheck, KeyRound, ServerOff } from 'lucide-react'
import { useI18n } from '../i18n'

/**
 * Public trust page (Tier 7): plain-language security posture. Static,
 * no auth — the claims an adjuster can verify themselves.
 */
const ROWS = [
  { Icon: ServerOff, k: 'sec.r1t', f: 'Local-first engine', d: 'sec.r1d', df: 'Drafts are computed deterministically. No AI bills, no third-party calls in local mode.' },
  { Icon: EyeOff, k: 'sec.r2t', f: 'We never train on claims', d: 'sec.r2d', df: 'Photos and policy text are processed in-session only and never used for model training.' },
  { Icon: Lock, k: 'sec.r3t', f: 'PII scrubbed in-browser', d: 'sec.r3d', df: 'Emails, phones and long ID numbers are redacted before anything leaves the device.' },
  { Icon: KeyRound, k: 'sec.r4t', f: 'Passwordless sessions', d: 'sec.r4d', df: 'Single-use magic links, revoke-checked sessions, no passwords to phish.' },
  { Icon: FileCheck, k: 'sec.r5t', f: 'Auditable drafts', d: 'sec.r5d', df: 'Claim timeline plus downloadable audit log on every report; human sign-off required.' },
]

export default function TrustPage({ onBack }) {
  const { t } = useI18n()
  return (
    <div className="relative min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--grape)]">
            <ShieldCheck size={17} strokeWidth={2.4} className="text-[#0b0d17]" />
          </span>
          Themis
        </span>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--fg)]">
          <ArrowLeft size={14} /> {t('demo.back', 'Back to app')}
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <h1 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">{t('sec.title', 'How Themis keeps claims safe')}</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-[var(--muted)]">{t('sec.sub', 'Five verifiable facts. No trust-me security.')}</p>
        <div className="mt-8 space-y-3">
          {ROWS.map(r => (
            <div key={r.k} className="surface flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <r.Icon size={19} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{t(r.k, r.f)}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-[var(--muted)]">{t(r.d, r.df)}</span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
