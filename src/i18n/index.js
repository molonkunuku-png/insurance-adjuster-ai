import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import en from './en.json'
import ms from './ms.json'

const dict = { en, ms }
const I18nContext = createContext({ lang: 'en', t: (key, fb) => fb ?? key, setLang: () => {} })

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('themis-lang') || 'en' } catch { return 'en' }
  })
  useEffect(() => {
    document.documentElement.lang = lang === 'ms' ? 'ms' : 'en'
    try { localStorage.setItem('themis-lang', lang) } catch { /* ignore */ }
  }, [lang])
  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, fallback) => dict[lang]?.[key] ?? fallback ?? key,
  }), [lang])
  return React.createElement(I18nContext.Provider, { value }, children)
}

export function useI18n() {
  return useContext(I18nContext)
}

/** Locale-aware formatting bound to the active language (en-US / ms-MY). */
export function useFormat() {
  const { lang } = useI18n()
  const locale = lang === 'ms' ? 'ms-MY' : 'en-US'
  return useMemo(() => ({
    locale,
    num: (n) => new Intl.NumberFormat(locale).format(Number(n) || 0),
    dateTime: (ts) => {
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts))
      } catch {
        return new Date(ts).toLocaleString()
      }
    },
  }), [locale])
}

export const LANGS = [
  { id: 'en', label: 'EN' },
  { id: 'ms', label: 'BM' },
]
