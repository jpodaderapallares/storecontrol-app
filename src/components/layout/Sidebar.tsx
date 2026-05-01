import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'
import {
  LayoutDashboard, ListChecks, Users, Bell, BookOpen,
  FileClock, Settings, LogOut, ShieldCheck, FileText, Mail,
} from 'lucide-react'
import LangSelector from '@/components/ui/LangSelector'

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard', tooltip: 'Panel de control · estado operativo' },
  { to: '/tareas', label: 'Tareas', icon: ListChecks, key: 'tareas', tooltip: 'Gestión de plantillas de tareas' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, key: 'usuarios', tooltip: 'Storekeepers y administradores' },
  { to: '/formatos', label: 'Formatos', icon: FileText, key: 'formatos', tooltip: 'Plantillas en blanco (F005, F014…)' },
  { to: '/alertas', label: 'Alertas', icon: Bell, key: 'alertas', tooltip: 'Tareas vencidas · recordatorios' },
  { to: '/biblioteca', label: 'BT Biblioteca', icon: BookOpen, key: 'biblioteca', tooltip: 'Procedimientos técnicos · LOGN, LOGTRA…' },
  { to: '/emails', label: 'Plantillas email', icon: Mail, key: 'emails', tooltip: 'Plantillas de correo' },
  { to: '/auditoria', label: 'Auditoría', icon: FileClock, key: 'auditoria', tooltip: 'Registro completo de actividad' },
  { to: '/config', label: 'Configuración', icon: Settings, key: 'config', tooltip: 'Ajustes generales' },
]

export default function Sidebar() {
  const { usuario, logout } = useAuth()
  const nav = useNavigate()
  const [logoOk, setLogoOk] = useState(true)
  const [vencidasCount, setVencidasCount] = useState(0)

  useEffect(() => {
    let cancel = false
    async function cargarBadge() {
      const { count } = await supabase
        .from('tareas_instancia')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'vencida')
      if (!cancel) setVencidasCount(count ?? 0)
    }
    cargarBadge()
    const t = setInterval(cargarBadge, 60_000)
    return () => { cancel = true; clearInterval(t) }
  }, [])

  async function handleLogout() {
    await logout(); nav('/login')
  }

  return (
    <aside className="w-[220px] h-screen fixed left-0 top-0 bg-bg-surface border-r border-bg-border flex flex-col">
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center shadow-sm">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display text-lg font-extrabold leading-none">StoreControl</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">HLA · Part 145</div>
          </div>
        </div>
        {logoOk && (
          <div className="flex items-center justify-center bg-bg-elevated/40 rounded-md py-2 px-3">
            <img
              src="/hla-logo.png"
              alt="HLA"
              className="h-7 w-auto opacity-95"
              onError={() => setLogoOk(false)}
            />
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {items.map(({ to, label, icon: Icon, tooltip, key }) => (
          <NavLink
            key={to}
            to={to}
            title={tooltip}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-bg-elevated'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {key === 'alertas' && vencidasCount > 0 && (
              <span className="pill-vencida text-[10px] px-1.5 py-0">{vencidasCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t space-y-2">
        <LangSelector variant="sidebar" />
        <div className="flex items-center gap-3 px-2 py-2">
          <div
            className="w-8 h-8 rounded-full bg-bg-elevated grid place-items-center text-xs font-bold"
            title={usuario?.nombre}
          >
            {usuario?.nombre?.[0] ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" title={usuario?.nombre}>{usuario?.nombre}</div>
            <div className="text-[10px] text-slate-500 font-mono truncate" title={usuario?.email}>{usuario?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded hover:bg-bg-elevated transition-colors"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    </aside>
  )
}
