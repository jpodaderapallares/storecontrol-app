import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { EstadoBadge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { fmtDateTime, diaSemanaTxt } from '@/lib/format'
import {
  FileUp, Paperclip, CheckCircle2, ExternalLink, FileText,
  BookOpen, AlertCircle, Calendar, Clock, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'
import type { TareaInstancia } from '@/lib/database.types'

interface InstanciaExtendida extends TareaInstancia {
  tareas_plantilla?: any
}

// Orden de prioridad por estado: vencidas primero (más urgentes), luego
// pendientes, luego completadas (al fondo de cada sección).
function ordenEstado(i: InstanciaExtendida): number {
  if (i.estado === 'vencida') return 0
  if (i.estado === 'pendiente') return 1
  if (i.estado === 'completada') return 2
  return 3
}

function ordenarPorEstadoYFecha(arr: InstanciaExtendida[]): InstanciaExtendida[] {
  return [...arr].sort((a, b) => {
    const e = ordenEstado(a) - ordenEstado(b)
    if (e !== 0) return e
    return new Date(a.fecha_limite).getTime() - new Date(b.fecha_limite).getTime()
  })
}

export default function StorekeeperHome() {
  const { base } = useAuth()
  const [instancias, setInstancias] = useState<InstanciaExtendida[]>([])
  const [loading, setLoading] = useState(true)
  const [procedimientos, setProcedimientos] = useState<any[]>([])
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false)

  useEffect(() => { cargar() }, [base?.id])

  async function cargar() {
    if (!base) return
    setLoading(true)
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('tareas_instancia')
      .select(`*, tareas_plantilla(
        titulo, descripcion, frecuencia, hora_limite, evidencia_requerida, formato_id,
        biblioteca_tecnica:procedimiento_bt_id(id, titulo, referencia),
        formatos:formato_id(id, titulo, codigo, pdf_path, pdf_nombre)
      )`)
      .eq('base_id', base.id)
      .gte('fecha_asignada', inicioMes)
      .lte('fecha_asignada', finMes)
      .order('fecha_limite')

    const filas = ((data as any) ?? []).filter((i: any) => i.estado !== 'desasignada') as InstanciaExtendida[]
    setInstancias(filas)

    const { data: bt } = await supabase
      .from('biblioteca_tecnica')
      .select('id, titulo, referencia, categoria')
      .eq('activo', true)
      .limit(8)
    setProcedimientos(bt ?? [])
    setLoading(false)
  }

  // Particionado por contexto temporal y estado
  const { vencidas, hoyPendientes, hoyCompletadas, semanaPend, mesPend, completadasMes, totalHoy, completadasHoy } = useMemo(() => {
    const ahora = new Date()
    const hoyIni = new Date(ahora); hoyIni.setHours(0, 0, 0, 0)
    const hoyFin = new Date(ahora); hoyFin.setHours(23, 59, 59, 999)

    const esHoy = (i: InstanciaExtendida) => {
      const fl = new Date(i.fecha_limite)
      return fl >= hoyIni && fl <= hoyFin
    }

    const diarias = instancias.filter(i => i.tareas_plantilla?.frecuencia === 'diaria')
    const semanales = instancias.filter(i => i.tareas_plantilla?.frecuencia === 'semanal')
    const mensuales = instancias.filter(i =>
      ['mensual', 'trimestral', 'semestral', 'anual'].includes(i.tareas_plantilla?.frecuencia ?? ''),
    )

    // Vencidas: sin completar y con fecha_limite ya pasada (cualquier frecuencia)
    const vencidas = instancias
      .filter(i =>
        i.estado !== 'completada' &&
        new Date(i.fecha_limite) < hoyIni,
      )
      .sort((a, b) => new Date(a.fecha_limite).getTime() - new Date(b.fecha_limite).getTime())

    // Diarias de HOY: separadas en pendientes y completadas
    const diariasHoy = diarias.filter(esHoy)
    const hoyPendientes = diariasHoy.filter(i => i.estado !== 'completada')
    const hoyCompletadas = diariasHoy.filter(i => i.estado === 'completada')

    // Semanales del mes (no vencidas, sin distinguir hoy) — solo pendientes en sección
    const semNoVencidas = semanales.filter(i => new Date(i.fecha_limite) >= hoyIni)
    const semanaPend = ordenarPorEstadoYFecha(semNoVencidas.filter(i => i.estado !== 'completada'))

    // Mensuales+ del mes (no vencidas, sin distinguir hoy) — solo pendientes en sección
    const mensNoVenc = mensuales.filter(i => new Date(i.fecha_limite) >= hoyIni)
    const mesPend = ordenarPorEstadoYFecha(mensNoVenc.filter(i => i.estado !== 'completada'))

    // Completadas del mes — TODAS (diarias previas, semanales, mensuales),
    // excluyendo las completadas hoy que ya se muestran arriba
    const idsHoyDone = new Set(hoyCompletadas.map(i => i.id))
    const completadasMes = instancias
      .filter(i => i.estado === 'completada' && !idsHoyDone.has(i.id))
      .sort((a, b) =>
        new Date(b.fecha_completada ?? b.fecha_limite).getTime() -
        new Date(a.fecha_completada ?? a.fecha_limite).getTime(),
      )

    const totalHoy = diariasHoy.length
    const completadasHoy = hoyCompletadas.length
    return { vencidas, hoyPendientes, hoyCompletadas, semanaPend, mesPend, completadasMes, totalHoy, completadasHoy }
  }, [instancias])

  const pctHoy = totalHoy > 0 ? Math.round((completadasHoy / totalHoy) * 100) : null

  return (
    <div className="space-y-8">
      {/* Hero progreso del día */}
      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Progreso del día</div>
            <div className="font-display text-2xl font-extrabold mt-1">
              {totalHoy === 0
                ? 'No hay tareas diarias para hoy'
                : `Hoy: ${completadasHoy} de ${totalHoy} tareas completadas`}
            </div>
          </div>
          <div className="text-right">
            <div className={clsx(
              'font-display text-5xl font-extrabold',
              pctHoy === null ? 'text-slate-500'
                : pctHoy >= 85 ? 'text-success'
                : pctHoy >= 60 ? 'text-warning'
                : 'text-danger',
            )}>
              {pctHoy === null ? '—' : `${pctHoy}%`}
            </div>
          </div>
        </div>
        {totalHoy > 0 ? (
          <ProgressBar pct={(completadasHoy / totalHoy) * 100} />
        ) : (
          <div className="h-2 rounded-full bg-bg-elevated" />
        )}
      </div>

      {loading && <div className="text-slate-500 text-sm">Cargando tus tareas…</div>}

      {/* SECCIÓN URGENTE: Vencidas (sólo si hay) */}
      {vencidas.length > 0 && (
        <Seccion
          titulo={`Vencidas · acción inmediata (${vencidas.length})`}
          subtitulo="Tareas que han superado su fecha límite. Resuelve cuanto antes."
          icon={AlertTriangle}
          tono="danger"
        >
          {vencidas.map(i => (
            <TareaCard key={i.id} inst={i} onUpdated={cargar} contexto={contextoDe(i)} />
          ))}
        </Seccion>
      )}

      {/* SECCIÓN HOY: pendientes primero, luego completadas (visualmente atenuadas) */}
      <Seccion
        titulo={totalHoy > 0
          ? `Tareas de hoy · ${hoyPendientes.length} pendiente${hoyPendientes.length === 1 ? '' : 's'}`
          : 'Tareas de hoy'}
        subtitulo="Tareas diarias asignadas a tu base"
        icon={Clock}
        tono={hoyPendientes.length > 0 ? 'accent' : 'muted'}
      >
        {totalHoy === 0 && <Vacio texto="No hay tareas diarias para hoy." />}
        {hoyPendientes.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} />
        ))}
        {hoyCompletadas.length > 0 && (
          <BloqueCompletadas titulo={`Completadas hoy · ${hoyCompletadas.length}`}>
            {hoyCompletadas.map(i => (
              <TareaCard key={i.id} inst={i} onUpdated={cargar} compacta />
            ))}
          </BloqueCompletadas>
        )}
      </Seccion>

      {/* SECCIÓN SEMANA: solo pendientes (las completadas se agrupan abajo) */}
      <Seccion
        titulo={`Esta semana · ${semanaPend.length} pendiente${semanaPend.length === 1 ? '' : 's'}`}
        subtitulo="Tareas semanales"
        icon={Calendar}
        tono="muted"
      >
        {semanaPend.length === 0 && <Vacio texto="Sin tareas semanales pendientes." />}
        {semanaPend.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} contexto="semana" />
        ))}
      </Seccion>

      {/* SECCIÓN MES */}
      <Seccion
        titulo={`Este mes · ${mesPend.length} pendiente${mesPend.length === 1 ? '' : 's'}`}
        subtitulo="Tareas mensuales y periódicas"
        icon={Calendar}
        tono="muted"
      >
        {mesPend.length === 0 && <Vacio texto="Sin tareas mensuales pendientes." />}
        {mesPend.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} contexto="mes" />
        ))}
      </Seccion>

      {/* HISTÓRICO: completadas del mes (plegable, atenuado) */}
      {completadasMes.length > 0 && (
        <div>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-bg-elevated border border-bg-border text-slate-300 hover:text-slate-100 hover:border-bg-border/80 transition-colors"
            onClick={() => setMostrarCompletadas(v => !v)}
            title={mostrarCompletadas ? 'Ocultar completadas' : 'Mostrar completadas'}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm font-medium">
                Completadas este mes
              </span>
              <span className="pill bg-success/15 text-success border border-success/30">
                {completadasMes.length}
              </span>
            </div>
            {mostrarCompletadas
              ? <ChevronUp className="w-4 h-4 text-slate-400" />
              : <ChevronDown className="w-4 h-4 text-slate-400" />
            }
          </button>
          {mostrarCompletadas && (
            <div className="space-y-3 mt-3">
              {completadasMes.map(i => (
                <TareaCard key={i.id} inst={i} onUpdated={cargar} compacta contexto={contextoDe(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Acceso rápido a procedimientos */}
      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Acceso rápido</div>
            <div className="font-display text-xl font-bold mt-1">Procedimientos más usados</div>
          </div>
          <Link to={`/base/${base?.codigo_iata}/biblioteca`} className="btn-ghost" title="Abrir biblioteca técnica">
            <BookOpen className="w-4 h-4" /> Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {procedimientos.map(p => (
            <Link
              key={p.id}
              to={`/base/${base?.codigo_iata}/biblioteca#${p.id}`}
              className="surface-elevated p-3 hover:border-accent/40 cursor-pointer block"
              title={`${p.referencia} — ${p.titulo}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-accent" />
                <span className="font-mono text-[11px] text-slate-400">{p.referencia}</span>
              </div>
              <div className="text-sm font-medium line-clamp-2">{p.titulo}</div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono uppercase">{p.categoria}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// Devuelve el contexto temporal a partir de la frecuencia (para mostrar día de la semana, etc.)
function contextoDe(i: InstanciaExtendida): 'semana' | 'mes' | undefined {
  const f = i.tareas_plantilla?.frecuencia
  if (f === 'semanal') return 'semana'
  if (['mensual', 'trimestral', 'semestral', 'anual'].includes(f ?? '')) return 'mes'
  return undefined
}

// ============================================================
//  Sección con cabecera tonalizada
// ============================================================
type Tono = 'danger' | 'accent' | 'muted'

function Seccion({
  titulo, subtitulo, icon: Icon, children, tono = 'muted',
}: {
  titulo: string; subtitulo: string; icon: any; children: React.ReactNode; tono?: Tono
}) {
  const colorIcon = tono === 'danger' ? 'text-danger' : tono === 'accent' ? 'text-accent' : 'text-slate-400'
  const barra = tono === 'danger' ? 'bg-danger' : tono === 'accent' ? 'bg-accent' : 'bg-slate-600'
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className={clsx('w-1 h-6 rounded-full', barra)} />
        <Icon className={clsx('w-5 h-5', colorIcon)} />
        <div>
          <h2 className="font-display text-xl font-bold">{titulo}</h2>
          <div className="text-xs text-slate-500">{subtitulo}</div>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="surface p-6 text-center text-sm text-slate-500">{texto}</div>
  )
}

// ============================================================
//  Bloque de completadas dentro de la sección "Hoy" (atenuado)
// ============================================================
function BloqueCompletadas({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-success/5 border border-success/20 text-success text-xs font-medium hover:bg-success/10 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {titulo}
        </span>
        {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {abierto && <div className="space-y-3 mt-3">{children}</div>}
    </div>
  )
}

// ============================================================
//  Tarjeta de tarea
// ============================================================
function TareaCard({
  inst, onUpdated, contexto, compacta,
}: {
  inst: InstanciaExtendida
  onUpdated: () => void
  contexto?: 'semana' | 'mes'
  compacta?: boolean
}) {
  const [expandido, setExpandido] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [notas, setNotas] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const { usuario, base } = useAuth()

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 25 * 1024 * 1024,
  })

  const plantilla = inst.tareas_plantilla
  const isCompletada = inst.estado === 'completada'
  const isVencida = inst.estado === 'vencida' ||
    (!isCompletada && new Date(inst.fecha_limite) < new Date())

  async function confirmar() {
    if (!file || !base || !usuario) return
    setSubiendo(true)
    try {
      const path = `${base.id}/${inst.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('evidencias-tareas').upload(path, file, {
        upsert: false, contentType: 'application/pdf',
      })
      if (upErr) throw upErr

      const { error: updErr } = await supabase.from('tareas_instancia').update({
        estado: 'completada',
        fecha_completada: new Date().toISOString(),
        pdf_path: path,
        pdf_nombre: file.name,
        notas: notas || null,
        usuario_id: usuario.id,
      }).eq('id', inst.id)
      if (updErr) throw updErr

      await logAccion('tarea_completada', 'tareas_instancia', inst.id, {
        plantilla: plantilla?.titulo, pdf_nombre: file.name, pdf_size: file.size,
      })
      await logAccion('pdf_subido', 'evidencias-tareas', inst.id, {
        path, nombre: file.name, size: file.size,
      })

      setExpandido(false); setFile(null); setNotas('')
      onUpdated()
    } catch (e: any) {
      alert('Error subiendo PDF: ' + (e.message ?? e))
    } finally {
      setSubiendo(false)
    }
  }

  async function descargar() {
    if (!inst.pdf_path) return
    const { data } = await supabase.storage.from('evidencias-tareas').createSignedUrl(inst.pdf_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function descargarFormatoBlanco() {
    const path = plantilla?.formatos?.pdf_path
    if (!path) return
    const { data } = await supabase.storage.from('formatos').createSignedUrl(path, 300)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
      await logAccion('formato_descargado', 'formatos', plantilla.formatos.id, {
        codigo: plantilla.formatos.codigo,
        instancia_id: inst.id,
      })
    }
  }

  return (
    <div className={clsx(
      'surface overflow-hidden transition-all',
      isCompletada && 'border-success/30 bg-success/5',
      isVencida && !isCompletada && 'border-danger/40 bg-danger/5 ring-1 ring-danger/30',
      compacta && 'opacity-80',
    )}>
      <div className={clsx('flex items-start gap-4', compacta ? 'p-3' : 'p-5')}>
        <div className="mt-1">
          {isCompletada ? (
            <div className="w-8 h-8 rounded-full bg-success/20 grid place-items-center" title="Completada">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
          ) : isVencida ? (
            <div className="w-8 h-8 rounded-full bg-danger/20 grid place-items-center" title="Vencida">
              <AlertCircle className="w-5 h-5 text-danger" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-bg-elevated border border-bg-border" title="Pendiente" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className={clsx('font-semibold', compacta && 'text-sm')}>
              {plantilla?.titulo ?? 'Tarea'}
            </h3>
            <EstadoBadge estado={isVencida && !isCompletada ? 'vencida' : inst.estado} />
          </div>
          {!compacta && plantilla?.descripcion && (
            <p className="text-sm text-slate-400 mb-2">{plantilla.descripcion}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-500 font-mono flex-wrap">
            <span className="inline-flex items-center gap-1" title="Fecha y hora límite">
              <Clock className="w-3 h-3" />
              Límite: {fmtDateTime(inst.fecha_limite)}
            </span>
            {contexto === 'semana' && (
              <span>Día: {diaSemanaTxt(new Date(inst.fecha_asignada).getDay() || 7)}</span>
            )}
            {isCompletada && inst.fecha_completada && (
              <span className="text-success" title="Fecha de completado">
                ✓ {fmtDateTime(inst.fecha_completada)}
              </span>
            )}
          </div>
          {!compacta && plantilla?.biblioteca_tecnica && (
            <Link
              to={`/base/${base?.codigo_iata}/biblioteca#${plantilla.biblioteca_tecnica.id}`}
              className="text-accent text-xs inline-flex items-center gap-1 mt-2 hover:underline font-mono"
              title="Abrir procedimiento técnico"
            >
              <BookOpen className="w-3 h-3" />
              Ver procedimiento: {plantilla.biblioteca_tecnica.referencia}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          {!compacta && plantilla?.formatos?.pdf_path && (
            <button
              onClick={descargarFormatoBlanco}
              className="text-accent text-xs inline-flex items-center gap-1 mt-2 ml-4 hover:underline font-mono"
              title="Descargar plantilla en blanco del formato"
            >
              <FileText className="w-3 h-3" />
              Descargar formato en blanco ({plantilla.formatos.codigo})
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          {isCompletada && inst.pdf_path && (
            <button onClick={descargar} className="btn-secondary" title="Ver evidencia (PDF subido)">
              <FileText className="w-4 h-4" />
              {inst.pdf_nombre?.substring(0, 28) ?? 'Evidencia'}
            </button>
          )}
          {!isCompletada && (
            <button
              onClick={() => setExpandido(!expandido)}
              className={clsx('btn-primary', isVencida && 'bg-danger hover:bg-danger/80')}
              title={isVencida ? 'Tarea vencida — completar urgentemente' : 'Adjuntar PDF y completar'}
            >
              <Paperclip className="w-4 h-4" />
              {compacta ? 'Completar' : 'ADJUNTAR PDF Y COMPLETAR'}
            </button>
          )}
        </div>
      </div>

      {expandido && !isCompletada && (
        <div className="border-t border-bg-border bg-bg-elevated/40 p-5 space-y-3">
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragActive ? 'border-accent bg-accent/5' : 'border-bg-border hover:border-accent/50',
            )}
          >
            <input {...getInputProps()} />
            <FileUp className="w-8 h-8 mx-auto text-slate-500 mb-2" />
            {file ? (
              <div className="text-sm">
                <div className="font-medium text-slate-100">{file.name}</div>
                <div className="text-xs text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : isDragActive ? (
              <div className="text-sm text-accent">Suelta el PDF aquí…</div>
            ) : (
              <div>
                <div className="text-sm">Arrastra un PDF aquí o haz clic para seleccionar</div>
                <div className="text-xs text-slate-500 mt-1">Máx. 25 MB · solo .pdf</div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="input w-full mt-1 min-h-[80px]"
              placeholder="Incidencias, observaciones, etc."
            />
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setExpandido(false); setFile(null) }}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={confirmar} disabled={!file || subiendo}>
              <CheckCircle2 className="w-4 h-4" />
              {subiendo ? 'Subiendo…' : 'Confirmar y completar tarea'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
