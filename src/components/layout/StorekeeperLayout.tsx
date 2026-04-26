import { Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'
import { ShieldCheck, LogOut, BookOpen, QrCode } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function StorekeeperLayout() {
  const { usuario, base, logout } = useAuth()
  const nav = useNavigate()
  const hoy = format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })

  async function doLogout() { await logout(); nav('/login') }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-bg-surface border-b">
        <div className="max-w-[1600px] mx-auto px-8 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display text-xl font-extrabold leading-none">StoreControl</div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">HLA · Part 145</div>
            </div>
          </div>

          <div className="h-10 w-px bg-bg-border mx-2" />

          <div>
            <div className="iata text-2xl">{base?.codigo_iata ?? '—'}</div>
            <div className="text-xs text-slate-400 font-mono">{base?.nombre_completo}</div>
          </div>

          <div className="flex-1" />

          <div className="text-right">
            <div className="text-sm font-medium">{usuario?.nombre}</div>
            <div className="text-[11px] text-slate-500 font-mono capitalize">{hoy}</div>
          </div>

          <Link
            to={`/base/${base?.codigo_iata}/biblioteca`}
            className="btn-secondary"
          >
            <BookOpen className="w-4 h-4" /> Biblioteca BT
          </Link>

          <Link
            to={`/base/${base?.codigo_iata}/qr`}
            className="btn-secondary"
          >
            <QrCode className="w-4 h-4" /> Generar QR
          </Link>

          <button onClick={doLogout} className="btn-ghost" title="Cerrar sesión">
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
