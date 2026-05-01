import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, logAccion } from '@/lib/supabase'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import {
  Building2, CheckCircle2, AlertTriangle, UserX, ArrowRight,
  FileUp, Send, ClipboardCheck, Trash2, RefreshCw, Loader2,
} from 'lucide-react'
import { fmtRelativa, colorCumplimiento } from '@/lib/format'
import type { Base } from '@/lib/database.types'
import clsx from 'clsx'

/**
 * Devuelve YYYY-MM-DD en hora LOCAL (no UTC).
 * d.toISOString().slice(0,10) usa UTC, lo que en zonas con offset positivo
 * (Madrid UTC+1/+2) hace que a las 00:00 locales devuelva el día anterior,
 * provocando que tareas de ayer aparezcan como "hoy" en el dashboard.
 */
function fechaLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + dd
}

interface BaseStats {
  base: Base
  total_semana: number
  completadas_semana: number
  pendientes_hoy: number
  vencidas_semana: number
  vencidas_total: number
  /** null = la base no tiene tareas activas esta semana (no es ni 100% ni 0%) */
  cumplimiento: number | null
}

export default function Dashboard() {
  const [bases, setBases] = useState<BaseStats[]>([])
  const [kpi, setKpi] = useState<{
    bases: number
    cumplimientoHoy: number | null
    vencidasSemana: number
    vencidasTotal: number
    inactivos: number
    diariasHoy: number
    completadasHoy: number
  }>({
    bases: 0,
    cumplimientoHoy: null,
    vencidasSemana: 0,
    vencidasTotal: 0,
    inactivos: 0,
    diariasHoy: 0,
    completadasHoy: 0,
  })
  const [actividad, setActividad] = useState<any[]>([])
  const [freqMes, setFreqMes] = useState<any[]>([])
  const [peoresBases, setPeoresBases] = useState<BaseStats[]>([])
  const [loading, setLoading] = useState(true)
  const [limpiando, setLimpiando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const hoy = new Date()
    // Lunes = inicio de semana (convención ES). getDay() devuelve 0=Dom,1=Lun…6=Sáb,
    // por lo que en domingo hay que retroceder 6 días, no avanzar 1 (bug original).
    const dia = hoy.getDay()
    const offsetLunes = dia === 0 ? 6 : dia - 1
    const inicioSemana = new Date(hoy)
    inicioSemana.setDate(hoy.getDate() - offsetLunes)
    inicioSemana.setHours(0, 0, 0, 0)
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

    const hoyISO = fechaLocalISO(hoy)
    const inicioSemanaISO = fechaLocalISO(inicioSemana)

    const [basesQ, instanciasSemana, instanciasHoy, vencidasTotalQ, usuariosQ, audits] = await Promise.all([
      supabase.from('bases').select('*').eq('activo', true).order('codigo_iata'),
      supabase.from('tareas_instancia')
        .select('*, tareas_plantilla(frecuencia)')
        .gte('fecha_asignada', inicioSemanaISO),
      // FIX: ahora la query incluye base_id y la frecuencia, necesarios para
      // el "pendientes_hoy" por base y el % de cumplimiento de tareas diarias.
      supabase.from('tareas_instancia')
        .select('id, base_id, estado, plantilla_id, tareas_plantilla(frecuencia)')
        .eq('fecha_asignada', hoyISO),
      // Vencidas histórico (todas las bases, sin restricción temporal)
      supabase.from('tareas_instancia')
        .select('id, base_id')
        .eq('estado', 'vencida'),
      supabase.from('usuarios').select('id, rol, ultimo_login').eq('rol', 'storekeeper'),
      supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(8),
    ])

    const basesList = basesQ.data ?? []
    const instSemana = (instanciasSemana.data ?? []) as any[]
    const instHoy = (instanciasHoy.data ?? []) as any[]
    const vencidasAll = (vencidasTotalQ.data ?? []) as any[]

    // Por base — las desasignadas NO cuentan ni en numerador ni en denominador
    const stats: BaseStats[] = basesList.map(b => {
      const delBaseAll = instSemana.filter(i => i.base_id === b.id)
      const delBase = delBaseAll.filter(i => i.estado !== 'desasignada')
      const completadas = delBase.filter(i => i.estado === 'completada').length
      const total = delBase.length
      const vencidasSemana = delBase.filter(i => i.estado === 'vencida').length
      const vencidasTotal = vencidasAll.filter(i => i.base_id === b.id).length
      // FIX: ahora sí, instHoy incluye base_id. Antes siempre devolvía 0.
      const pendHoy = instHoy.filter(i => i.base_id === b.id && i.estado === 'pendiente').length
      return {
        base: b,
        total_semana: total,
        completadas_semana: completadas,
        pendientes_hoy: pendHoy,
        vencidas_semana: vencidasSemana,
        vencidas_total: vencidasTotal,
        cumplimiento: total > 0 ? Math.round((completadas / total) * 100) : null,
      }
    })
    setBases(stats)
    setPeoresBases(
      stats
        .filter(s => s.cumplimiento !== null)
        .sort((a, b) => (a.cumplimiento ?? 0) - (b.cumplimiento ?? 0))
        .slice(0, 5),
    )

    // KPIs — "Cumplimiento hoy" centrado en TAREAS DIARIAS (más representativo
    // y consistente con la sección "Hoy" del storekeeper)
    const diariasHoyEf = instHoy.filter(i =>
      i.estado !== 'desasignada' && i.tareas_plantilla?.frecuencia === 'diaria',
    )
    const completadasHoy = diariasHoyEf.filter(i => i.estado === 'completada').length
    const cumplimientoHoy: number | null =
      diariasHoyEf.length > 0
        ? Math.round((completadasHoy / diariasHoyEf.length) * 100)
        : null
    const vencidasSemana = instSemana.filter(i => i.estado === 'vencida').length
    const usuarios = usuariosQ.data ?? []
    const hace24h = new Date(Date.now() - 24*3600*1000)
    const inactivos = usuarios.filter(u => !u.ultimo_login || new Date(u.ultimo_login) < hace24h).length

    setKpi({
      bases: basesList.length,
      cumplimientoHoy,
      vencidasSemana,
      vencidasTotal: vencidasAll.length,
      inactivos,
      diariasHoy: diariasHoyEf.length,
      completadasHoy,
    })

    // Por frecuencia (mes) — excluir desasignadas
    const inicioMesISO = fechaLocalISO(inicioMes)
    const instMes = instSemana.filter(i =>
      (i.fecha_asignada as string) >= inicioMesISO && i.estado !== 'desasignada',
    )
    const freq: Record<string, { total: number; done: number }> = {}
    for (const i of instMes) {
      const f = (i as any).tareas_plantilla?.frecuencia ?? 'otra'
      freq[f] = freq[f] ?? { total: 0, done: 0 }
      freq[f].total++
      if (i.estado === 'completada') freq[f].done++
    }
    setFreqMes(
      Object.entries(freq).map(([name, v]) => ({
        name,
        pct: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
      })),
    )

    setActividad(audits.data ?? [])
    setLoading(false)
  }

  async function limpiarVencidas() {
    const total = kpi.vencidasTotal
    if (total === 0) { alert('No hay tareas vencidas que limpiar.'); return }
    const ok = confirm(
      'Vas a ELIMINAR ' + total + ' tareas vencidas en TODAS las bases.\n\n' +
      'Esto deja la aplicación lista para la fase de testeo (sin histórico de incumplimientos).\n\n' +
      'Las tareas COMPLETADAS y la auditoría no se tocan (audit_log es inmutable).\n\n' +
      '¿Continuar?',
    )
    if (!ok) return
    setLimpiando(true)
    try {
      const { error, count } = await supabase
        .from('tareas_instancia')
        .delete({ count: 'exact' })
        .eq('estado', 'vencida')
      if (error) throw error
      await logAccion('vencidas_purgadas', 'tareas_instancia', undefined, {
        eliminadas: count ?? total,
        motivo: 'Limpieza global pre-demo',
      })
      alert('✓ ' + (count ?? total) + ' tareas vencidas eliminadas.')
      await cargar()
    } catch (e: any) {
      alert('Error al limpiar vencidas: ' + (e.message ?? e))
    } finally {
      setLimpiando(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Panel de control"
        subtitle="Estado operativo de todas las bases · Cumplimiento en tiempo real"
        actions={
          <>
            <button
              className="btn-ghost"
              onClick={cargar}
              disabled={loading}
              title="Actualizar datos"
            >
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> Actualizar
            </button>
            <button
              className={clsx(
                'btn-secondary',
                kpi.vencidasTotal > 0 && 'text-danger border-danger/40 hover:bg-danger/10',
              )}
              onClick={limpiarVencidas}
              disabled={limpiando || kpi.vencidasTotal === 0}
              title="Eliminar todas las tareas vencidas (no afecta a las completadas ni a la auditoría)"
            >
              {limpiando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Limpiando…</>
                : <><Trash2 className="w-4 h-4" /> Limpiar {kpi.vencidasTotal} vencidas</>}
            </button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Building2}
          label="Bases activas"
          value={String(kpi.bases)}
          color="text-slate-300"
          sub="estaciones operativas"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cumplimiento hoy"
          value={kpi.cumplimientoHoy === null ? '—' : kpi.cumplimientoHoy + '%'}
          color={
            kpi.cumplimientoHoy === null
              ? 'text-slate-400'
              : colorCumplimiento(kpi.cumplimientoHoy).text
          }
          sub={
            kpi.cumplimientoHoy === null
              ? 'sin tareas diarias hoy'
              : kpi.completadasHoy + ' / ' + kpi.diariasHoy + ' tareas diarias'
          }
        />
        <KpiCard
          icon={AlertTriangle}
          label="Tareas vencidas"
          value={String(kpi.vencidasTotal)}
          color={kpi.vencidasTotal > 0 ? 'text-danger' : 'text-slate-300'}
          sub={kpi.vencidasSemana + ' esta semana · ' + kpi.vencidasTotal + ' totales'}
        />
        <KpiCard
          icon={UserX}
          label="Sin actividad"
          value={String(kpi.inactivos)}
          color={kpi.inactivos > 0 ? 'text-warning' : 'text-slate-300'}
          sub="storekeepers > 24h"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Grid de bases (2/3) */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold">Bases</h2>
            <div className="text-xs text-slate-500 font-mono">
              {bases.length} estaciones · cumplimiento semana actual
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {loading && <div className="col-span-4 text-slate-500 text-sm">Cargando…</div>}
            {!loading && bases.length === 0 && (
              <div className="col-span-4 surface p-6 text-center text-sm text-slate-500">
                No hay bases activas. Ve a Configuración para activarlas.
              </div>
            )}
            {bases.map(s => <BaseTile key={s.base.id} s={s} />)}
          </div>
        </div>

        {/* Panel lateral derecho */}
        <div className="space-y-6">
          <div className="surface p-5">
            <div className="label mb-3">Cumplimiento por frecuencia · mes actual</div>
            {freqMes.length === 0 ? (
              <div className="h-44 grid place-items-center text-xs text-slate-500">
                Sin tareas este mes
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={freqMes}>
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#111520', border: '1px solid #1f2533', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(v: any) => [v + '%', 'cumplimiento']}
                    />
                    <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                      {freqMes.map((entry, idx) => (
                        <Cell key={idx} fill={
                          entry.pct >= 85 ? '#10b981' : entry.pct >= 60 ? '#f59e0b' : '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="surface p-5">
            <div className="label mb-3">Bases con menor cumplimiento</div>
            <div className="space-y-2">
              {peoresBases.map(s => (
                <Link
                  key={s.base.id}
                  to={'/admin/base/' + s.base.codigo_iata}
                  className="flex items-center justify-between row-hover -mx-2 px-2 py-1.5 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="iata text-lg">{s.base.codigo_iata}</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {s.base.nombre_completo.split(' ')[0]}
                    </span>
                  </div>
                  <span className={clsx('pill', colorCumplimiento(s.cumplimiento ?? 0).badge)}>
                    {s.cumplimiento ?? 0}%
                  </span>
                </Link>
              ))}
              {peoresBases.length === 0 && (
                <div className="text-xs text-slate-500">
                  Todas las bases sin tareas o al 100%.
                </div>
              )}
            </div>
          </div>

          <div className="surface p-5">
            <div className="label mb-3">Actividad reciente</div>
            <div className="space-y-2">
              {actividad.map(a => (
                <ActividadItem key={a.id} a={a} />
              ))}
              {actividad.length === 0 && <div className="text-xs text-slate-500">Sin actividad reciente</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function KpiCard({ icon: Icon, label, value, color, sub }: any) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="label">{label}</div>
          <div className={clsx('font-display text-3xl font-extrabold mt-1', color)}>{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1 truncate">{sub}</div>}
        </div>
        <Icon className="w-5 h-5 text-slate-600 flex-shrink-0" />
      </div>
    </div>
  )
}

function BaseTile({ s }: { s: BaseStats }) {
  const sinTareas = s.cumplimiento === null
  const c = sinTareas
    ? { text: 'text-slate-500', bg: 'bg-slate-600', badge: 'pill-muted' }
    : colorCumplimiento(s.cumplimiento as number)
  return (
    <Link
      to={'/admin/base/' + s.base.codigo_iata}
      className="surface p-4 hover:border-accent/50 transition-colors block"
      title={s.base.nombre_completo + ' · ' + s.completadas_semana + '/' + s.total_semana + ' esta semana'}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="iata text-2xl">{s.base.codigo_iata}</span>
        <span className={clsx('w-2 h-2 rounded-full', c.bg)} />
      </div>
      <div className="text-[11px] text-slate-500 font-mono truncate mb-3">
        {s.base.nombre_completo}
      </div>
      {sinTareas ? (
        <div className="h-1.5 rounded-full bg-slate-800/60" />
      ) : (
        <ProgressBar pct={s.cumplimiento as number} />
      )}
      <div className="flex items-center justify-between mt-3 text-[11px] font-mono">
        <span className={c.text} title={sinTareas ? 'Sin tareas asignadas esta semana' : 'Cumplimiento semanal'}>
          {sinTareas ? 'sin tareas' : s.cumplimiento + '%'}
        </span>
        <div className="flex gap-2 text-slate-500">
          <span title="Completadas esta semana" className="text-success">✓{s.completadas_semana}</span>
          <span title="Pendientes hoy">⏳{s.pendientes_hoy}</span>
          <span
            className={s.vencidas_total > 0 ? 'text-danger' : ''}
            title="Vencidas (histórico total)"
          >✗{s.vencidas_total}</span>
        </div>
      </div>
    </Link>
  )
}

function ActividadItem({ a }: { a: any }) {
  const Icon = a.accion === 'tarea_completada' ? ClipboardCheck
             : a.accion === 'pdf_subido' ? FileUp
             : a.accion === 'notificacion_enviada' ? Send
             : a.accion === 'vencidas_purgadas' ? Trash2
             : ArrowRight
  const labelMap: Record<string, string> = {
    tarea_completada: 'Tarea completada',
    pdf_subido: 'PDF subido',
    notificacion_enviada: 'Recordatorio enviado',
    vencidas_purgadas: 'Vencidas eliminadas',
    login: 'Inicio de sesión',
    logout: 'Cierre de sesión',
    tarea_desasignada: 'Tarea desasignada',
    tarea_reasignada: 'Tarea reasignada',
    plantilla_creada: 'Plantilla creada',
    plantilla_modificada: 'Plantilla modificada',
    plantilla_eliminada: 'Plantilla eliminada',
    plantilla_toggle: 'Plantilla activada/desactivada',
    formato_creado: 'Formato creado',
    formato_modificado: 'Formato modificado',
    formato_eliminado: 'Formato eliminado',
    formato_descargado: 'Formato descargado',
    asignacion_creada: 'Asignación creada',
    asignacion_modificada: 'Asignación modificada',
    asignacion_eliminada: 'Asignación eliminada',
    usuario_modificado: 'Usuario modificado',
    config_actualizada: 'Configuración actualizada',
    alerta_revisada: 'Alerta revisada',
    alertas_revisadas_bulk: 'Alertas revisadas (lote)',
    alerta_reabierta: 'Alerta reabierta',
    notificacion_log_borrada: 'Log notificación borrado',
    logs_notificaciones_purga: 'Logs notificaciones purgados',
  }
  const label = labelMap[a.accion] ?? a.accion
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-slate-200">{label}</div>
        <div className="text-[10px] text-slate-500 font-mono">{fmtRelativa(a.timestamp)}</div>
      </div>
    </div>
  )
}
