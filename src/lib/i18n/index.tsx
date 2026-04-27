import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TRANSLATIONS, type Lang, LANGS } from './translations'

const STORAGE_KEY = 'storecontrol_lang'

function detectInitialLang(): Lang {
  // 1) localStorage
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null
    if (saved && (saved === 'es' || saved === 'en' || saved === 'pl')) return saved
    // 2) Idioma del navegador
    const nav = (window.navigator?.language ?? 'es').toLowerCase().slice(0, 2)
    if (nav === 'en' || nav === 'pl' || nav === 'es') return nav as Lang
  }
  return 'es'
}

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nCtx | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang())

  function setLang(l: Lang) {
    setLangState(l)
    try { window.localStorage.setItem(STORAGE_KEY, l) } catch (_) { /* ignore */ }
    document.documentElement.lang = l
  }

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nCtx>(() => ({
    lang,
    setLang,
    t(key: string) {
      const dict = TRANSLATIONS[lang]
      if (dict && dict[key]) return dict[key]
      // Fallback: ES (idioma base)
      const fallback = TRANSLATIONS.es[key]
      return fallback ?? key
    },
  }), [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback robusto si alguien renderiza fuera del provider (no debería pasar)
    return {
      lang: 'es' as Lang,
      setLang: (_l: Lang) => {},
      t: (k: string) => TRANSLATIONS.es[k] ?? k,
    }
  }
  return ctx
}

export { LANGS, type Lang }
