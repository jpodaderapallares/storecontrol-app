import { Outlet, useNavigate, NavLink, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/stores/authStore'
import { ShieldCheck, LogOut, BookOpen, QrCode, Home, ChevronLeft, Menu, X } from 'lucide-react'
import { format } from 'date-fns'
import { es, enGB, pl } from 'date-fns/locale'
import clsx from 'clsx'
import { useT } from '@/lib/i18n'
import LangSelector from '@/components/ui/LangSelector'
import { AsistenteIA } from '@/components/ui/AsistenteIA'

const dateLocaleMap = { es, en: enGB, pl } as const
const dateFormatByLang = {
  es: "EEEE d 'de' MMMM yyyy",
  en: 'EEEE d MMMM yyyy',
  pl: 'EEEE d MMMM yyyy',
} as const

export default function StorekeeperLayout() {
  const { usuario, base, logout } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const { t, lang } = useT()
  const hoy = format(new Date(), dateFormatByLang[lang], { locale: dateLocaleMap[lang] })
  const [logoOk, setLogoOk] = useState(true)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  async function doLogout() { await logout(); nav('/login') }

  const inicioPath = `/base/${base?.codigo_iata}`
  const enInicio = location.pathname === inicioPath
  const enSubpagina = !enInicio

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-bg-surface border-b sticky top-0 z-30 backdrop-blur-sm">
        {/* Fila superior — logo + base + botón menú móvil */}
        <div className="max-w-[1600px] mx-auto px-3 sm:px-8 py-3 sm:py-4 flex items-center gap-3 sm:gap-6">
          <Link
            to={inicioPath}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity min-w-0"
            title={t('layout.back_to_home')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent grid place-items-center shadow-sm flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base sm:text-xl font-extrabold leading-none truncate">StoreControl</div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5 hidden sm:block">{t('layout.tagline')}</div>
            </div>
            {logoOk && (
              <img
                src="/hla-logo.png"
                alt="HLA"
                className="h-7 sm:h-8 w-auto ml-2 opacity-90 hidden sm:block"
                onError={() => setLogoOk(false)}
              />
            )}
          </Link>

          <div className="h-10 w-px bg-bg-border mx-0 sm:mx-1 hidden sm:block" />

          <Link to={inicioPath} className="hover:opacity-90 transition-opacity min-w-0" title={t('layout.back_to_home')}>
            <div className="iata text-xl sm:text-2xl">{base?.codigo_iata ?? '—'}</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-mono truncate max-w-[120px] sm:max-w-none">{base?.nombre_completo}</div>
          </Link>

          <div className="flex-1" />

          {/* Nav desktop */}
          <nav className="hidden lg:flex items-center gap-1.5">
            <NavTab to={inicioPath} icon={Home} label={t('nav.home')} tooltip={t('nav.home_tooltip')} end />
            <NavTab
              to={`${inicioPath}/biblioteca`}
              icon={BookOpen}
              label={t('nav.library')}
              tooltip={t('nav.library_tooltip')}
            />
            <NavTab
              to={`${inicioPath}/qr`}
              icon={QrCode}
              label={t('nav.qr')}
              tooltip={t('nav.qr_tooltip')}
            />
          </nav>

          {/* Bloque desktop derecho */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="h-10 w-px bg-bg-border mx-1" />
            <LangSelector variant="header" />
            <div className="text-right">
              <div className="text-sm font-medium" title={usuario?.email}>{usuario?.nombre}</div>
              <div className="text-[11px] text-slate-500 font-mono capitalize">{hoy}</div>
            </div>
            <button onClick={doLogout} className="btn-ghost" title={t('layout.logout')}>
              <LogOut className="w-4 h-4" /> {t('layout.exit')}
            </button>
          </div>

          {/* Botón hamburger — solo tablet/móvil */}
          <button
            className="lg:hidden p-2 -mr-1 rounded-lg hover:bg-bg-elevated text-slate-300"
            onClick={() => setMenuMovilAbierto(v => !v)}
            aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuMovilAbierto ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Menú móvil desplegable */}
        {menuMovilAbierto && (
          <div className="lg:hidden border-t border-bg-border bg-bg-surface px-3 py-3 space-y-2" onClick={() => setMenuMovilAbierto(false)}>
            <div className="flex flex-col gap-1.5">
              <NavTab to={inicioPath} icon={Home} label={t('nav.home')} tooltip="" end />
              <NavTab
                to={`${inicioPath}/biblioteca`}
                icon={BookOpen}
                label={t('nav.library')}
                tooltip=""
              />
              <NavTab
                to={`${inicioPath}/qr`}
                icon={QrCode}
                label={t('nav.qr')}
                tooltip=""
              />
            </div>
            <div className="border-t border-bg-border pt-2 mt-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" title={usuario?.email}>{usuario?.nombre}</div>
                <div className="text-[10px] text-slate-500 font-mono">{hoy}</div>
              </div>
              <div className="flex items-center gap-2">
                <LangSelector variant="header" />
                <button
                  onClick={(e) => { e.stopPropagation(); doLogout() }}
                  className="btn-ghost"
                  title={t('layout.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Breadcrumb / botón Volver — solo en sub-páginas */}
        {enSubpagina && (
          <div className="max-w-[1600px] mx-auto px-3 sm:px-8 pb-3">
            <Link
              to={inicioPath}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-accent transition-colors font-mono"
              title={t('layout.back_to_home')}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t('layout.back_to_home')} · {base?.codigo_iata}
            </Link>
          </div>
        )}
      </header>

      <main className="max-w-[1600px] mx-auto p-3 sm:p-8">
        <Outlet />
      </main>

      <AsistenteIA />
    </div>
  )
}

function NavTab({
  to, icon: Icon, label, tooltip, end,
}: {
  to: string; icon: any; label: string; tooltip: string; end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={tooltip}
      className={({ isActive }) =>
        clsx(
          'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors',
          isActive
            ? 'bg-accent/15 text-accent border-accent/30'
            : 'bg-bg-elevated/40 text-slate-300 border-bg-border hover:text-slate-100 hover:bg-bg-elevated',
        )
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  )
}
