import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import {
  Building2, CheckCircle2, AlertTriangle, UserX, ArrowRight,
  FileUp, Send, ClipboardCheck,
} from 'lucide-react'
import { fmtRelativa, colorCumplimiento } from '@/lib/format'
import type { Base } from '@/lib/database.types'
import clsx from 'clsx'

interface BaseStats {
  base: Base
  total_semana: number
  completadas_semana: number
  pendientes_hoy: number
  vencidas: number
  cumplimiento: number
}

export default function Dashboard() {
  const [bases, setBases] = useState<BaseStats[]>([])
  const [kpi, setKpi] = useState({ bases: 0, cumplimientoHoy: 0, vencidas: 0, inactivos: 0 })
  const [actividad, setActividad] = useState<any[]>([])
  const [freqMes, setFreqMes] = useState<any[]>([])
  const [peoresBases, setPeoresBases] = useState<BaseStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const hoy = new Date()
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1)
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const finHoy = new Date(hoy); finHoy.setHours(23,59,59,999)
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0,0,0,0)

    const [basesQ, instanciasSemana, instanciasHoy, usuariosQ, audits] = await Promise.all([
      supabase.from('bases').select('*').eq('activo', true).order('codigo_iata'),
      supabase.from('tareas_instancia')
        .select('*, tareas_plantilla(frecuencia)')
        .gte('fecha_asignada', inicioSemana.toISOString().slice(0,10)),
      supabase.from('tareas_instancia')
        .select('id, estado')
        .gte('fecha_asignada', inicioHoy.toISOString().slice(0,10))
        .lte('fecha_asignada', finHoy.toISOString().slice(0,10)),
      supabase.from('usuarios').select('id, rol, ultimo_login').eq('rol', 'storekeeper'),
      supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(8),
    ])

    const basesList = basesQ.data ?? []
    const instSemana = instanciasSemana.data ?? []
    const instHoy = instanciasHoy.data ?? []

    // Por base
    const stats: BaseStats[] = basesList.map(b => {
      const delBase = instSemana.filter(i => i.base_id === b.id)
      const completadas = delBase.filter(i => i.estado === 'completada').length
      const total = delBase.length
      const vencidas = delBase.filter(i => i.estado === 'vencida').length
      const pendHoy = instHoy.filter(i => (i as any).base_id === b.id && i.estado === 'pendiente').length
      return {
        base: b,
        total_semana: total,
        completadas_semana: completadas,
        pendientes_hoy: pendHoy,
        vencidas,
        cumplimiento: total > 0 ? Math.round((completadas / total) * 100) : 100,
      }
    })
    setBases(stats)
    setPeoresBases([...stats].sort((a,b) => a.cumplimiento - b.cumplimiento).slice(0, 5))

    // KPIs
    const completadasHoy = instHoy.filter(i => i.estado === 'completada').length
    const cumplimientoHoy = instHoy.length > 0 ? Math.round((completadasHoy / instHoy.length) * 100) : 100
    const vencidasTot = instSemana.filter(i => i.estado === 'vencida').length
    const usuarios = usuariosQ.data ?? []
    const hace24h = new Date(Date.now() - 24*3600*1000)
    const inactivos = usuarios.filter(u => !u.ultimo_login || new Date(u.ultimo_login) < hace24h).length

    setKpi({ bases: basesList.length, cumplimientoHoy, vencidas: vencidasTot, inactivos })

    // Por frecuencia (mes)
    const instMes = instSemana.filter(i => new Date(i.fecha_asignada) >= inicioMes)
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

  return (
    <>
      <PageHeader
        title="Panel de control"
        subtitle="Estado operativo de todas las bases · Cumplimiento en tiempo real"
      />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Building2}
          label="Bases activas"
          value={String(kpi.bases)}
          color="text-slate-300"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cumplimiento hoy"
          value={`${kpi.cumplimientoHoy}%`}
          color={colorCumplimiento(kpi.cumplimientoHoy).text}
          sub="tareas diarias completadas"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Tareas vencidas"
          value={String(kpi.vencidas)}
          color={kpi.vencidas > 0 ? 'text-danger' : 'text-slate-300'}
          sub="esta semana"
        />
        <KpiCard
          icon={UserX}
          label="Sin actividad"
          value={String(kpi.inactivos)}
          color={kpi.inactivos > 0 ? 'text-warning' : 'text-slate-300'}
          sub="storekeepers &gt; 24h"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Grid de bases (2/3) */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold">Bases</h2>
            <div className="text-xs text-slate-500 font-mono">16 estaciones · cumplimiento semana actual</div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {loading && <div className="col-span-4 text-slate-500 text-sm">Cargando…</div>}
            {bases.map(s => <BaseTile key={s.base.id} s={s} />)}
          </div>
        </div>

        {/* Panel lateral derecho */}
        <div className="space-y-6">
          <div className="surface p-5">
            <div className="label mb-3">Cumplimiento por frecuencia · mes actual</div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={freqMes}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: '#111520', border: '1px solid #1f2533', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
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
          </div>

          <div className="surface p-5">
            <div className="label mb-3">Peores bases del mes</div>
            <div className="space-y-2">
              {peoresBases.map(s => (
                <div key={s.base.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="iata text-lg">{s.base.codigo_iata}</span>
                    <span className="text-xs text-slate-500 font-mono">{s.base.nombre_completo.split(' ')[0]}</span>
                  </div>
                  <span className={clsx('pill', colorCumplimiento(s.cumplimiento).badge)}>
                    {s.cumplimiento}%
                  </span>
                </div>
              ))}
              {peoresBases.length === 0 && <div className="text-xs text-slate-500">Sin datos</div>}
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
        <div>
          <div className="label">{label}</div>
          <div className={clsx('font-display text-3xl font-extrabold mt-1', color)}>{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: sub }} />}
        </div>
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
    </div>
  )
}

function BaseTile({ s }: { s: BaseStats }) {
  const c = colorCumplimiento(s.cumplimiento)
  return (
    <Link
      to={`/admin/base/${s.base.codigo_iata}`}
      className="surface p-4 hover:border-accent/50 transition-colors block"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="iata text-2xl">{s.base.codigo_iata}</span>
        <span className={clsx('w-2 h-2 rounded-full', c.bg)} />
      </div>
      <div className="text-[11px] text-slate-500 font-mono truncate mb-3">
        {s.base.nombre_completo}
      </div>
      <ProgressBar pct={s.cumplimiento} />
      <div className="flex items-center justify-between mt-3 text-[11px] font-mono">
        <span className={c.text}>{s.cumplimiento}%</span>
        <div className="flex gap-2 text-slate-500">
          <span>✓{s.completadas_semana}</span>
          <span>⏳{s.pendientes_hoy}</span>
          <span className={s.vencidas > 0 ? 'text-danger' : ''}>✗{s.vencidas}</span>
        </div>
      </div>
    </Link>
  )
}

function ActividadItem({ a }: { a: any }) {
  const Icon = a.accion === 'tarea_completada' ? ClipboardCheck
             : a.accion === 'pdf_subido' ? FileUp
             : a.accion === 'notificacion_enviada' ? Send
             : ArrowRight
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-500 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{a.accion}</div>
        <div className="text-[10px] text-slate-500 font-mono">{fmtRelativa(a.timestamp)}</div>
      </div>
    </div>
  )
}
