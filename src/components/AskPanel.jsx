import React, { useRef, useState, useEffect } from 'react'
import {
  Sparkles, ArrowRight, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, FileText, Eye, EyeOff,
} from 'lucide-react'
import { askPolicy } from '../lib/ai'
import { apiErrorMessage, devLog } from '../lib/api'
import { useI18n, useFormat } from '../i18n'

/**
 * Grounded policy Q&A — ask a question about the uploaded policy and get an
 * answer with verbatim citations from that policy text (not general knowledge).
 * Requires a policy to have been parsed in this session.
 */
export default function AskPanel({ policyText }) {
  const { t } = useI18n()
  const { num } = useFormat()
  const CONF = {
    high: { cls: 'lifecycle-approved', label: t('ask.confH', 'High') },
    medium: { cls: 'lifecycle-reviewing', label: t('ask.confM', 'Medium') },
    low: { cls: 'lifecycle-new', label: t('ask.confL', 'Low') },
  }
  const [input, setInput] = useState('')
  const [thread, setThread] = useState([]) // { q, r } where r = { answer, grounded, citations, confidence }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openCitations, setOpenCitations] = useState({})
  const scrollRef = useRef(null)
  const scrollTimer = useRef(null)

  useEffect(() => () => clearTimeout(scrollTimer.current), [])

  const canAsk = Boolean(policyText && policyText.trim())

  const submit = async (e) => {
    e.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    if (!canAsk) {
      setError(t('ask.needPolicy', 'Attach a policy document first — grounded answers are built from your policy text.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await askPolicy(policyText, q, thread.slice(-4))
      setThread(t => [...t, { q, r }])
      setInput('')
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }), 60)
    } catch (err) {
      devLog('[ask]', err)
      setError(apiErrorMessage(err, t, t('ask.failed', 'Ask failed — try again')))
    } finally {
      setBusy(false)
    }
  }

  const toggleCitations = (idx) =>
    setOpenCitations(o => ({ ...o, [idx]: !o[idx] }))

  return (
    <div className="surface fade-in mt-6 overflow-hidden" style={{ animationDelay: '240ms' }}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--grape)]" />
          <span className="text-sm font-semibold">{t('ask.title', 'Ask your policy')}</span>
          <span className="hidden rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] sm:inline">
            {t('ask.tagline', 'grounded answers with citations')}
          </span>
        </div>
        {canAsk ? (
          <span className="badge lifecycle-approved">
            <CheckCircle2 size={11} /> {t('ask.loaded', 'Policy loaded')}
          </span>
        ) : (
          <span className="badge lifecycle-new">
            <AlertTriangle size={11} /> {t('ask.required', 'Policy required')}
          </span>
        )}
      </div>

      <div className="p-5">
        {thread.length === 0 && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-4 text-sm leading-relaxed text-[var(--muted)]">
            {t('ask.emptyA', 'Ask a question about the policy — e.g.')} <span className="text-[var(--fg)]">"{t('ask.ex1', 'Is hail damage covered?')}"</span> {t('ask.or', 'or')}{' '}
            <span className="text-[var(--fg)]">"{t('ask.ex2', "What's the deductible for wind?")}"</span>. {t('ask.emptyB', "Answers quote the exact policy language they're based on so nothing is taken on general knowledge.")}
          </div>
        )}

        {thread.map((turn, i) => {
          const conf = CONF[turn.r?.confidence] || CONF.low
          const cites = turn.r?.citations || []
          const showCites = Boolean(openCitations[i])
          return (
            <div key={i} className="mt-4 first:mt-0">
              <div className="max-w-[85%] break-words rounded-2xl rounded-br-sm border border-[var(--line)] bg-[var(--bg-2)] px-4 py-2.5 text-sm text-[var(--fg)] [overflow-wrap:anywhere]">
                {turn.q}
              </div>
              <div className="mt-2 max-w-[95%] break-words rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {turn.r?.grounded ? (
                    <span className="badge lifecycle-approved"><CheckCircle2 size={11} /> {t('ask.grounded', 'Grounded')}</span>
                  ) : (
                    <span className="badge lifecycle-new"><AlertTriangle size={11} /> {t('ask.notFound', 'Not found in policy')}</span>
                  )}
                  <span className={`badge ${conf.cls}`}>{t('ask.confidence', 'Confidence')} {conf.label}</span>
                </div>
                <div className="whitespace-pre-line">{turn.r?.answer || t('ask.noAnswer', 'No answer received.')}</div>

                {cites.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => toggleCitations(i)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition hover:opacity-80"
                      aria-expanded={showCites}
                    >
                      {showCites ? <EyeOff size={12} /> : <Eye size={12} />}
                      {showCites ? t('ask.hide', 'Hide') : t('ask.show', 'Show')} {cites.length} {cites.length > 1 ? t('ask.citations', 'citations') : t('ask.citation', 'citation')}
                      <ChevronDown size={12} className={`transition ${showCites ? 'rotate-180' : ''}`} />
                    </button>
                    {showCites && (
                      <div className="mt-2 space-y-2">
                        {cites.map((c, j) => (
                          <blockquote key={j} className="rounded-lg border-l-2 border-[var(--grape)] bg-[var(--bg-2)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                            <div className="text-[var(--fg)]">"{c.quote}"</div>
                            {c.note && <div className="mt-1 text-[11px] text-[var(--muted)] opacity-80">{c.note}</div>}
                          </blockquote>
                        ))}
                      </div>
                    )}
                    {/* Print always carries citations: the toggle state must not redact paper output. */}
                    {!showCites && cites.length > 0 && (
                    <div className="print-only mt-2 space-y-2">
                      {cites.map((c, j) => (
                        <blockquote key={`p-${j}`} className="rounded-lg border-l-2 border-[var(--grape)] px-3 py-2 text-xs leading-relaxed">
                          <div>"{c.quote}"</div>
                          {c.note && <div className="mt-1 text-[11px] opacity-80">{c.note}</div>}
                        </blockquote>
                      ))}
                    </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-[var(--rose)]/40 bg-[var(--rose)]/10 px-4 py-3 text-sm text-[var(--rose)]">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 flex items-center gap-2" data-print-hide>
          <div className="min-w-0 flex-1 break-words">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={canAsk ? t('ask.phOn', 'Ask about the policy…') : t('ask.phOff', 'Attach a policy to enable questions')}
            maxLength={1200}
            disabled={busy}
            className="input flex-1"
            aria-label={t('ask.ariaAsk', 'Ask a policy question')}
          />
          <div className="tnum mt-1 text-right text-[10px] text-[var(--muted)]">{num(input.length)}/1200</div>
          </div>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[var(--grape)] to-[var(--accent)] text-[#0b0d17] shadow-lg shadow-[var(--grape)]/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('ask.ariaSend', 'Ask')}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : input.trim() ? <ArrowRight size={16} /> : <Sparkles size={16} />}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          {t('ask.footnote', 'Answers are grounded in the policy text you uploaded this session. Verify page references before relying on them.')}
        </p>
      </div>
      <div ref={scrollRef} />
    </div>
  )
}