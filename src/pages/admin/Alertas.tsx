import { useEffect, useMemo, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  AlertTriangle, BellRing, CheckCheck, Trash2, Eraser, X,
  CheckCircle2, Inbox,
} from 'lucide-react'
import { fmtRelativa } from '@/lib/format'
import clsx from 'clsx'

type Tab = 'incumplimientos' | 'recordatorios' | 'resueltas'

export default function Alertas() {
  const [tab, setTab] = useState<Tab>('incumplimientos')
  const [vencidas, setVencidas] = useState<any[]>([])
  const [revisadas, setRevisadas] = useState<any[]>([])
  const [recordatorios, setRecordatorios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { cargar() }, [])

  function showToast(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }

  async function cargar() {
    setLoading(true)
    const [v, r, rev] = await Promise.all([
      supabase.from('tareas_instancia')
        .select('*, tareas_plantilla(titulo), bases(codigo_iata, nombre_completo), usuarios(nombre, email)')
        .eq('estado', 'vencida')
        .order('fecha_limite', { ascending: false })
        .limit(100),
      supabase.from('notificaciones_log')
        .select('*, tareas_instancia(*, bases(codigo_iata), tareas_plantilla(titulo))')
        .order('enviado_at', { ascending: false }).limit(100),
      supabase.from('tareas_instancia')
        .select('*, tareas_plantilla(titulo), bases(codigo_iata, nombre_completo), usuarios(nombre, email)')
        .eq('estado', 'revisada')
        .order('fecha_limite', { ascending: false })
        .limit(50),
    ])
    setVencidas(v.data ?? [])
    setRecordatorios(r.data ?? [])
    setRevisadas(rev.data ?? [])
    setLoading(false)
  }

  async function marcarRevisada(id: string) {
    setTrabajando(true)
    const { error } = await supabase.from('tareas_instancia').update({ estado: 'revisada' }).eq('id', id)
    if (error) {
      showToast('err', 'No se pudo marcar como revisada: ' + error.message)
    } else {
      await logAccion('alerta_revisada', 'tareas_instancia', id, {})
      showToast('ok', 'Alerta marcada como revisada')
      await cargar()
    }
    setTrabajando(false)
  }

  async function reabrirAlerta(id: string) {
    setTrabajando(true)
    const { error } = await supabase.from('tareas_instancia').update({ estado: 'vencida' }).eq('id', id)
    if (error) {
      showToast('err', 'No se pudo reabrir: ' + error.message)
    } else {
      await logAccion('alerta_reabierta', 'tareas_instancia', id, {})
      showToast('ok', 'Alerta devuelta a Incumplimientos')
      await cargar()
    }
    setTrabajando(false)
  }

  async function marcarTodasRevisadas() {
    if (!confirm(`¿Marcar las ${vencidas.length} alertas vencidas como revisadas?\nDejarán de aparecer en Incumplimientos (quedan en "Resueltas").`)) return
    setTrabajando(true)
    const ids = vencidas.map((v: any) => v.id)
    if (ids.length > 0) {
      const { error } = await supabase.from('tareas_instancia').update({ estado: 'revisada' }).in('id', ids)
      if (error) {
        showToast('err', 'Error en marcado masivo: ' + error.message)
      } else {
        await logAccion('alertas_revisadas_bulk', 'tareas_instancia', undefined, { count: ids.length })
        showToast('ok', `${ids.length} alertas marcadas como revisadas`)
        await cargar()
      }
    }
    setTrabajando(false)
  }

  async function borrarRecordatorio(id: string) {
    if (!confirm('¿Eliminar este registro del log de notificaciones?\nNo afecta a la auditoría (queda en audit_log).')) return
    setTrabajando(true)
    const { error } = await supabase.from('notificaciones_log').delete().eq('id', id)
    if (error) {
      showToast('err', 'No se pudo eliminar: ' + error.message)
    } else {
      await logAccion('notificacion_log_borrada', 'notificaciones_log', id, {})
      showToast('ok', 'Registro eliminado')
      await cargar()
    }
    setTrabajando(false)
  }

  async function limpiarLogsAntiguos(dias: number) {
    if (!confirm(`¿Borrar logs de notificaciones de más de ${dias} días?\nNo afecta a estadísticas (la auditoría queda en audit_log).`)) return
    setTrabajando(true)
    const limite = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString()
    const { error, count } = await supabase
      .from('notificaciones_log')
      .delete({ count: 'exact' })
      .lt('enviado_at', limite)
    if (error) {
      showToast('err', 'Error al limpiar: ' + error.message)
    } else {
      await logAccion('logs_notificaciones_purga', 'notificaciones_log', undefined, { dias, borrados: count ?? 0 })
      showToast('ok', `Borrados ${count ?? 0} registros de >${dias}d`)
      await cargar()
    }
    setTrabajando(false)
  }

  const totales = useMemo(() => ({
    incumplimientos: vencidas.length,
    recordatorios: recordatorios.length,
    resueltas: revisadas.length,
  }), [vencidas, recordatorios, revisadas])

  return (
    <>
      <PageHeader
        title="Centro de alertas"
        subtitle="Tareas vencidas, recordatorios enviados y alertas ya resueltas"
        actions={
          <>
            {tab === 'incumplimientos' && vencidas.length > 0 && (
              <button
                className="btn-secondary"
                onClick={marcarTodasRevisadas}
                disabled={trabajando}
                title="Marcar todas las alertas vencidas listadas como revisadas"
              >
                <CheckCheck className="w-4 h-4" /> Marcar todas revisadas
              </button>
            )}
            {tab === 'recordatorios' && (
              <>
                <button
                  className="btn-ghost"
                  onClick={() => limpiarLogsAntiguos(30)}
                  disabled={trabajando}
                  title="Borrar logs de notificaciones con más de 30 días"
                >
                  <Eraser className="w-4 h-4" /> Limpiar &gt;30d
                </button>
                <button
                  className="btn-ghost text-danger"
                  onClick={() => limpiarLogsAntiguos(90)}
                  disabled={trabajando}
                  title="Purgar logs de notificaciones con más de 90 días"
                >
                  <Trash2 className="w-4 h-4" /> Purga &gt;90d
                </button>
              </>
            )}
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-bg-border">
        {([
          ['incumplimientos', 'Incumplimientos', totales.incumplimientos, AlertTriangle, 'text-danger'],
          ['recordatorios', 'Recordatorios enviados', totales.recordatorios, BellRing, 'text-warning'],
          ['resueltas', 'Resueltas', totales.resueltas, CheckCircle2, 'text-success'],
        ] as [Tab, string, number, any, string][]).map(([k, l, n, Icon, color]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-2',
              tab === k ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-100',
            )}
          >
            <Icon className={clsx('w-4 h-4', tab === k ? 'text-accent' : color)} />
            {l}
            <span className="ml-1 text-xs font-mono opacity-70">({n})</span>
          </button>
        ))}
      </div>

      {loading && <div className="text-slate-500 text-sm">Cargando…</div>}

      {/* Listado */}
      <div className="surface divide-y divide-bg-border">
        {tab === 'incumplimientos' && vencidas.map((i: any) => (
          <div key={i.id} className="p-4 flex items-center gap-4">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium">{i.tareas_plantilla?.titulo}</span>
                <span className="iata text-sm">{i.bases?.codigo_iata}</span>
                <span className="pill-vencida">Vencida</span>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                Límite: {fmtRelativa(i.fecha_limite)}
                {i.usuarios && <> · Asignada a {i.usuarios.nombre}</>}
              </div>
            </div>
            <button
              className="btn-secondary"
              onClick={() => marcarRevisada(i.id)}
              disabled={trabajando}
              title="Marcar como revisada y mover a Resueltas"
            >
              <CheckCheck className="w-4 h-4" /> Marcar revisada
            </button>
          </div>
        ))}

        {tab === 'recordatorios' && recordatorios.map((n: any) => (
          <div key={n.id} className="p-4 flex items-center gap-4">
            <BellRing className="w-5 h-5 text-warning flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {n.tareas_instancia?.tareas_plantilla?.titulo ?? 'Notificación'}
                {n.tareas_instancia?.bases?.codigo_iata && (
                  <span className="iata ml-2 text-sm">{n.tareas_instancia.bases.codigo_iata}</span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                {n.tipo} · {n.canal} · {fmtRelativa(n.enviado_at)}
              </div>
            </div>
            <span className={clsx('pill', n.status === 'enviado' ? 'pill-done' : 'pill-pend')}>
              {n.status}
            </span>
            <button
              className="btn-ghost text-danger p-2"
              onClick={() => borrarRecordatorio(n.id)}
              disabled={trabajando}
              title="Eliminar este registro del log"
              aria-label="Eliminar registro"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {tab === 'resueltas' && revisadas.map((i: any) => (
          <div key={i.id} className="p-4 flex items-center gap-4">
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium">{i.tareas_plantilla?.titulo}</span>
                <span className="iata text-sm">{i.bases?.codigo_iata}</span>
                <span className="pill-done">Revisada</span>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                Vencía: {fmtRelativa(i.fecha_limite)}
                {i.usuarios && <> · {i.usuarios.nombre}</>}
              </div>
            </div>
            <button
              className="btn-ghost"
              onClick={() => reabrirAlerta(i.id)}
              disabled={trabajando}
              title="Devolver a Incumplimientos"
            >
              <X className="w-4 h-4" /> Reabrir
            </button>
          </div>
        ))}

        {!loading && (
          (tab === 'incumplimientos' && vencidas.length === 0) ||
          (tab === 'recordatorios' && recordatorios.length === 0) ||
          (tab === 'resueltas' && revisadas.length === 0)
        ) && (
          <div className="p-8 text-center text-sm text-slate-500">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
            {tab === 'incumplimientos' && 'No hay incumplimientos. ¡Buen trabajo!'}
            {tab === 'recordatorios' && 'Sin recordatorios registrados.'}
            {tab === 'resueltas' && 'Aún no se ha resuelto ninguna alerta.'}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={clsx(
            'fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg border text-sm z-50 max-w-sm',
            toast.kind === 'ok'
              ? 'bg-success/15 border-success/30 text-success'
              : 'bg-danger/15 border-danger/30 text-danger',
          )}
        >
          {toast.text}
        </div>
      )}
    </>
  )
}
