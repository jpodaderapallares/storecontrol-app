import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'
import {
  LayoutDashboard, ListChecks, Building2, Users, Bell, BookOpen,
  FileClock, Settings, LogOut, ShieldCheck, FileText, Mail,
} from 'lucide-react'

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/usuarios', label: 'Usuarios', icon: Users },
  { to: '/formatos', label: 'Formatos', icon: FileText },
  { to: '/alertas', label: 'Alertas', icon: Bell },
  { to: '/biblioteca', label: 'BT Biblioteca', icon: BookOpen },
  { to: '/emails', label: 'Plantillas email', icon: Mail },
  { to: '/auditoria', label: 'Auditoría', icon: FileClock },
  { to: '/config', label: 'Configuración', icon: Settings },
]

export default function Sidebar() {
  const { usuario, logout } = useAuth()
  const nav = useNavigate()

  async function handleLogout() {
    await logout(); nav('/login')
  }

  return (
    <aside className="w-[220px] h-screen fixed left-0 top-0 bg-bg-surface border-r border-bg-border flex flex-col">
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-display text-lg font-extrabold leading-none">StoreControl</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">HLA · Part 145</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-bg-elevated'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-bg-elevated grid place-items-center text-xs font-bold">
            {usuario?.nombre?.[0] ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{usuario?.nombre}</div>
            <div className="text-[10px] text-slate-500 font-mono truncate">{usuario?.email}</div>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded hover:bg-bg-elevated" title="Cerrar sesión">
            <LogOut className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    </aside>
  )
}
