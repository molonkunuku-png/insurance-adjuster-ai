import React, { useState, useEffect, useRef } from 'react'
import {
  ShieldCheck, Zap, ScanText, Calculator, FileText, Sun, Moon, MoonStar,
  Contrast, LogOut, ChevronDown, ScanEye, DollarSign, ListChecks,
  AlertTriangle, CheckCircle2, Clock, Lock, EyeOff,
} from 'lucide-react'
import FileUpload from './components/FileUpload'
import ReportPreview from './components/ReportPreview'
import LoadingState from './components/LoadingState'
import GateView from './components/GateView'
import Mascot from './components/Mascot'
import AskPanel from './components/AskPanel'
import { analyzeDamageAndPolicy, generateReport } from './lib/ai'
import { apiGet, apiPost } from './lib/api'
import { I18nProvider, useI18n, LANGS } from './i18n'

const THEMES = [
  { id: 'dark', key: 'theme.dark', fb: 'Dark', Icon: Moon },
  { id: 'light', key: 'theme.light', fb: 'Light', Icon: Sun },
  { id: 'dim', key: 'theme.dim', fb: 'Dim (OLED)', Icon: MoonStar },
  { id: 'contrast', key: 'theme.contrast', fb: 'High contrast', Icon: Contrast },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--grape)] shadow-lg shadow-[var(--accent)]/20">
        <ShieldCheck size={20} strokeWidth={2.4} className="text-[#0b0d17]" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight">Themis</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Adjuster AI</div>
      </div>
    </div>
  )
}

function ThemeToggle({ theme, onSelect }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = THEMES.find(t => t.id === theme) || THEMES[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('header.themeLabel', 'Change theme')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-2.5 text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
      >
        <current.Icon size={16} />
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="surface absolute right-0 z-30 mt-2 w-44 overflow-hidden p-1">
          {THEMES.map(x => (
            <button
              key={x.id}
              role="menuitemradio"
              aria-checked={x.id === theme}
              onClick={() => { onSelect(x.id); setOpen(false) }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                x.id === theme ? 'bg-[var(--bg-2)] text-[var(--fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              <x.Icon size={15} />
              {t(x.key, x.fb)}
              {x.id === theme && <CheckCircle2 size={13} className="ml-auto text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LangToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="flex items-center rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-0.5" role="group" aria-label={t('header.langLabel', 'Language')}>
      {LANGS.map(l => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          aria-pressed={l.id === lang}
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
            l.id === lang ? 'bg-[var(--accent)] text-[#0b0d17]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

const FEATURES = [
  { Icon: Zap, tint: 'var(--accent)', tKey: 'feat.t1', tFb: 'Instant Analysis', dKey: 'feat.d1', dFb: 'Vision AI reads damage in seconds, not hours.' },
  { Icon: ScanText, tint: 'var(--grape)', tKey: 'feat.t2', tFb: 'Policy Parsing', dKey: 'feat.d2', dFb: 'Coverage & exclusions extracted automatically.' },
  { Icon: Calculator, tint: 'var(--amber)', tKey: 'feat.t3', tFb: 'Cost Estimate', dKey: 'feat.d3', dFb: 'Grounded repair & replacement valuation.' },
  { Icon: FileText, tint: 'var(--rose)', tKey: 'feat.t4', tFb: 'Signed Report', dKey: 'feat.d4', dFb: 'Client-ready loss report in one click.' },
]

function FeatureCard({ f, i }) {
  const { t } = useI18n()
  const { Icon } = f
  return (
    <div
      className="surface fade-in group p-5 transition-transform duration-300 hover:-translate-y-1"
      style={{ animationDelay: `${120 + i * 70}ms` }}
    >
      <div
        className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${f.tint} 14%, transparent)`, color: f.tint }}
      >
        <Icon size={20} />
      </div>
      <div className="text-sm font-semibold">{t(f.tKey, f.tFb)}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t(f.dKey, f.dFb)}</div>
    </div>
  )
}

function StatCard({ label, value, tint, Icon, delay }) {
  return (
    <div className="surface fade-in p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-center gap-2 text-[var(--muted)]">
        <span style={{ color: tint }}><Icon size={15} /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="tnum text-sm leading-relaxed text-[var(--fg)]">{value || '—'}</div>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Mascot size={84} mood="idle" decorative />
      <p className="text-sm text-[var(--muted)]">Loading…</p>
    </div>
  )
}

const CONFIDENCE = {
  high: { cls: 'lifecycle-approved', key: 'result.confHigh', fb: 'High confidence' },
  medium: { cls: 'lifecycle-reviewing', key: 'result.confMed', fb: 'Medium confidence' },
  low: { cls: 'lifecycle-new', key: 'result.confLow', fb: 'Low confidence' },
}

function App() {
  const { t } = useI18n()
  const [step, setStep] = useState('upload')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('themis-theme') || 'dark')
  const [auth, setAuth] = useState('loading') // loading | in | out
  const [email, setEmail] = useState(null)
  const [accessStatus, setAccessStatus] = useState(null)
  const [gateMode, setGateMode] = useState('signup') // signup | signin

  useEffect(() => {
    const b = document.body
    ;['dark-theme', 'light-theme', 'contrast-theme', 'dim-theme'].forEach(c => b.classList.remove(c))
    b.classList.add(`${theme}-theme`)
    localStorage.setItem('themis-theme', theme)
  }, [theme])

  // Cursor spotlight
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onMove = (e) => {
      const root = document.documentElement
      root.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`)
      root.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

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

  const scrollTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const handleUpload = async ({ getImagesForAI, getPdfText, getNotes }) => {
    setStep('analyzing')
    setLoading(true)
    try {
      const images = await getImagesForAI()
      const pdfText = getPdfText()
      const notes = getNotes()
      if (images.length === 0 && !notes.trim()) {
        alert(t('error.needInput', 'Add at least one damage photo or a short description of the damage'))
        setStep('upload')
        return
      }
      const analysis = await analyzeDamageAndPolicy(images, pdfText, notes)
      setReport({ analysis, policyText: pdfText || '' })
      setStep('result')
      scrollTop()
    } catch (e) {
      console.error(e)
      alert(e.message || t('error.analysisFailed', 'AI analysis failed'))
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
      alert(e.message || t('error.reportFailed', 'Report generation failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Brand />
          <div className="flex items-center gap-2" data-print-hide>
            {auth === 'in' && email && (
              <span className="hidden max-w-[14rem] truncate text-[11px] text-[var(--muted)] sm:inline">{email}</span>
            )}
            {auth === 'in' && (
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
              >
                <LogOut size={14} /> <span className="hidden sm:inline">{t('header.signOut', 'Sign out')}</span>
              </button>
            )}
            <ThemeToggle theme={theme} onSelect={setTheme} />
            <LangToggle />
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
        {t('footer.tagline', 'Themis Adjuster AI · Built for faster, fairer claims')}
      </footer>
    </div>
  )
}

function UploadView({ onUpload }) {
  const { t, lang } = useI18n()
  return (
    <div>
      <div className="fade-in mx-auto max-w-2xl text-center" style={{ animationDelay: '0ms' }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          {t('hero.badge', 'AI-powered claim assessment')}
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          {lang === 'ms' ? (
            t('hero.title')
          ) : (
            <>
              Turn damage photos into an{' '}
              <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] bg-clip-text text-transparent">
                adjuster-ready draft
              </span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
          {t('hero.subtitle', 'Upload a policy document and damage photos. Themis reads the fine print, assesses the damage, and drafts an adjuster-ready draft with citations for human review.')}
        </p>
      </div>

      <div className="fade-in mt-9" style={{ animationDelay: '90ms' }}>
        <FileUpload onUpload={onUpload} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEATURES.map((f, i) => <FeatureCard key={f.tKey} f={f} i={i} />)}
      </div>

      <div className="fade-in mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] px-5 py-4 text-[12px] text-[var(--muted)]" style={{ animationDelay: '360ms' }}>
        <span className="inline-flex items-center gap-2">
          <Lock size={14} className="text-[var(--accent)]" /> {t('trust.1', 'Photos processed in your session only')}
        </span>
        <span className="inline-flex items-center gap-2">
          <EyeOff size={14} className="text-[var(--accent)]" /> {t('trust.2', 'We never train models on your claims')}
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck size={14} className="text-[var(--accent)]" /> {t('trust.3', 'You review and sign the final report')}
        </span>
      </div>
    </div>
  )
}

function ResultView({ report, loading, onGenerate, onBack }) {
  const { t } = useI18n()
  const a = report?.analysis || {}
  const conf = CONFIDENCE[a.confidence] || CONFIDENCE.low
  return (
    <div>
      <div className="fade-in flex items-center justify-between" data-print-hide>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
        >
          {t('result.new', '← New analysis')}
        </button>
        <span className="text-xs text-[var(--muted)]">{t('result.done', 'Analysis complete')}</span>
      </div>

      <div className="fade-in mt-6" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('result.title', 'Loss assessment')}</h2>
          <span className={`badge ${conf.cls}`}>{t(conf.key, conf.fb)}</span>
          {a.needsReview && (
            <span className="badge lifecycle-new" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
              <AlertTriangle size={11} /> {t('result.needsReview', 'Needs human review')}
            </span>
          )}
          <span className="badge lifecycle-approved">
            <Clock size={11} /> {t('result.saved', '≈ 45 min saved vs hand-draft')}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{t('result.summary', 'AI-generated summary from your policy and photos.')}</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard label={t('result.coverage', 'Coverage')} value={a.coverage} tint="var(--accent)" Icon={ShieldCheck} delay={100} />
        <StatCard label={t('result.damage', 'Damage')} value={a.damage} tint="var(--grape)" Icon={ScanEye} delay={160} />
        <StatCard label={t('result.value', 'Estimated value')} value={a.estimatedValue} tint="var(--amber)" Icon={DollarSign} delay={220} />
        <div className="surface fade-in p-5" style={{ animationDelay: '280ms' }}>
          <div className="mb-2 flex items-center gap-2 text-[var(--info)]">
            <ListChecks size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('result.next', 'Next steps')}</span>
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
      <AskPanel policyText={report?.policyText || ''} />
    </div>
  )
}

export default function Root() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  )
}
