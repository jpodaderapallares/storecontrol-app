import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Plus, Edit, Trash2, CheckSquare } from 'lucide-react'
import type { TareaPlantilla, Base, BibliotecaDoc, Frecuencia } from '@/lib/database.types'
import clsx from 'clsx'

export default function Tareas() {
  const [plantillas, setPlantillas] = useState<TareaPlantilla[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [biblioteca, setBiblioteca] = useState<BibliotecaDoc[]>([])
  const [editando, setEditando] = useState<TareaPlantilla | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtroFreq, setFiltroFreq] = useState<string>('')
  const [filtroEstado, setFiltroEstado] = useState<string>('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [p, b, bt] = await Promise.all([
      supabase.from('tareas_plantilla').select('*').order('frecuencia').order('titulo'),
      supabase.from('bases').select('*').order('codigo_iata'),
      supabase.from('biblioteca_tecnica').select('*').eq('activo', true).order('referencia'),
    ])
    setPlantillas(p.data ?? [])
    setBases(b.data ?? [])
    setBiblioteca(bt.data ?? [])
  }

  async function toggleActivo(p: TareaPlantilla) {
    await supabase.from('tareas_plantilla').update({ activo: !p.activo }).eq('id', p.id)
    await logAccion('plantilla_toggle', 'tareas_plantilla', p.id, { activo: !p.activo })
    cargar()
  }

  async function eliminar(p: TareaPlantilla) {
    if (!confirm(`¿Eliminar la plantilla "${p.titulo}"?\nSe mantendrán las instancias completadas por trazabilidad.`)) return
    await supabase.from('tareas_plantilla').delete().eq('id', p.id)
    await logAccion('plantilla_eliminada', 'tareas_plantilla', p.id, { titulo: p.titulo })
    cargar()
  }

  const filtrados = plantillas.filter(p =>
    (!filtroFreq || p.frecuencia === filtroFreq) &&
    (!filtroEstado || String(p.activo) === filtroEstado),
  )

  return (
    <>
      <PageHeader
        title="Gestión de tareas"
        subtitle="Plantillas que generan automáticamente las instancias para cada base"
        actions={
          <button className="btn-primary" onClick={() => { setEditando(null); setMostrarForm(true) }}>
            <Plus className="w-4 h-4" /> Nueva tarea
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        <select className="input" value={filtroFreq} onChange={e => setFiltroFreq(e.target.value)}>
          <option value="">Todas las frecuencias</option>
          <option value="diaria">Diaria</option>
          <option value="semanal">Semanal</option>
          <option value="mensual">Mensual</option>
          <option value="trimestral">Trimestral</option>
          <option value="semestral">Semestral</option>
          <option value="anual">Anual</option>
        </select>
        <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
      </div>

      <div className="surface divide-y divide-bg-border">
        {filtrados.map(p => (
          <div key={p.id} className="p-4 flex items-center gap-4 row-hover">
            <button
              onClick={() => toggleActivo(p)}
              className={clsx(
                'w-10 h-6 rounded-full transition-colors relative',
                p.activo ? 'bg-accent' : 'bg-bg-border',
              )}
            >
              <span className={clsx(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                p.activo ? 'translate-x-4' : 'translate-x-0.5',
              )} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{p.titulo}</span>
                <span className="pill bg-bg-elevated border border-bg-border text-slate-400 capitalize">
                  {p.frecuencia}
                </span>
                {p.hora_limite && (
                  <span className="font-mono text-xs text-slate-500">lím. {p.hora_limite.slice(0, 5)}</span>
                )}
                <span className="text-xs text-slate-500 font-mono">
                  {p.bases_asignadas.length} bases
                </span>
                {p.evidencia_requerida === 'pdf' && (
                  <span className="pill bg-accent/10 border border-accent/30 text-accent">PDF requerido</span>
                )}
              </div>
              {p.descripcion && <div className="text-xs text-slate-500 mt-1">{p.descripcion}</div>}
            </div>
            <div className="flex gap-1">
              <button className="btn-ghost" onClick={() => { setEditando(p); setMostrarForm(true) }}>
                <Edit className="w-4 h-4" />
              </button>
              <button className="btn-ghost text-danger" onClick={() => eliminar(p)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">
            Sin plantillas · Pulsa "Nueva tarea" para crear la primera.
          </div>
        )}
      </div>

      {mostrarForm && (
        <FormPlantilla
          plantilla={editando}
          bases={bases}
          biblioteca={biblioteca}
          onClose={() => { setMostrarForm(false); setEditando(null); cargar() }}
        />
      )}
    </>
  )
}

function FormPlantilla({
  plantilla, bases, biblioteca, onClose,
}: {
  plantilla: TareaPlantilla | null
  bases: Base[]
  biblioteca: BibliotecaDoc[]
  onClose: () => void
}) {
  const [titulo, setTitulo] = useState(plantilla?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? '')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(plantilla?.frecuencia ?? 'diaria')
  const [horaLimite, setHoraLimite] = useState(plantilla?.hora_limite?.slice(0, 5) ?? '18:00')
  const [diaSemana, setDiaSemana] = useState(plantilla?.dia_semana ?? 1)
  const [diaMes, setDiaMes] = useState(plantilla?.dia_mes ?? 1)
  const [evidencia, setEvidencia] = useState(plantilla?.evidencia_requerida ?? 'pdf')
  const [procBt, setProcBt] = useState(plantilla?.procedimiento_bt_id ?? '')
  const [basesAsig, setBasesAsig] = useState<string[]>(plantilla?.bases_asignadas ?? [])
  const [activo, setActivo] = useState(plantilla?.activo ?? true)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const payload = {
      titulo, descripcion, frecuencia, hora_limite: horaLimite + ':00',
      dia_semana: frecuencia === 'semanal' ? diaSemana : null,
      dia_mes: ['mensual', 'trimestral', 'semestral', 'anual'].includes(frecuencia) ? diaMes : null,
      bases_asignadas: basesAsig,
      evidencia_requerida: evidencia,
      procedimiento_bt_id: procBt || null,
      activo,
      updated_at: new Date().toISOString(),
    }
    if (plantilla) {
      await supabase.from('tareas_plantilla').update(payload).eq('id', plantilla.id)
      await supabase.rpc('generar_instancias_30d', { p_plantilla: plantilla.id })
      await logAccion('plantilla_modificada', 'tareas_plantilla', plantilla.id, { titulo })
    } else {
      const { data } = await supabase.from('tareas_plantilla').insert(payload).select().single()
      if (data) {
        await supabase.rpc('generar_instancias_30d', { p_plantilla: data.id })
        await logAccion('plantilla_creada', 'tareas_plantilla', data.id, { titulo })
      }
    }
    setGuardando(false)
    onClose()
  }

  function toggleBase(id: string) {
    setBasesAsig(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="surface p-6 max-w-2xl w-full max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {plantilla ? 'Editar tarea' : 'Nueva tarea'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="label">Título</label>
            <input className="input w-full mt-1" value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>

          <div>
            <label className="label">Descripción / instrucciones</label>
            <textarea className="input w-full mt-1 min-h-[72px]" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Frecuencia</label>
              <select className="input w-full mt-1" value={frecuencia} onChange={e => setFrecuencia(e.target.value as Frecuencia)}>
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label className="label">Hora límite</label>
              <input type="time" className="input w-full mt-1" value={horaLimite} onChange={e => setHoraLimite(e.target.value)} />
            </div>
            {frecuencia === 'semanal' && (
              <div>
                <label className="label">Día de la semana</label>
                <select className="input w-full mt-1" value={diaSemana} onChange={e => setDiaSemana(Number(e.target.value))}>
                  <option value={1}>Lunes</option><option value={2}>Martes</option>
                  <option value={3}>Miércoles</option><option value={4}>Jueves</option>
                  <option value={5}>Viernes</option><option value={6}>Sábado</option>
                  <option value={7}>Domingo</option>
                </select>
              </div>
            )}
            {['mensual', 'trimestral', 'semestral', 'anual'].includes(frecuencia) && (
              <div>
                <label className="label">Día del mes</label>
                <input type="number" min={1} max={28} className="input w-full mt-1" value={diaMes} onChange={e => setDiaMes(Number(e.target.value))} />
              </div>
            )}
          </div>

          <div>
            <label className="label">Evidencia requerida</label>
            <select className="input w-full mt-1" value={evidencia} onChange={e => setEvidencia(e.target.value as any)}>
              <option value="pdf">PDF</option>
              <option value="foto">Foto</option>
              <option value="cualquiera">Cualquiera</option>
              <option value="no_requerida">No requerida</option>
            </select>
          </div>

          <div>
            <label className="label">Procedimiento BT asociado</label>
            <select className="input w-full mt-1" value={procBt} onChange={e => setProcBt(e.target.value)}>
              <option value="">— Sin procedimiento asociado —</option>
              {biblioteca.map(d => (
                <option key={d.id} value={d.id}>{d.referencia} — {d.titulo}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Bases asignadas ({basesAsig.length}/{bases.length})</label>
            <div className="flex gap-2 mt-1">
              <button className="btn-ghost text-xs" onClick={() => setBasesAsig(bases.map(b => b.id))}>
                <CheckSquare className="w-3 h-3" /> Todas
              </button>
              <button className="btn-ghost text-xs" onClick={() => setBasesAsig([])}>Ninguna</button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2 p-3 surface-elevated">
              {bases.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={basesAsig.includes(b.id)} onChange={() => toggleBase(b.id)} />
                  <span className="iata">{b.codigo_iata}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            <span className="text-sm">Activa — generar instancias próximos 30 días</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-bg-border">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando || !titulo || basesAsig.length === 0}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
