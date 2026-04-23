import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { EstadoBadge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { fmtDateTime, fmtTime, diaSemanaTxt } from '@/lib/format'
import {
  FileUp, Paperclip, CheckCircle2, ExternalLink, FileText,
  BookOpen, AlertCircle, Calendar, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import type { TareaInstancia } from '@/lib/database.types'

interface InstanciaExtendida extends TareaInstancia {
  tareas_plantilla?: any
}

export default function StorekeeperHome() {
  const { usuario, base } = useAuth()
  const [instancias, setInstancias] = useState<InstanciaExtendida[]>([])
  const [loading, setLoading] = useState(true)
  const [procedimientos, setProcedimientos] = useState<any[]>([])

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

    setInstancias(data as any ?? [])

    const { data: bt } = await supabase
      .from('biblioteca_tecnica')
      .select('id, titulo, referencia, categoria')
      .eq('activo', true)
      .limit(8)
    setProcedimientos(bt ?? [])
    setLoading(false)
  }

  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const fin = new Date(hoy); fin.setHours(23,59,59,999)

  const diarias = instancias.filter(i =>
    i.tareas_plantilla?.frecuencia === 'diaria' &&
    new Date(i.fecha_limite) >= hoy && new Date(i.fecha_limite) <= fin,
  )
  const semanales = instancias.filter(i => i.tareas_plantilla?.frecuencia === 'semanal')
  const mensuales = instancias.filter(i =>
    ['mensual', 'trimestral', 'semestral', 'anual'].includes(i.tareas_plantilla?.frecuencia ?? ''),
  )

  const completadasHoy = diarias.filter(i => i.estado === 'completada').length

  return (
    <div className="space-y-8">
      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Progreso del día</div>
            <div className="font-display text-2xl font-extrabold mt-1">
              Hoy: {completadasHoy} de {diarias.length} tareas completadas
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-5xl font-extrabold">
              {diarias.length > 0 ? Math.round((completadasHoy / diarias.length) * 100) : 100}%
            </div>
          </div>
        </div>
        <ProgressBar pct={diarias.length > 0 ? (completadasHoy / diarias.length) * 100 : 100} />
      </div>

      {loading && <div className="text-slate-500 text-sm">Cargando tus tareas…</div>}

      <Seccion
        titulo="Tareas de hoy"
        subtitulo="Tareas diarias asignadas a tu base"
        icon={Clock}
      >
        {diarias.length === 0 && <Vacio texto="No hay tareas diarias para hoy." />}
        {diarias.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} />
        ))}
      </Seccion>

      <Seccion
        titulo="Tareas de esta semana"
        subtitulo="Tareas semanales"
        icon={Calendar}
      >
        {semanales.length === 0 && <Vacio texto="Sin tareas semanales pendientes." />}
        {semanales.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} contexto="semana" />
        ))}
      </Seccion>

      <Seccion
        titulo="Tareas de este mes"
        subtitulo="Tareas mensuales y periódicas"
        icon={Calendar}
      >
        {mensuales.length === 0 && <Vacio texto="Sin tareas mensuales pendientes." />}
        {mensuales.map(i => (
          <TareaCard key={i.id} inst={i} onUpdated={cargar} contexto="mes" />
        ))}
      </Seccion>

      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Acceso rápido</div>
            <div className="font-display text-xl font-bold mt-1">Procedimientos más usados</div>
          </div>
          <Link to={`/base/${base?.codigo_iata}/biblioteca`} className="btn-ghost">
            <BookOpen className="w-4 h-4" /> Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {procedimientos.map(p => (
            <div key={p.id} className="surface-elevated p-3 hover:border-accent/40 cursor-pointer">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-accent" />
                <span className="font-mono text-[11px] text-slate-400">{p.referencia}</span>
              </div>
              <div className="text-sm font-medium line-clamp-2">{p.titulo}</div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono uppercase">{p.categoria}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Seccion({
  titulo, subtitulo, icon: Icon, children,
}: { titulo: string; subtitulo: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-accent" />
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

function TareaCard({
  inst, onUpdated, contexto,
}: { inst: InstanciaExtendida; onUpdated: () => void; contexto?: 'semana' | 'mes' }) {
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
  const isVencida = inst.estado === 'vencida'

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
      isVencida && 'border-danger/30 bg-danger/5',
    )}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {isCompletada ? (
              <div className="w-8 h-8 rounded-full bg-success/20 grid place-items-center">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
            ) : isVencida ? (
              <div className="w-8 h-8 rounded-full bg-danger/20 grid place-items-center">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg-elevated border border-bg-border" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-semibold">{plantilla?.titulo ?? 'Tarea'}</h3>
              <EstadoBadge estado={inst.estado} />
            </div>
            {plantilla?.descripcion && (
              <p className="text-sm text-slate-400 mb-2">{plantilla.descripcion}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Límite: {fmtDateTime(inst.fecha_limite)}
              </span>
              {contexto === 'semana' && (
                <span>Día: {diaSemanaTxt(new Date(inst.fecha_asignada).getDay() || 7)}</span>
              )}
              {isCompletada && inst.fecha_completada && (
                <span className="text-success">✓ {fmtDateTime(inst.fecha_completada)}</span>
              )}
            </div>
            {plantilla?.biblioteca_tecnica && (
              <Link
                to={`/base/${base?.codigo_iata}/biblioteca#${plantilla.biblioteca_tecnica.id}`}
                className="text-accent text-xs inline-flex items-center gap-1 mt-2 hover:underline font-mono"
              >
                <BookOpen className="w-3 h-3" />
                Ver procedimiento: {plantilla.biblioteca_tecnica.referencia}
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            {plantilla?.formatos?.pdf_path && (
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
              <button onClick={descargar} className="btn-secondary">
                <FileText className="w-4 h-4" />
                {inst.pdf_nombre?.substring(0, 28) ?? 'Evidencia'}
              </button>
            )}
            {!isCompletada && (
              <button
                onClick={() => setExpandido(!expandido)}
                className={clsx('btn-primary', isVencida && 'bg-danger hover:bg-danger/80')}
              >
                <Paperclip className="w-4 h-4" />
                ADJUNTAR PDF Y COMPLETAR
              </button>
            )}
          </div>
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
