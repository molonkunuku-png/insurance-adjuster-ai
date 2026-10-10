import React, { useEffect, useState } from 'react'
import Mascot from './Mascot'
import { useI18n } from '../i18n'

function LoadingState({ onCancel }) {
  const { t } = useI18n()
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  const STEPS = [
    t('loading.s1', 'Reading policy document…'),
    t('loading.s2', 'Analyzing damage photos…'),
    t('loading.s3', 'Cross-referencing coverage…'),
    t('loading.s4', 'Estimating repair value…'),
    t('loading.s5', 'Drafting findings…'),
  ]
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % STEPS.length), 1400)
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => { clearInterval(id); clearInterval(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fade-in flex min-h-[60vh] flex-col items-center justify-center text-center" role="status" aria-live="polite">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 blur-2xl" style={{ animation: 'pulseGlow 2.4s ease-in-out infinite' }} />
        <Mascot size={104} mood="idle" decorative className="relative" />
      </div>

      <h2 className="mt-6 text-lg font-semibold">{t('loading.heading', 'Assessing your claim')}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{STEPS[active]}</p>
      <p className="tnum mt-1 text-xs text-[var(--muted)]">{Math.floor((now - startedAt) / 1000)}s {t('loading.elapsed', 'elapsed')}</p>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--danger)] hover:border-[var(--danger)]"
        >
          {t('loading.cancel', 'Cancel analysis')}
        </button>
      )}

      <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-[var(--line)]">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--grape)]" style={{ animation: 'shimmer 1.2s ease-in-out infinite alternate', width: '33%' }} />
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-1.5">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-[var(--accent)]' : 'w-1.5 bg-[var(--line)]'}`} />
        ))}
      </div>
    </div>
  )
}

export default LoadingState
