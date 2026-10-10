import React, { createContext, useContext, useMemo, useState } from 'react'
import en from './en.json'
import ms from './ms.json'

const dict = { en, ms }
const I18nContext = createContext({ lang: 'en', t: (key, fb) => fb ?? key, setLang: () => {} })

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en')
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
