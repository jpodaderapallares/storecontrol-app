import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { EstadoBadge } from '@/components/ui/Badge'
import { fmtDateTime, fmtTime } from '@/lib/format'
import { Download, FileText, ChevronRight, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import type { Base, TareaInstancia, Usuario } from '@/lib/database.types'

type Tab = 'hoy' | 'semana' | 'mes' | 'historico'

export default function BaseDetail() {
  const { codigo } = useParams<{ codigo: string }>()
  const [base, setBase] = useState<Base | null>(null)
  const [storekeeper, setStorekeeper] = useState<Usuario | null>(null)
  const [tab, setTab] = useState<Tab>('hoy')
  const [items, setItems] = useState<TareaInstancia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargarBase() }, [codigo])
  useEffect(() => { if (base) cargarItems() }, [base, tab])

  async function cargarBase() {
    if (!codigo) return
    const { data: b } = await supabase.from('bases').select('*').eq('codigo_iata', codigo).maybeSingle()
    setBase(b as Base | null)
    if (b) {
      const { data: u } = await supabase.from('usuarios')
        .select('*').eq('base_id', b.id).eq('rol', 'storekeeper').eq('activo', true).maybeSingle()
      setStorekeeper(u as Usuario | null)
    }
  }

  async function cargarItems() {
    if (!base) return
    setLoading(true)
    const hoy = new Date()
    let gte: Date, lte: Date
    if (tab === 'hoy') {
      gte = new Date(hoy); gte.setHours(0,0,0,0)
      lte = new Date(hoy); lte.setHours(23,59,59,999)
    } else if (tab === 'semana') {
      gte = new Date(hoy); gte.setDate(hoy.getDate() - hoy.getDay() + 1); gte.setHours(0,0,0,0)
      lte = new Date(gte); lte.setDate(gte.getDate() + 6); lte.setHours(23,59,59,999)
    } else if (tab === 'mes') {
      gte = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      lte = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59)
    } else {
      gte = new Date(hoy); gte.setMonth(hoy.getMonth() - 6)
      lte = new Date(hoy); lte.setDate(hoy.getDate() - 1)
    }

    const { data } = await supabase
      .from('tareas_instancia')
      .select('*, tareas_plantilla(titulo, descripcion, frecuencia, hora_limite, procedimiento_bt_id, biblioteca_tecnica:procedimiento_bt_id(titulo, referencia))')
      .eq('base_id', base.id)
      .gte('fecha_asignada', gte.toISOString().slice(0, 10))
      .lte('fecha_asignada', lte.toISOString().slice(0, 10))
      .order('fecha_limite', { ascending: tab !== 'historico' })

    setItems(data as any ?? [])
    setLoading(false)
  }

  async function descargarPdf(path: string, nombre: string) {
    const { data } = await supabase.storage.from('evidencias-tareas').createSignedUrl(path, 120)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl; a.download = nombre ?? 'evidencia.pdf'; a.click()
    }
  }

  async function exportarInforme() {
    // Stub: en prod llamar a una Edge Function que genere un PDF con pdf-lib o Puppeteer.
    alert('Informe PDF generado (stub). En producción se descarga del backend.')
  }

  const completadas = items.filter(i => i.estado === 'completada').length
  const vencidas = items.filter(i => i.estado === 'vencida').length
  const pendientes = items.filter(i => i.estado === 'pendiente').length

  return (
    <>
      <PageHeader
        title={base?.nombre_completo ?? codigo ?? '—'}
        breadcrumb={`Dashboard > Bases > ${codigo}`}
        actions={
          <>
            <Link to="/dashboard" className="btn-ghost"><ChevronLeft className="w-4 h-4" /> Volver</Link>
            <button onClick={exportarInforme} className="btn-primary">
              <Download className="w-4 h-4" /> Exportar informe PDF
            </button>
          </>
        }
      />

      <div className="surface p-5 mb-6">
        <div className="flex items-center gap-6">
          <div className="iata text-4xl">{base?.codigo_iata}</div>
          <div className="flex-1">
            <div className="text-sm text-slate-400">Storekeeper asignado</div>
            <div className="font-medium">{storekeeper?.nombre ?? <span className="text-slate-500">Sin asignar</span>}</div>
            {storekeeper && <div className="text-xs text-slate-500 font-mono">{storekeeper.email}</div>}
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="font-display text-2xl font-bold text-success">{completadas}</div>
              <div className="text-[11px] text-slate-500 font-mono uppercase">Completadas</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-slate-300">{pendientes}</div>
              <div className="text-[11px] text-slate-500 font-mono uppercase">Pendientes</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-danger">{vencidas}</div>
              <div className="text-[11px] text-slate-500 font-mono uppercase">Vencidas</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-bg-border">
        {([
          ['hoy', 'Tareas de hoy'],
          ['semana', 'Esta semana'],
          ['mes', 'Este mes'],
          ['historico', 'Histórico'],
        ] as [Tab, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === k
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-400 hover:text-slate-100',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="surface divide-y divide-bg-border">
        {loading && <div className="p-6 text-slate-500 text-sm">Cargando…</div>}
        {!loading && items.length === 0 && (
          <div className="p-6 text-slate-500 text-sm">Sin tareas en este periodo.</div>
        )}
        {items.map((i: any) => (
          <div key={i.id} className="p-4 row-hover">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold">{i.tareas_plantilla?.titulo ?? 'Tarea'}</h3>
                  <EstadoBadge estado={i.estado} />
                  {i.tareas_plantilla?.frecuencia && (
                    <span className="pill bg-bg-elevated border border-bg-border text-slate-400">
                      {i.tareas_plantilla.frecuencia}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Fecha límite: {fmtDateTime(i.fecha_limite)}
                  {i.estado === 'completada' && i.fecha_completada && (
                    <span className="ml-3 text-success">Completada {fmtDateTime(i.fecha_completada)}</span>
                  )}
                </div>
                {i.tareas_plantilla?.biblioteca_tecnica && (
                  <div className="text-xs mt-1">
                    <span className="text-slate-500">Procedimiento:</span>{' '}
                    <span className="font-mono text-accent">
                      {i.tareas_plantilla.biblioteca_tecnica.referencia}
                    </span>
                  </div>
                )}
              </div>
              <div>
                {i.pdf_path && (
                  <button
                    className="btn-secondary"
                    onClick={() => descargarPdf(i.pdf_path, i.pdf_nombre)}
                  >
                    <FileText className="w-4 h-4" /> {i.pdf_nombre?.substring(0, 24) ?? 'Evidencia.pdf'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
