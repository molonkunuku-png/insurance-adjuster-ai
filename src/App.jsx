import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShieldCheck, Zap, ScanText, Calculator, FileText, Sun, Moon, MoonStar,
  Contrast, LogOut, ChevronDown, ScanEye, DollarSign, ListChecks,
  AlertTriangle, CheckCircle2, Clock, Lock, EyeOff, History, Flame,
  Wind, CloudHail, Waves, Droplet, Mountain, Sparkles, X, ShieldAlert, Snowflake, Send, WifiOff, MonitorSmartphone,
} from 'lucide-react'
import FileUpload from './components/FileUpload'
import ReportPreview from './components/ReportPreview'
import LoadingState from './components/LoadingState'
import GateView from './components/GateView'
import DemoPage from './components/DemoPage'
import TrustPage from './components/TrustPage'
import Mascot from './components/Mascot'
import AskPanel from './components/AskPanel'
import { analyzeDamageAndPolicy, generateReport } from './lib/ai'
import { scrubPII } from './lib/privacy'
import { usageStatus, canDraft, recordDraft, FREE_REPORTS_PER_WINDOW } from './lib/plan'
import { apiGet, apiPost, apiErrorMessage, devLog } from './lib/api'
import { I18nProvider, useI18n, useFormat, LANGS } from './i18n'
import { SAMPLE_POLICY, SAMPLE_NOTES, makeSampleImages } from './lib/sample'

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
  const btnRef = useRef(null)
  const current = THEMES.find(t => t.id === theme) || THEMES[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
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
              onClick={() => { onSelect(x.id); setOpen(false); btnRef.current?.focus() }}
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

function OfflineBadge() {
  const { t } = useI18n()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  if (online) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--warn)]">
      <WifiOff size={12} /> {t('net.offline', 'Offline — drafts stay on this device')}
    </span>
  )
}

function FooterStatus() {  const { t } = useI18n()
  const [ok, setOk] = useState(null)
  useEffect(() => {
    let live = true
    apiGet('/api/health').then(
      (h) => { if (live) setOk(Boolean(h?.ok)) },
      () => { if (live) setOk(false) }
    )
    return () => { live = false }
  }, [])
  return (
    <span className="mt-1 flex items-center justify-center gap-1.5" data-print-hide>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${ok === null ? 'bg-[var(--muted)]' : ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
      <span>{ok === null ? t('footer.opsCheck', 'Checking status…') : ok ? t('footer.opsOk', 'All systems operational') : t('footer.opsCheck', 'Checking status…')}</span>
    </span>
  )
}

function SessionsPanel() {
  const { t } = useI18n()
  const { dateTime } = useFormat()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const load = async () => {
    setOpen(o => !o)
    if (rows) return
    try {
      const d = await apiGet('/api/auth/sessions')
      setRows(d.sessions || [])
    } catch {
      setRows([])
    }
  }

  const revoke = async (sid) => {
    try {
      await apiPost('/api/auth/sessions/revoke', { sid })
      setRows(r => (r || []).filter(x => x.sid !== sid))
    } catch { /* ignore */ }
  }

  const revokeOthers = async () => {
    try {
      await apiPost('/api/auth/sessions/revoke', { all: true })
      const d = await apiGet('/api/auth/sessions')
      setRows(d.sessions || [])
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={load}
        aria-label={t('sess.title', 'Sessions')}
        title={t('sess.title', 'Sessions')}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-2.5 text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
      >
        <MonitorSmartphone size={16} />
      </button>
      {open && (
        <div className="surface absolute right-0 z-30 mt-2 w-72 p-4">
          <div className="text-sm font-semibold">{t('sess.title', 'Sessions')}</div>
          {!rows ? (
            <p className="mt-1 text-xs text-[var(--muted)]">…</p>
          ) : rows.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{t('sess.current', 'This device')}</p>
          ) : (
            <>
              <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto">
                {rows.map((s, i) => (
                  <li key={s.sid + i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-2)] px-2.5 py-1.5 text-[11px]">
                    <span className="tnum min-w-0 truncate text-[var(--muted)]" title={s.sid}>
                      {s.current ? t('sess.current', 'This device') : s.sid} · {dateTime(s.expires_at)}
                    </span>
                    {!s.current && (
                      <button onClick={() => revoke(s.sid)} className="flex-shrink-0 text-[var(--muted)] underline transition hover:text-[var(--danger)]">
                        {t('sess.revoke', 'Revoke')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {rows.length > 1 && (
                <button onClick={revokeOthers} className="mt-2 text-[11px] text-[var(--muted)] underline transition hover:text-[var(--danger)]">
                  {t('sess.revokeAll', 'Sign out other sessions')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TelegramPair() {  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(null)
  const [bot, setBot] = useState(null)
  const [dormant, setDormant] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open ])

  const load = async () => {
    setOpen(o => !o)
    if (code || dormant || failed) return
    try {
      const r = await apiGet('/api/telegram/pair')
      setCode(r.code)
      setBot(r.bot || null)
    } catch (e) {
      if (e?.data?.code === 'telegramDisabled') setDormant(true)
      else setFailed(true)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={load}
        aria-label={t('tg.title', 'Link Telegram')}
        title={t('tg.title', 'Link Telegram')}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-2.5 text-[var(--muted)] transition hover:text-[var(--fg)] hover:border-[var(--accent)]"
      >
        <Send size={16} />
      </button>
      {open && (
        <div className="surface absolute right-0 z-30 mt-2 w-64 p-4">
          <div className="text-sm font-semibold">{t('tg.title', 'Link Telegram')}</div>
          {dormant ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{t('tg.dormant', 'Telegram channel is not configured yet')}</p>
          ) : failed ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{t('tg.pairFail', 'Pairing unavailable right now')}</p>
          ) : !code ? (
            <p className="mt-1 text-xs text-[var(--muted)]">…</p>
          ) : (
            <>
              <p className="tnum mt-2 rounded-lg bg-[var(--bg-2)] px-3 py-2 text-center text-lg font-bold tracking-[0.2em]">{code}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{t('tg.hint', 'Send /start <code> to the bot to link this account')}</p>
              {bot && (
                <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] underline">
                  {t('tg.openBot', 'Open the bot')}
                </a>
              )}
            </>
          )}
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
        <span style={{ color: tint }} className="shrink-0"><Icon size={15} /></span>
        <span className="min-w-0 flex-1 break-words text-[11px] font-semibold uppercase leading-snug tracking-wider">{label}</span>
      </div>
      <div className="tnum break-words text-sm leading-relaxed text-[var(--fg)] [overflow-wrap:anywhere]">{value || '—'}</div>
    </div>
  )
}

function Splash() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Mascot size={84} mood="idle" decorative />
      <p className="text-sm text-[var(--muted)]">{t('common.loading', 'Loading…')}</p>
    </div>
  )
}

const CONFIDENCE = {
  high: { cls: 'lifecycle-approved', key: 'result.confHigh', fb: 'High confidence' },
  medium: { cls: 'lifecycle-reviewing', key: 'result.confMed', fb: 'Medium confidence' },
  low: { cls: 'lifecycle-new', key: 'result.confLow', fb: 'Low confidence' },
}

// Module scope (not render): wall-clock stamps for draft-timing proof.
const stampNow = () => Date.now()

// Tamper-evident audit chain (Tier 26-lite): cyrb53 hash links each event
// to the previous. Detects edits/reordering, not cryptographic proof.
function chainEvents(events) {
  let prev = 'GENESIS'
  const h = (s) => {
    let x = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i)
      x = Math.imul(x, 0x01000193) >>> 0
    }
    return x.toString(16).padStart(8, '0')
  }
  return events.map((e) => {
    const at = new Date(e.at).toISOString()
    const hash = h(`${prev}|${e.ev}|${at}`)
    const row = { ev: e.ev, at, prev, hash }
    prev = hash
    return row
  })
}

function App() {
  const { t, lang } = useI18n()
  const { dateTime } = useFormat()
  const [route, setRoute] = useState(() => window.location.hash)
  const [step, setStep] = useState('upload')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('themis-theme') || 'dark')
  const [auth, setAuth] = useState('loading') // loading | in | out
  const [email, setEmail] = useState(null)
  const [accessStatus, setAccessStatus] = useState(null)
  const [gateMode, setGateMode] = useState('signup') // signup | signin
  const [appError, setAppError] = useState('')
  const [planBlocked, setPlanBlocked] = useState(false)
  const [offlineIntent, setOfflineIntent] = useState(false)
  const intentRef = useRef(null)
  const [carrierBrand, setCarrierBrand] = useState(() => {
    try { return localStorage.getItem('themis-brand') || '' } catch { return '' }
  })
  // Public routes (no auth): #/demo zero-signup sample, #/security trust page.
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const goApp = () => { window.location.hash = ''; setRoute('') }
  // Claim timeline (idea 0048+0055): local { ev, at } events for the audit log.
  const [events, setEvents] = useState([])
  // Draft snapshot for cancel-restore + continue-last-claim (ideas #4, 0036).
  const [snap, setSnap] = useState(() => {
    try {
      const raw = localStorage.getItem('themis-snap')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [pendingResume, setPendingResume] = useState(() => {
    try {
      const raw = localStorage.getItem('themis-snap')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [uploadKey, setUploadKey] = useState(0)
  const [armDiscard, setArmDiscard] = useState(false)
  const armTimer = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => () => clearTimeout(armTimer.current), [])

  const logEvent = (ev) => setEvents(prev => [...prev, { ev, at: Date.now() }])

  const lastSnapJson = useRef('')
  const persistSnap = useCallback((s) => {
    const content = JSON.stringify({ n: s.notes, p: s.policy, d: s.damageImages })
    if (content === lastSnapJson.current) return
    lastSnapJson.current = content
    const stamped = { ...s, at: Date.now() }
    setSnap(stamped)
    try {
      const slim = { ...stamped }
      if (JSON.stringify(slim).length > 3500000) {
        slim.damageImages = []
        slim.policy = { ...slim.policy, images: [] }
      }
      localStorage.setItem('themis-snap', JSON.stringify(slim))
    } catch { /* quota or privacy mode — session-only snapshot still works */ }
  }, [])

  // FileUpload only exists while step === 'upload' (UploadView unmounts
  // otherwise), so snapshots arriving here are always from the live form.
  // Memoized: FileUpload's debounced emit must not reschedule on App renders.
  const handleSnap = useCallback((s) => {
    persistSnap(s)
  }, [persistSnap])

  const snapIsEmpty = (s) =>
    !s || (!s.notes?.trim() && !s.policy?.fileName && !s.policy?.text && !(s.policy?.images?.length) && !(s.damageImages?.length))

  useEffect(() => {
    const b = document.body
    ;['dark-theme', 'light-theme', 'contrast-theme', 'dim-theme'].forEach(c => b.classList.remove(c))
    b.classList.add(`${theme}-theme`)
    localStorage.setItem('themis-theme', theme)
  }, [theme])

  // Cursor spotlight — mouse pointers with motion allowed only.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(pointer: coarse)').matches) return
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

  const handleUpload = async ({ files, getImagesForAI, getPdfText, getNotes }) => {
    // Offline intent (Tier 16-lite): hold the claim on-device, offer to run
    // on reconnect. Never auto-fire: the adjuster explicitly re-runs.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      intentRef.current = { files, getImagesForAI, getPdfText, getNotes }
      setOfflineIntent(true)
      setStep('upload')
      return
    }
    // Freemium gate (Tier 9): N free drafts per window, then teach upgrade.
    if (!canDraft()) {
      setPlanBlocked(true)
      setStep('upload')
      return
    }
    setPlanBlocked(false)
    setOfflineIntent(false)
    setStep('analyzing')
    setLoading(true)
    setAppError('')
    logEvent('started')
    const controller = new AbortController()
    abortRef.current = controller
    // eslint-disable-next-line react(purity) -- event-handler timestamp, not render
    const t0 = stampNow()
    try {
      const images = await getImagesForAI()
      // PII never leaves the device: scrub contact patterns client-side.
      const pdfText = scrubPII(getPdfText())
      const sevTags = (files?.damageImages || [])
        .map((f, i) => (f.severity ? `[Photo ${i + 1}: ${f.severity}]` : null))
        .filter(Boolean)
        .join(' ')
      const notes = scrubPII([getNotes(), sevTags].filter(Boolean).join('\n'))
      if (images.length === 0 && !notes.trim()) {
        setAppError(t('error.needInput', 'Add at least one damage photo or a short description of the damage'))
        setStep('upload')
        return
      }
      logEvent('inputs')
      const analysis = await analyzeDamageAndPolicy(images, pdfText, notes, { signal: controller.signal })
      const analyzeMs = Math.round(stampNow() - t0)
      setReport({ analysis, policyText: pdfText || '' , timing: { analyzeMs } })
      recordDraft()
      setStep('result')
      logEvent('analysis')
      scrollTop()
    } catch (e) {
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        logEvent('cancelled')
        setStep('upload')
        return
      }
      devLog(e)
      setAppError(apiErrorMessage(e, t, t('error.analysisFailed', 'AI analysis failed')))
      setStep('upload')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const cancelAnalysis = () => {
    abortRef.current?.abort()
  }

  const handleSample = async () => {
    logEvent('sample')
    const imgs = makeSampleImages()
    await handleUpload({
      getImagesForAI: async () => imgs.map(f => ({ base64: f.base64.split(',')[1], type: f.type })),
      getPdfText: () => SAMPLE_POLICY,
      getNotes: () => SAMPLE_NOTES,
    })
  }

  // Draft-timing proof (Tier 6): per-report durations persisted for aggregates.
  const recordTiming = (ms) => {
    try {
      const arr = JSON.parse(localStorage.getItem('themis-timings') || '[]')
      arr.push({ at: Date.now(), ms })
      localStorage.setItem('themis-timings', JSON.stringify(arr.slice(-50)))
    } catch { /* ignore */ }
  }

  const handleGenerate = async () => {
    if (!report?.analysis) return
    setLoading(true)
    setAppError('')
    const t0 = stampNow()
    try {
      const markdown = await generateReport(report.analysis, lang)
      const reportMs = Math.round(stampNow() - t0)
      setReport(r => ({ ...r, markdown, timing: { ...(r?.timing || {}), reportMs } }))
      recordTiming(reportMs)
      logEvent('report')
    } catch (e) {
      devLog(e)
      setAppError(apiErrorMessage(e, t, t('error.reportFailed', 'Report generation failed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      {route === '#/demo' ? (
        <DemoPage onBack={goApp} />
      ) : route === '#/security' ? (
        <TrustPage onBack={goApp} />
      ) : (
      <>
      <header data-print-hide className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Brand />
          <div className="flex items-center gap-2" data-print-hide>
            <OfflineBadge />
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
            {auth === 'in' && <SessionsPanel />}
            {auth === 'in' && <TelegramPair />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        {auth === 'loading' && <Splash />}
        {appError && auth === 'in' && (
          <div role="alert" className="fade-in mb-6 flex items-start justify-between gap-3 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            <span>{appError}</span>
            <button onClick={() => setAppError('')} aria-label={t('common.dismiss', 'Dismiss')} className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg transition hover:bg-[var(--danger)]/15">
              <X size={14} />
            </button>
          </div>
        )}
        {auth === 'out' && <GateView accessStatus={accessStatus} mode={gateMode} onModeChange={setGateMode} />}
        {auth === 'in' && (
          <>
            {step === 'upload' && (
              <UploadView
                onUpload={handleUpload}
                onSample={handleSample}
                snap={snap}
                uploadKey={uploadKey}
                onSnap={handleSnap}
                onPolicyEvent={(ev) => logEvent(ev)}
                planBlocked={planBlocked}
                onBackToUpload={() => setPlanBlocked(false)}
                carrierBrand={carrierBrand}
                onBrand={(v) => {
                  setCarrierBrand(v)
                  try { localStorage.setItem('themis-brand', v) } catch { /* ignore */ }
                }}
                resume={pendingResume && snapIsEmpty(snap) ? pendingResume : null}
                discardArmed={armDiscard}
                onContinueResume={() => {
                  setSnap(pendingResume ? { ...pendingResume } : null)
                  setPendingResume(null)
                  setArmDiscard(false)
                  setUploadKey(k => k + 1)
                }}
                onDiscardResume={() => {
                  if (!armDiscard) {
                    setArmDiscard(true)
                    clearTimeout(armTimer.current)
                    armTimer.current = setTimeout(() => setArmDiscard(false), 3000)
                    return
                  }
                  setPendingResume(null)
                  setSnap(null)
                  setArmDiscard(false)
                  try { localStorage.removeItem('themis-snap') } catch { /* ignore */ }
                  setUploadKey(k => k + 1)
                }}
                dateTime={dateTime}
                offlineIntent={offlineIntent}
                onRunIntent={() => {
                  const intent = intentRef.current
                  intentRef.current = null
                  setOfflineIntent(false)
                  if (intent) handleUpload(intent)
                }}
                onDiscardIntent={() => {
                  intentRef.current = null
                  setOfflineIntent(false)
                }}
              />
            )}
            {step === 'analyzing' && <LoadingState onCancel={cancelAnalysis} />}
            {step === 'result' && (
              <ResultView
                report={report}
                loading={loading}
                onGenerate={handleGenerate}
                onBack={() => { setStep('upload'); setReport(null); }}
                events={events}
                carrierBrand={carrierBrand}
                onExported={() => logEvent('docx')}
                onSigned={() => logEvent('signed')}
                onGapReview={() => logEvent('gap')}
                onFeedback={() => logEvent('feedback')}
                onMarkdownUpdate={(markdown) => setReport(r => (r ? { ...r, markdown } : r))}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[var(--line)] px-4 py-6 text-center text-xs leading-relaxed text-[var(--muted)] text-balance">
        {t('footer.tagline', 'Themis Adjuster AI · Built for faster, fairer claims')}
        <FooterStatus />
        <span className="mt-1 flex items-center justify-center gap-3" data-print-hide>
          <a href="#/demo" className="underline transition hover:text-[var(--fg)]">{t('footer.demo', 'Live demo')}</a>
          <span aria-hidden="true">·</span>
          <a href="#/security" className="underline transition hover:text-[var(--fg)]">{t('footer.security', 'Security')}</a>
        </span>
      </footer>
      </>
      )}
    </div>
  )
}

function UploadView({ onUpload, onSample, snap, uploadKey, onSnap, onPolicyEvent, resume, discardArmed, onContinueResume, onDiscardResume, dateTime, planBlocked, onBackToUpload, carrierBrand, onBrand, offlineIntent, onRunIntent, onDiscardIntent }) {
  const { t } = useI18n()
  const left = usageStatus().remaining
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
        <h1 className="mt-5 text-[clamp(1.75rem,7vw,3rem)] font-extrabold leading-[1.1] tracking-tight text-balance">
          {t('hero.titleA', 'Turn damage photos into an')}{' '}
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] bg-clip-text text-transparent">
            {t('hero.titleB', 'adjuster-ready draft.')}
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
          {t('hero.subtitle', 'Upload a policy document and damage photos. Themis reads the fine print, assesses the damage, and drafts an adjuster-ready draft with citations for human review.')}
        </p>
      </div>

      <div className="fade-in mt-9" style={{ animationDelay: '90ms' }}>
        {offlineIntent && (
          <div className="surface mb-4 flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="text-sm font-semibold">{t('queue.offlineTitle', "You're offline — claim held on this device")}</div>
            <div className="flex items-center gap-2">
              <button onClick={onDiscardIntent} className="rounded-xl px-3 py-2 text-[13px] text-[var(--muted)] underline transition hover:text-[var(--rose)]">
                {t('queue.discard', 'Discard')}
              </button>
              <button onClick={onRunIntent} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[#0b0d17] transition hover:brightness-110">
                {t('queue.run', 'Run now')}
              </button>
            </div>
          </div>
        )}
        {planBlocked ? (
          <div className="surface p-6 text-center" role="alert">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--warn-soft)] text-[var(--warn)]">
              <Lock size={22} />
            </div>
            <div className="mt-3 text-base font-bold">{t('plan.limitTitle', 'Free draft limit reached')}</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">{t('plan.limitBody', "You've used {n} free drafts this month. Reply to your invite email to raise your limit.").replace('{n}', FREE_REPORTS_PER_WINDOW)}</p>
            <button onClick={onBackToUpload} className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--fg)]">
              {t('plan.back', 'Back')}
            </button>
          </div>
        ) : (
        <>
        {resume && (
          <div className="surface mb-4 flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <History size={17} />
              </span>
              <div>
                <div className="text-sm font-semibold">{t('resume.title', 'Continue your last claim?')}</div>
                {resume.at && (
                  <div className="text-xs text-[var(--muted)]">{t('resume.sub', 'You left a draft {when}.').replace('{when}', dateTime(resume.at))}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onDiscardResume} className="rounded-xl px-3 py-2 text-[13px] text-[var(--muted)] underline transition hover:text-[var(--rose)]">
                {discardArmed ? t('common.confirmTap', 'Tap again to confirm') : t('resume.discard', 'Discard')}
              </button>
              <button onClick={onContinueResume} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[#0b0d17] transition hover:brightness-110">
                {t('resume.continue', 'Continue')}
              </button>
            </div>
          </div>
        )}
        <FileUpload key={uploadKey} initial={snap} onSnapshot={onSnap} onPolicyEvent={onPolicyEvent} onUpload={onUpload} />
        <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
          <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] text-[var(--muted)]">
            {t('plan.left', '{n} free drafts left').replace('{n}', left)}
          </span>
          <label className="flex w-full items-center gap-2 text-[11px] text-[var(--muted)] sm:w-auto">
            <span className="whitespace-nowrap">{t('brand.label', 'Letterhead (optional)')}</span>
            <input
              value={carrierBrand}
              onChange={e => onBrand(e.target.value)}
              placeholder={t('brand.ph', 'Carrier / agency name for reports')}
              maxLength={80}
              className="input w-full py-1.5 text-xs sm:w-52"
            />
          </label>
        </div>
        <button
          onClick={onSample}
          className="mt-3 inline-flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] px-5 py-2.5 text-center text-sm text-[var(--muted)] transition hover:border-[var(--grape)] hover:text-[var(--grape)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2 break-words"><Sparkles size={15} /> {t('sample.button', 'Try a sample claim')}</span>
          <span className="min-w-0 text-xs opacity-70 break-words">{t('sample.sub', 'No uploads needed — see a full draft in seconds.')}</span>
        </button>
        </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEATURES.map((f, i) => <FeatureCard key={f.tKey} f={f} i={i} />)}
      </div>

      <div className="fade-in mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] px-5 py-4 text-center text-[12px] leading-snug text-[var(--muted)] [&>*]:min-w-0" style={{ animationDelay: '240ms' }}>
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

const PERIL_STYLE = {
  wind: { cls: 'peril-wind', Icon: Wind },
  hail: { cls: 'peril-hail', Icon: CloudHail },
  flood: { cls: 'peril-water', Icon: Waves },
  fire: { cls: 'peril-fire', Icon: Flame },
  water: { cls: 'peril-water', Icon: Droplet },
  quake: { cls: 'peril-structural', Icon: Mountain },
  theft: { cls: 'peril-theft', Icon: ShieldAlert },
  snow: { cls: 'peril-hail', Icon: Snowflake },
  lightning: { cls: 'peril-structural', Icon: Zap },
}

function ResultView({ report, loading, onGenerate, onBack, events = [], onExported, onSigned, onMarkdownUpdate, carrierBrand = '', onGapReview, onFeedback }) {
  const { t } = useI18n()
  const { dateTime, num } = useFormat()
  const a = report?.analysis || {}
  const conf = CONFIDENCE[a.confidence] || CONFIDENCE.low
  const perils = Array.isArray(a.perils) ? a.perils : []
  const gaps = Array.isArray(a.gaps) ? a.gaps : []
  const [gapState, setGapState] = useState({})
  const [voted, setVoted] = useState(null)

  const reviewGap = (key, verdict) => {
    setGapState(s => ({ ...s, [key]: verdict }))
    onGapReview?.()
  }

  const vote = (yes) => {
    setVoted(yes)
    try {
      const tally = JSON.parse(localStorage.getItem('themis-accuracy') || '{"yes":0,"no":0}')
      tally[yes ? 'yes' : 'no'] += 1
      localStorage.setItem('themis-accuracy', JSON.stringify(tally))
    } catch { /* ignore */ }
    onFeedback?.()
  }

  const downloadAudit = () => {
    const log = {
      generatedAt: new Date().toISOString(),
      chain: 'cyrb53-link-v1',
      events: chainEvents(events),
      report: { confidence: a.confidence, needsReview: a.needsReview },
    }
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `themis-audit-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div>
      <div className="print-only mb-4 border-b-2 border-black pb-3">
        <div className="text-lg font-bold">{carrierBrand ? `${carrierBrand} · ` : ''}Themis Adjuster AI · {t('report.title', 'Loss report')}</div>
        <div className="text-xs">{t('report.draft', 'Draft — not the final report')}</div>
      </div>
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
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
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
        {perils.length > 0 && (
          <div className="mt-3 flex max-w-full flex-wrap items-center gap-1.5">
            {perils.map(p => {
              const st = PERIL_STYLE[p.key] || PERIL_STYLE.wind
              const src = p.source === 'both'
                ? `${t('peril.inPolicy', 'in policy')} · ${t('peril.inNotes', 'in notes')}`
                : t(p.source === 'policy' ? 'peril.inPolicy' : 'peril.inNotes', p.source)
              return (
                <span key={p.key} className={`peril ${st.cls}`}>
                  <span className="peril-dot" />
                  <st.Icon size={12} />
                  {t(`peril.${p.key}`, p.label)}
                  <span className="opacity-70">· {src}</span>
                </span>
              )
            })}
          </div>
        )}
        <p className="mt-1 text-sm text-[var(--muted)]">{t('result.summary', 'AI-generated summary from your policy and photos.')}</p>
        {report?.timing?.analyzeMs != null && (
          <p className="tnum mt-1 text-xs text-[var(--muted)]">{t('result.took', 'This draft took {n}s').replace('{n}', num(Math.max(1, Math.round(report.timing.analyzeMs / 1000))))}</p>
        )}
        {a.partial && (
          <p className="mt-2 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-4 py-2.5 text-[13px] text-[var(--warn)]">
            {t('result.partial', 'Partial inputs — attach the missing pieces for a complete draft.')}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <StatCard label={t('result.coverage', 'Coverage')} value={a.coverage} tint="var(--accent)" Icon={ShieldCheck} delay={100} />
        <StatCard label={t('result.damage', 'Damage')} value={a.damage} tint="var(--grape)" Icon={ScanEye} delay={160} />
        <StatCard label={t('result.value', 'Estimated value')} value={a.estimatedValue} tint="var(--amber)" Icon={DollarSign} delay={220} />
        <div className="surface fade-in p-5" style={{ animationDelay: '200ms' }}>
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

      <div className="surface fade-in mt-4 p-5" style={{ animationDelay: '210ms' }}>
        <div className="mb-2 flex items-center gap-2 text-[var(--warn)]">
          <AlertTriangle size={15} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{t('gap.title', 'Coverage gaps to verify')}</span>
        </div>
        {gaps.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('gap.clear', 'No checklist gaps detected in the extracted text.')}</p>
        ) : (
          <ul className="space-y-2">
            {gaps.map(g => {
              const verdict = gapState[g.key]
              return (
              <li key={g.key} className="text-sm text-[var(--muted)]">
                <span className="font-semibold text-[var(--fg)]">{t(`gap.${g.key}`, g.label)}</span>
                {g.damageRelevant && (
                  <span className="badge lifecycle-reviewing ml-2">{t('gap.inNotes', 'mentioned in loss notes')}</span>
                )}
                {verdict && (
                  <span className={`badge ml-2 ${verdict === 'accepted' ? 'lifecycle-approved' : 'lifecycle-new'}`}>
                    {verdict === 'accepted' ? t('gap.accepted', 'Confirmed') : t('gap.dismissed', 'Dismissed')}
                  </span>
                )}
                <span className="block text-[13px]">{g.damageRelevant ? t('gap.noteVerify') : t('gap.noteCheck')}</span>
                {!verdict && (
                  <span className="mt-1 flex gap-2">
                    <button onClick={() => reviewGap(g.key, 'accepted')} className="rounded-lg border border-[var(--line)] px-2 py-0.5 text-[11px] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      {t('gap.accept', 'Confirm')}
                    </button>
                    <button onClick={() => reviewGap(g.key, 'dismissed')} className="rounded-lg border border-[var(--line)] px-2 py-0.5 text-[11px] transition hover:text-[var(--muted)]">
                      {t('gap.dismiss', 'Dismiss')}
                    </button>
                  </span>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </div>

      <ReportPreview report={report} onGenerate={onGenerate} loading={loading} onExported={onExported} onSigned={onSigned} onMarkdownUpdate={onMarkdownUpdate} carrierBrand={carrierBrand} />

      <div className="surface fade-in mt-4 p-5" style={{ animationDelay: '210ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{t('feedback.q', 'Was this assessment accurate?')}</span>
          {voted === null ? (
            <span className="flex gap-2">
              <button onClick={() => vote(true)} className="rounded-xl border border-[var(--line)] px-3.5 py-1.5 text-[13px] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                {t('feedback.yes', 'Yes')}
              </button>
              <button onClick={() => vote(false)} className="rounded-xl border border-[var(--line)] px-3.5 py-1.5 text-[13px] transition hover:border-[var(--danger)] hover:text-[var(--danger)]">
                {t('feedback.no', 'No')}
              </button>
            </span>
          ) : (
            <span className="badge lifecycle-approved">
              <CheckCircle2 size={11} /> {t('ev.feedback', 'Feedback recorded')}
            </span>
          )}
        </div>
      </div>

      <div className="surface fade-in mt-6 p-5" style={{ animationDelay: '240ms' }}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <Clock size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('timeline.title', 'Claim timeline')}</span>
          </div>
          <button onClick={downloadAudit} data-print-hide className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--accent)]">
            <FileText size={12} /> {t('audit.download', 'Download audit log')}
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('timeline.empty', 'No events yet — they appear as you work the claim.')}</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <li key={i} className="tnum flex items-baseline justify-between gap-3 text-sm text-[var(--muted)]">
                <span className="min-w-0 flex-1 break-words">{t(`ev.${e.ev}`, e.ev)}</span>
                <span className="shrink-0 text-xs opacity-80">{dateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
