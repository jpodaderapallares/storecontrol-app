import { CheckCircle2, Circle, AlertTriangle, Clock, UserMinus } from 'lucide-react'
import type { EstadoInstancia } from '@/lib/database.types'

export function EstadoBadge({ estado }: { estado: EstadoInstancia }) {
  switch (estado) {
    case 'completada':
      return <span className="pill-done"><CheckCircle2 className="w-3 h-3" />Completada</span>
    case 'vencida':
      return <span className="pill-vencida"><AlertTriangle className="w-3 h-3" />Vencida</span>
    case 'revisada':
      return <span className="pill-done"><CheckCircle2 className="w-3 h-3" />Revisada</span>
    case 'desasignada':
      return <span className="pill bg-bg-elevated border border-bg-border text-slate-400"><UserMinus className="w-3 h-3" />Desasignada</span>
    case 'pendiente':
    default:
      return <span className="pill-pend"><Circle className="w-3 h-3" />Pendiente</span>
  }
}

export function ClockPill({ text }: { text: string }) {
  return (
    <span className="pill bg-bg-elevated text-slate-300 border border-bg-border">
      <Clock className="w-3 h-3" />{text}
    </span>
  )
}
