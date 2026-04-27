import { Outlet, useNavigate, NavLink, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/stores/authStore'
import { ShieldCheck, LogOut, BookOpen, QrCode, Home, ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import { es, enGB, pl } from 'date-fns/locale'
import clsx from 'clsx'
import { useT } from '@/lib/i18n'
import LangSelector from '@/components/ui/LangSelector'

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

  async function doLogout() { await logout(); nav('/login') }

  const inicioPath = `/base/${base?.codigo_iata}`
  const enInicio = location.pathname === inicioPath
  const enSubpagina = !enInicio

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-bg-surface border-b sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-8 py-4 flex items-center gap-6">
          {/* Logo StoreControl + HLA — clickable hacia inicio */}
          <Link
            to={inicioPath}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            title={t('layout.back_to_home')}
          >
            <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display text-xl font-extrabold leading-none">StoreControl</div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{t('layout.tagline')}</div>
            </div>
            {logoOk && (
              <img
                src="/hla-logo.png"
                alt="HLA"
                className="h-8 w-auto ml-2 opacity-90"
                onError={() => setLogoOk(false)}
              />
            )}
          </Link>

          <div className="h-10 w-px bg-bg-border mx-1" />

          <Link to={inicioPath} className="hover:opacity-90 transition-opacity" title={t('layout.back_to_home')}>
            <div className="iata text-2xl">{base?.codigo_iata ?? '—'}</div>
            <div className="text-xs text-slate-400 font-mono">{base?.nombre_completo}</div>
          </Link>

          <div className="flex-1" />

          {/* Navegación principal con estado activo */}
          <nav className="flex items-center gap-1.5">
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

        {/* Breadcrumb / botón Volver — solo en sub-páginas */}
        {enSubpagina && (
          <div className="max-w-[1600px] mx-auto px-8 pb-3">
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

      <main className="max-w-[1600px] mx-auto p-8">
        <Outlet />
      </main>
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
