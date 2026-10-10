import React from 'react'
import { ShieldCheck, ArrowLeft, FileText, Camera, Scale } from 'lucide-react'
import { useI18n } from '../i18n'
import Mascot from './Mascot'

/**
 * Public zero-signup demo (Tier 5): a static, canned sample draft.
 * No backend, no auth, no uploads — pure presentational proof.
 */
export default function DemoPage({ onBack }) {
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
        <div className="text-center">
          <Mascot size={72} mood="happy" decorative />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('demo.title', 'See a draft before you sign up')}</h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-[var(--muted)]">{t('demo.sub', 'A real adjuster pastes photos + policy. Themis drafts. Human signs. This is what the output looks like.')}</p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { Icon: Camera, k: 'demo.s1t', f: 'Upload photos + policy', d: 'demo.s1d', df: 'Damage shots and the declarations page.' },
            { Icon: Scale, k: 'demo.s2t', f: 'Draft in seconds', d: 'demo.s2d', df: 'Coverage, damage, gaps — cited, flagged.' },
            { Icon: FileText, k: 'demo.s3t', f: 'Human signs', d: 'demo.s3d', df: 'Adjuster notes, sign-off, export.' },
          ].map(s => (
            <div key={s.k} className="surface p-5 text-center">
              <s.Icon size={20} className="mx-auto text-[var(--accent)]" />
              <div className="mt-2 text-sm font-semibold">{t(s.k, s.f)}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{t(s.d, s.df)}</div>
            </div>
          ))}
        </div>
        <div className="surface mt-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
            <FileText size={16} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold">{t('demo.sampleTitle', 'Sample draft — hail loss, dwelling')}</span>
            <span className="badge lifecycle-reviewing">{t('report.draft', 'Draft — not the final report')}</span>
          </div>
          <div className="prose-report space-y-3 p-5 text-sm">
            <p><strong>{t('demo.f1', 'Coverage')}</strong> — {t('demo.f1b', 'Dwelling $250,000; deductible $1,000; windstorm and hail covered; flood excluded (verify against original).')}</p>
            <p><strong>{t('demo.f2', 'Damage')}</strong> — {t('demo.f2b', 'South slope shingle loss, cracked bedroom window, dented gutters. Extent and cause to confirm on site.')}</p>
            <p><strong>{t('demo.f3', 'Gaps to verify')}</strong> — {t('demo.f3b', 'Ordinance & law, replacement-cost basis, loss-of-use limits not detected in excerpt.')}</p>
            <p><strong>{t('demo.f4', 'Estimate')}</strong> — {t('demo.f4b', 'No automated figure in draft mode — the reviewing adjuster prices the verified scope.')}</p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">{t('demo.note', 'Illustrative output. Your drafts cite your actual policy line by line.')}</p>
      </main>
    </div>
  )
}
