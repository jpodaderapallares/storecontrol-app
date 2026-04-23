import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), 'dd MMM yyyy', { locale: es }) : '—'

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), "dd MMM yyyy · HH:mm", { locale: es }) : '—'

export const fmtTime = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), 'HH:mm', { locale: es }) : '—'

export const fmtRelativa = (d: string | Date | null | undefined) =>
  d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: es }) : '—'

export const diaSemanaTxt = (n: number | null | undefined) => {
  const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  return n ? dias[n] : '—'
}

export function colorCumplimiento(pct: number) {
  if (pct >= 85) return { text: 'text-success', bg: 'bg-success', badge: 'pill-done' }
  if (pct >= 60) return { text: 'text-warning', bg: 'bg-warning', badge: 'pill-warn' }
  return { text: 'text-danger', bg: 'bg-danger', badge: 'pill-vencida' }
}
