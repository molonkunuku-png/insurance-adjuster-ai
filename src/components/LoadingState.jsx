import React, { useEffect, useState } from 'react'

const STEPS = [
  'Reading policy document…',
  'Analyzing damage photos…',
  'Cross-referencing coverage…',
  'Estimating repair value…',
  'Drafting findings…',
]

function LoadingState() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % STEPS.length), 1400)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fade-in flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 blur-2xl" style={{ animation: 'pulseGlow 2.4s ease-in-out infinite' }} />
        <div className="relative grid h-20 w-20 place-items-center rounded-3xl border border-[var(--line)] bg-[var(--bg-2)]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="floaty">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Assessing your claim</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{STEPS[active]}</p>

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
