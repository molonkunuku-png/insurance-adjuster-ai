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

export const LANGS = [
  { id: 'en', label: 'EN' },
  { id: 'ms', label: 'BM' },
]
