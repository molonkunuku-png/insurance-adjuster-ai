import React, { useState, useEffect } from 'react'
import FileUpload from './components/FileUpload'
import ReportPreview from './components/ReportPreview'
import LoadingState from './components/LoadingState'
import GateView from './components/GateView'
import { analyzeDamageAndPolicy, generateReport } from './lib/ai'
import { apiGet, apiPost } from './lib/api'

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--grape)] shadow-lg shadow-[var(--accent)]/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b0d17" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight">Themis</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Adjuster AI</div>
      </div>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--line)] bg-[var(--bg-2)] text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

const FEATURES = [
  { icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', tint: 'var(--accent)', title: 'Instant Analysis', desc: 'Vision AI reads damage in seconds, not hours.' },
  { icon: 'M3 7h18v12H3zM3 7l9 6 9-6', tint: 'var(--grape)', title: 'Policy Parsing', desc: 'Coverage & exclusions extracted automatically.' },
  { icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', tint: 'var(--amber)', title: 'Cost Estimate', desc: 'Grounded repair & replacement valuation.' },
  { icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6', tint: 'var(--rose)', title: 'Signed Report', desc: 'Client-ready loss report in one click.' },
]

function FeatureCard({ f, i }) {
  return (
    <div
      className="surface fade-in group p-5 transition-transform duration-300 hover:-translate-y-1"
      style={{ animationDelay: `${120 + i * 70}ms` }}
    >
      <div
        className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${f.tint} 14%, transparent)`, color: f.tint }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={f.icon} />
        </svg>
      </div>
      <div className="text-sm font-semibold">{f.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{f.desc}</div>
    </div>
  )
}

function StatCard({ label, value, tint, icon, delay }) {
  return (
    <div className="surface fade-in p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-center gap-2 text-[var(--muted)]">
        <span style={{ color: tint }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm leading-relaxed text-[var(--fg)]">{value || '—'}</div>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
      <p className="text-sm text-[var(--muted)]">Loading…</p>
    </div>
  )
}

function App() {
  const [step, setStep] = useState('upload')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('themis-theme') || 'dark')
  const [auth, setAuth] = useState('loading') // loading | in | out
  const [email, setEmail] = useState(null)
  const [accessStatus, setAccessStatus] = useState(null)
  const [gateMode, setGateMode] = useState('signup') // signup | signin

  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light')
    document.body.classList.toggle('dark-theme', theme === 'dark')
    localStorage.setItem('themis-theme', theme)
  }, [theme])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const a = params.get('access')
    if (a) {
      setAccessStatus(a)
      window.history.replaceState({}, '', window.location.pathname)
    }
    apiGet('/api/auth/me')
      .then(d => {
        setAuth(d.authorized ? 'in' : 'out')
        setEmail(d.email || null)
        if (d.authorized) setAccessStatus(null)
      })
      .catch(() => setAuth('out'))
  }, [])

  const logout = async () => {
    try { await apiPost('/api/auth/logout', {}) } catch { /* ignore */ }
    setAuth('out')
    setEmail(null)
    setAccessStatus(null)
    setGateMode('signin')
    setStep('upload')
    setReport(null)
  }

  const handleUpload = async ({ getImagesForAI, getPdfText }) => {
    setStep('analyzing')
    setLoading(true)
    try {
      const images = await getImagesForAI()
      const pdfText = getPdfText()
      if (images.length === 0) {
        alert('Please upload at least one damage image')
        setStep('upload')
        return
      }
      const analysis = await analyzeDamageAndPolicy(images, pdfText)
      setReport({ analysis })
      setStep('result')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      console.error(e)
      alert(e.message || 'AI analysis failed')
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!report?.analysis) return
    setLoading(true)
    try {
      const markdown = await generateReport(report.analysis)
      setReport(r => ({ ...r, markdown }))
    } catch (e) {
      console.error(e)
      alert(e.message || 'Report generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Brand />
          <div className="flex items-center gap-2">
            {auth === 'in' && email && (
              <span className="hidden max-w-[14rem] truncate text-[11px] text-[var(--muted)] sm:inline">{email}</span>
            )}
            {auth === 'in' && (
              <button
                onClick={logout}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
              >
                Sign out
              </button>
            )}
            <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        {auth === 'loading' && <Splash />}
        {auth === 'out' && <GateView accessStatus={accessStatus} mode={gateMode} onModeChange={setGateMode} />}
        {auth === 'in' && (
          <>
            {step === 'upload' && <UploadView onUpload={handleUpload} />}
            {step === 'analyzing' && <LoadingState />}
            {step === 'result' && (
              <ResultView
                report={report}
                loading={loading}
                onGenerate={handleGenerate}
                onBack={() => { setStep('upload'); setReport(null); }}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[var(--line)] py-6 text-center text-xs text-[var(--muted)]">
        Themis Adjuster AI · Built for faster, fairer claims
      </footer>
    </div>
  )
}

function UploadView({ onUpload }) {
  return (
    <div>
      <div className="fade-in mx-auto max-w-2xl text-center" style={{ animationDelay: '0ms' }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          AI-powered claim assessment
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          Turn damage photos into a{' '}
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] bg-clip-text text-transparent">
            complete loss report
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
          Upload a policy document and damage photos. Themis reads the fine print,
          assesses the damage, and drafts an adjuster-ready report in seconds.
        </p>
      </div>

      <div className="fade-in mt-9" style={{ animationDelay: '90ms' }}>
        <FileUpload onUpload={onUpload} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} i={i} />)}
      </div>
    </div>
  )
}

function ResultView({ report, loading, onGenerate, onBack }) {
  const a = report?.analysis || {}
  return (
    <div>
      <div className="fade-in flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          New analysis
        </button>
        <span className="text-xs text-[var(--muted)]">Analysis complete</span>
      </div>

      <div className="fade-in mt-6" style={{ animationDelay: '60ms' }}>
        <h2 className="text-2xl font-bold tracking-tight">Loss assessment</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">AI-generated summary from your policy and photos.</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard label="Coverage" value={a.coverage} tint="var(--accent)" icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" delay={100} />
        <StatCard label="Damage" value={a.damage} tint="var(--grape)" icon="M4 4h16v16H4zM9 9l6 6M15 9l-6 6" delay={160} />
        <StatCard label="Estimated value" value={a.estimatedValue} tint="var(--amber)" icon="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" delay={220} />
        <div className="surface fade-in p-5" style={{ animationDelay: '280ms' }}>
          <div className="mb-2 flex items-center gap-2 text-[var(--rose)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-wider">Next steps</span>
          </div>
          <ul className="space-y-1.5">
            {(a.nextSteps || []).map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--muted)]">
                <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ReportPreview report={report} onGenerate={onGenerate} loading={loading} />
    </div>
  )
}

export default App
