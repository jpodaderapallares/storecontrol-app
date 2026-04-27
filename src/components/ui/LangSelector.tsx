import { useState, useRef, useEffect } from 'react'
import { Globe, Check } from 'lucide-react'
import { useT, LANGS, type Lang } from '@/lib/i18n'
import clsx from 'clsx'

/**
 * Selector de idioma compacto. Muestra un icono globo + bandera del idioma actual,
 * y al pulsar abre un menú con las 3 opciones (ES / EN / PL).
 */
export default function LangSelector({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const { lang, setLang, t } = useT()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  function elegir(l: Lang) {
    setLang(l)
    setAbierto(false)
  }

  const actual = LANGS.find(l => l.code === lang) ?? LANGS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        title={t('layout.language')}
        aria-label={t('layout.language')}
        className={clsx(
          'inline-flex items-center gap-2 rounded-lg border transition-colors',
          variant === 'header'
            ? 'px-3 py-2 text-sm bg-bg-elevated/40 border-bg-border hover:bg-bg-elevated text-slate-200'
            : 'px-2.5 py-2 w-full text-sm bg-bg-elevated/40 border-bg-border hover:bg-bg-elevated text-slate-300',
        )}
      >
        <Globe className="w-4 h-4" />
        <span>{actual.flag}</span>
        <span className="font-mono text-xs uppercase">{actual.code}</span>
      </button>

      {abierto && (
        <div
          className={clsx(
            'absolute z-50 mt-1 min-w-[180px] rounded-lg border border-bg-border bg-bg-surface shadow-lg overflow-hidden',
            variant === 'header' ? 'right-0' : 'left-0',
          )}
        >
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => elegir(l.code)}
              className={clsx(
                'w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors',
                l.code === lang
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-200 hover:bg-bg-elevated',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">{l.flag}</span>
                <span>{l.label}</span>
              </span>
              {l.code === lang && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
