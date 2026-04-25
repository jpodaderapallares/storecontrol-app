import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { AlertTriangle, BellRing, CheckCheck, Eye, Trash2, Eraser } from 'lucide-react'
import { fmtRelativa } from '@/lib/format'
import clsx from 'clsx'

type Tab = 'todas' | 'incumplimientos' | 'recordatorios' | 'resueltas'

export default function Alertas() {
  const [tab, setTab] = useState<Tab>('todas')
  const [vencidas, setVencidas] = useState<any[]>([])
  const [recordatorios, setRecordatorios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [limpiando, setLimpiando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [v, r] = await Promise.all([
      supabase.from('tareas_instancia')
        .select('*, tareas_plantilla(titulo), bases(codigo_iata, nombre_completo), usuarios(nombre, email)')
        .in('estado', ['vencida'])
        .order('fecha_limite', { ascending: false })
        .limit(100),
      supabase.from('notificaciones_log')
        .select('*, tareas_instancia(*, bases(codigo_iata), tareas_plantilla(titulo))')
        .order('enviado_at', { ascending: false }).limit(50),
    ])
    setVencidas(v.data ?? [])
    setRecordatorios(r.data ?? [])
    setLoading(false)
  }

  async function marcarRevisada(id: string) {
    await supabase.from('tareas_instancia').update({ estado: 'revisada' }).eq('id', id)
    await logAccion('alerta_revisada', 'tareas_instancia', id, {})
    cargar()
  }

  async function marcarTodasRevisadas() {
    if (!confirm(`Marcar las ${vencidas.length} alertas vencidas como revisadas?\nDejarán de aparecer en el listado.`)) return
    setLimpiando(true)
    const ids = vencidas.map((v: any) => v.id)
    if (ids.length > 0) {
      await supabase.from('tareas_instancia').update({ estado: 'revisada' }).in('id', ids)
      await logAccion('alertas_revisadas_bulk', 'tareas_instancia', undefined, { count: ids.length })
    }
    setLimpiando(false)
    cargar()
  }

  async function limpiarLogsAntiguos(dias: number) {
    if (!confirm(`Borrar logs de notificaciones de más de ${dias} días?\nLas estadísticas históricas no se verán afectadas (auditoría queda en audit_log).`)) return
    setLimpiando(true)
    const limite = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString()
    const { error, count } = await supabase
      .from('notificaciones_log')
      .delete({ count: 'exact' })
      .lt('enviado_at', limite)
    if (error) {
      alert('Error al limpiar: ' + error.message)
    } else {
      await logAccion('logs_notificaciones_purga', 'notificaciones_log', undefined, { dias, borrados: count ?? 0 })
    }
    setLimpiando(false)
    cargar()
  }

  const items = tab === 'recordatorios' ? recordatorios : vencidas

  return (
    <>
      <PageHeader
        title="Centro de alertas"
        subtitle="Incumplimientos y recordatorios enviados"
        actions={
          <>
            {vencidas.length > 0 && (
              <button
                className="btn-secondary"
                onClick={marcarTodasRevisadas}
                disabled={limpiando}
                title="Marcar todas las vencidas listadas como revisadas"
              >
                <CheckCheck className="w-4 h-4" /> Marcar todas revisadas
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => limpiarLogsAntiguos(30)}
              disabled={limpiando}
              title="Borrar log de notificaciones >30 días"
            >
              <Eraser className="w-4 h-4" /> Limpiar logs &gt;30d
            </button>
            <button
              className="btn-ghost text-danger"
              onClick={() => limpiarLogsAntiguos(90)}
              disabled={limpiando}
              title="Borrar log de notificaciones >90 días"
            >
              <Trash2 className="w-4 h-4" /> Purga &gt;90d
            </button>
          </>
        }
      />
      <div className="flex gap-1 mb-4 border-b border-bg-border">
        {([
          ['todas', `Todas (${vencidas.length})`],
          ['incumplimientos', 'Incumplimientos'],
          ['recordatorios', 'Recordatorios enviados'],
          ['resueltas', 'Resueltas'],
        ] as [Tab, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === k ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-100',
            )}
          >{l}</button>
        ))}
      </div>

      {loading && <div className="text-slate-500 text-sm">Cargando…</div>}

      <div className="surface divide-y divide-bg-border">
        {tab === 'recordatorios'
          ? recordatorios.map((n: any) => (
              <div key={n.id} className="p-4 flex items-center gap-4">
                <BellRing className="w-5 h-5 text-warning" />
                <div className="flex-1">
                  <div className="font-medium">
                    {n.tareas_instancia?.tareas_plantilla?.titulo ?? 'Notificación'}
                    <span className="iata ml-2 text-sm">{n.tareas_instancia?.bases?.codigo_iata}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {n.tipo} · {n.canal} · {fmtRelativa(n.enviado_at)}
                  </div>
                </div>
                <span className="pill-pend">{n.status}</span>
              </div>
            ))
          : items.map((i: any) => (
              <div key={i.id} className="p-4 flex items-center gap-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{i.tareas_plantilla?.titulo}</span>
                    <span className="iata text-sm">{i.bases?.codigo_iata}</span>
                    <span className="pill-vencida">Vencida</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    Límite: {fmtRelativa(i.fecha_limite)}
                    {i.usuarios && <> · {i.usuarios.nombre}</>}
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => marcarRevisada(i.id)}>
                  <CheckCheck className="w-4 h-4" /> Marcar revisada
                </button>
              </div>
            ))}
        {!loading && items.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">Sin alertas.</div>
        )}
      </div>
    </>
  )
}
