import { useEffect, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Plus, FileText, Trash2, Settings2, CheckCircle, Upload } from 'lucide-react'
import { fmtRelativa } from '@/lib/format'
import type { Formato, AsignacionFormato, Usuario, Base, FrecuenciaTarea } from '@/lib/database.types'

const FREQ_LABELS: Record<FrecuenciaTarea, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

const FREQ_HELP: Record<FrecuenciaTarea, string> = {
  diaria: 'Todos los días. Sólo se usa la hora límite.',
  semanal: 'Un día concreto de la semana.',
  mensual: 'Un día concreto del mes.',
  trimestral: 'Un día concreto en enero, abril, julio y octubre.',
  semestral: 'Un día concreto en enero y julio.',
  anual: 'Un día concreto en un mes concreto del año.',
}

export default function Formatos() {
  const [tab, setTab] = useState<'formatos' | 'asignaciones'>('formatos')
  const [formatos, setFormatos] = useState<Formato[]>([])
  const [asignaciones, setAsignaciones] = useState<(AsignacionFormato & { formato?: Formato; usuario?: Usuario; base?: Base })[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [cargando, setCargando] = useState(true)
  const [formModal, setFormModal] = useState(false)
  const [formData, setFormData] = useState<Partial<Formato> | null>(null)
  const [asignModal, setAsignModal] = useState(false)
  const [asignData, setAsignData] = useState<Partial<AsignacionFormato> | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [fmt, asig, usr, bse] = await Promise.all([
      supabase.from('formatos').select('*').order('titulo'),
      supabase.from('asignaciones_formatos').select('*, formatos(titulo), usuarios(nombre, email), bases(codigo_iata)').order('created_at'),
      supabase.from('usuarios').select('*').eq('rol', 'storekeeper').order('nombre'),
      supabase.from('bases').select('*').order('codigo_iata'),
    ])
    setFormatos(fmt.data ?? [])
    setAsignaciones(asig.data as any ?? [])
    setUsuarios(usr.data ?? [])
    setBases(bse.data ?? [])
    setCargando(false)
  }

  async function guardarFormato(file?: File) {
    if (!formData?.titulo || !formData?.codigo) return

    let pdf_path = formData.pdf_path ?? null
    if (file) {
      const path = `${formData.codigo.replaceAll(' ', '_')}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('formatos').upload(path, file, {
        upsert: true, contentType: 'application/pdf',
      })
      if (error) {
        alert('Error subiendo PDF: ' + error.message)
        return
      }
      pdf_path = path
      formData.pdf_path = path
      formData.pdf_nombre = file.name
    }

    if (formData.id) {
      await supabase.from('formatos').update(formData).eq('id', formData.id)
      await logAccion('formato_modificado', 'formatos', formData.id, { titulo: formData.titulo })
    } else {
      const { data } = await supabase.from('formatos').insert([formData]).select()
      if (data?.[0]) await logAccion('formato_creado', 'formatos', data[0].id, { titulo: formData.titulo })
    }
    setFormModal(false)
    setFormData(null)
    cargar()
  }

  async function guardarAsignacion() {
    if (!asignData?.formato_id || !asignData?.usuario_id || !asignData?.base_id || !asignData?.frecuencia) return

    if (asignData.id) {
      await supabase.from('asignaciones_formatos').update(asignData).eq('id', asignData.id)
      await logAccion('asignacion_modificada', 'asignaciones_formatos', asignData.id)
    } else {
      const { data } = await supabase.from('asignaciones_formatos').insert([asignData]).select()
      if (data?.[0]) await logAccion('asignacion_creada', 'asignaciones_formatos', data[0].id)
    }
    setAsignModal(false)
    setAsignData(null)
    cargar()
  }

  async function eliminarFormato(id: string) {
    if (!confirm('¿Eliminar este formato?')) return
    await supabase.from('formatos').delete().eq('id', id)
    await logAccion('formato_eliminado', 'formatos', id)
    cargar()
  }

  async function eliminarAsignacion(id: string) {
    if (!confirm('¿Eliminar esta asignación?')) return
    await supabase.from('asignaciones_formatos').delete().eq('id', id)
    await logAccion('asignacion_eliminada', 'asignaciones_formatos', id)
    cargar()
  }

  if (cargando) return <div className="flex h-96 items-center justify-center">Cargando…</div>

  return (
    <>
      <PageHeader
        title="Formatos"
        subtitle="Gestionar formatos PDF y asignaciones"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-bg-border">
        <button
          onClick={() => setTab('formatos')}
          className={`px-4 py-3 font-medium border-b-2 transition ${
            tab === 'formatos'
              ? 'border-accent text-accent'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Formatos ({formatos.length})
        </button>
        <button
          onClick={() => setTab('asignaciones')}
          className={`px-4 py-3 font-medium border-b-2 transition ${
            tab === 'asignaciones'
              ? 'border-accent text-accent'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Settings2 className="w-4 h-4 inline mr-2" />
          Asignaciones ({asignaciones.length})
        </button>
      </div>

      {/* FORMATOS TAB */}
      {tab === 'formatos' && (
        <>
          <button
            onClick={() => { setFormData(null); setFormModal(true) }}
            className="btn-primary mb-6"
          >
            <Plus className="w-4 h-4" /> Nuevo formato
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formatos.map(fmt => (
              <div key={fmt.id} className="surface p-4 border border-bg-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium">{fmt.titulo}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-1">{fmt.codigo}</p>
                  </div>
                  {fmt.activo && <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />}
                </div>

                {fmt.descripcion && (
                  <p className="text-sm text-slate-400 mb-3">{fmt.descripcion}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs mb-4 pb-4 border-t border-bg-border pt-4">
                  <div>
                    <span className="text-slate-500">Versión:</span>
                    <span className="block font-mono">{fmt.version}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Categoría:</span>
                    <span className="block">{fmt.categoria || '—'}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setFormData(fmt); setFormModal(true) }}
                    className="btn-ghost flex-1"
                  >
                    <Settings2 className="w-3 h-3 inline mr-1" /> Editar
                  </button>
                  <button
                    onClick={() => eliminarFormato(fmt.id)}
                    className="btn-ghost flex-1 text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {formModal && (
            <FormFormatoModal
              data={formData}
              onClose={() => { setFormModal(false); setFormData(null) }}
              onSave={(file) => guardarFormato(file)}
              onChange={setFormData}
            />
          )}
        </>
      )}

      {/* ASIGNACIONES TAB */}
      {tab === 'asignaciones' && (
        <>
          <button
            onClick={() => { setAsignData(null); setAsignModal(true) }}
            className="btn-primary mb-6"
          >
            <Plus className="w-4 h-4" /> Nueva asignación
          </button>

          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Formato</th>
                  <th className="px-4 py-3 text-left">Usuario</th>
                  <th className="px-4 py-3 text-left">Base</th>
                  <th className="px-4 py-3 text-left">Frecuencia</th>
                  <th className="px-4 py-3 text-left">Límite</th>
                  <th className="px-4 py-3 text-center">Consolidar</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border">
                {asignaciones.map(asig => (
                  <tr key={asig.id} className="row-hover">
                    <td className="px-4 py-3 font-medium">{(asig.formato as any)?.titulo}</td>
                    <td className="px-4 py-3 text-sm">{(asig.usuario as any)?.nombre}</td>
                    <td className="px-4 py-3"><span className="iata">{(asig.base as any)?.codigo_iata}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{asig.frecuencia}</td>
                    <td className="px-4 py-3 font-mono text-xs">{asig.hora_limite}</td>
                    <td className="px-4 py-3 text-center">
                      {asig.consolidar_recordatorios && <CheckCircle className="w-4 h-4 text-accent mx-auto" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setAsignData(asig); setAsignModal(true) }}
                          className="btn-ghost"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => eliminarAsignacion(asig.id)}
                          className="btn-ghost text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {asignModal && (
            <FormAsignacionModal
              data={asignData}
              formatos={formatos}
              usuarios={usuarios}
              bases={bases}
              onClose={() => { setAsignModal(false); setAsignData(null) }}
              onSave={() => guardarAsignacion()}
              onChange={setAsignData}
            />
          )}
        </>
      )}
    </>
  )
}

function FormFormatoModal({
  data,
  onClose,
  onSave,
  onChange,
}: {
  data: Partial<Formato> | null
  onClose: () => void
  onSave: (file?: File) => void
  onChange: (data: Partial<Formato>) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 50 * 1024 * 1024,
  })

  async function handleSave() {
    setSubiendo(true)
    try {
      await onSave(file ?? undefined)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="surface p-6 max-w-md w-full overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {data?.id ? 'Editar formato' : 'Nuevo formato'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="label">Título *</label>
            <input
              className="input w-full mt-1"
              value={data?.titulo ?? ''}
              onChange={e => onChange({ ...data, titulo: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Código *</label>
            <input
              className="input w-full mt-1 font-mono text-sm"
              value={data?.codigo ?? ''}
              onChange={e => onChange({ ...data, codigo: e.target.value })}
              placeholder="INV-MENSUAL"
            />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input w-full mt-1"
              value={data?.descripcion ?? ''}
              onChange={e => onChange({ ...data, descripcion: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <label className="label">Categoría</label>
            <input
              className="input w-full mt-1"
              value={data?.categoria ?? ''}
              onChange={e => onChange({ ...data, categoria: e.target.value })}
              placeholder="inventarios, reportes, etc"
            />
          </div>

          <div>
            <label className="label">PDF</label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
                isDragActive
                  ? 'border-accent bg-accent/10'
                  : 'border-bg-border hover:border-accent/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
              {file ? (
                <p className="text-sm font-medium text-accent">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm">
                    {isDragActive ? 'Suelta el PDF aquí' : 'Arrastra un PDF o haz clic'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Max 50MB</p>
                </>
              )}
              {data?.pdf_nombre && !file && (
                <p className="text-xs text-slate-400 mt-2">PDF actual: {data.pdf_nombre}</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data?.activo ?? true}
              onChange={e => onChange({ ...data, activo: e.target.checked })}
            />
            <span className="text-sm">Activo</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-bg-border">
          <button className="btn-ghost" onClick={onClose} disabled={subiendo}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={subiendo}>
            {subiendo ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormAsignacionModal({
  data,
  formatos,
  usuarios,
  bases,
  onClose,
  onSave,
  onChange,
}: {
  data: Partial<AsignacionFormato> | null
  formatos: Formato[]
  usuarios: Usuario[]
  bases: Base[]
  onClose: () => void
  onSave: () => void
  onChange: (data: Partial<AsignacionFormato>) => void
}) {
  const frecuencias: FrecuenciaTarea[] = ['diaria', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual']

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="surface p-6 max-w-md w-full overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {data?.id ? 'Editar asignación' : 'Nueva asignación'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="label">Formato *</label>
            <select
              className="input w-full mt-1"
              value={data?.formato_id ?? ''}
              onChange={e => onChange({ ...data, formato_id: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {formatos.map(f => (
                <option key={f.id} value={f.id}>{f.titulo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Usuario *</label>
            <select
              className="input w-full mt-1"
              value={data?.usuario_id ?? ''}
              onChange={e => onChange({ ...data, usuario_id: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Base *</label>
            <select
              className="input w-full mt-1"
              value={data?.base_id ?? ''}
              onChange={e => onChange({ ...data, base_id: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {bases.map(b => (
                <option key={b.id} value={b.id}>{b.codigo_iata} — {b.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Frecuencia *</label>
            <select
              className="input w-full mt-1"
              value={data?.frecuencia ?? ''}
              onChange={e => onChange({ ...data, frecuencia: e.target.value as FrecuenciaTarea })}
            >
              <option value="">Seleccionar…</option>
              {frecuencias.map(f => (
                <option key={f} value={f}>{FREQ_LABELS[f]}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {data?.frecuencia ? FREQ_HELP[data.frecuencia as FrecuenciaTarea] : 'Elige cada cuánto se repite la tarea'}
            </p>
          </div>
          <div>
            <label className="label">Hora límite *</label>
            <input
              className="input w-full mt-1"
              type="time"
              value={data?.hora_limite ?? '18:00'}
              onChange={e => onChange({ ...data, hora_limite: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Hora del día (zona de la base) en la que debe estar completado.
            </p>
          </div>

          {/* Día de la semana: solo para semanal */}
          {data?.frecuencia === 'semanal' && (
            <div>
              <label className="label">Día de la semana *</label>
              <select
                className="input w-full mt-1"
                value={data?.dia_semana ?? ''}
                onChange={e => onChange({ ...data, dia_semana: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Seleccionar…</option>
                <option value="1">Lunes</option>
                <option value="2">Martes</option>
                <option value="3">Miércoles</option>
                <option value="4">Jueves</option>
                <option value="5">Viernes</option>
                <option value="6">Sábado</option>
                <option value="7">Domingo</option>
              </select>
            </div>
          )}

          {/* Día del mes: para mensual/trimestral/semestral/anual */}
          {['mensual', 'trimestral', 'semestral', 'anual'].includes(data?.frecuencia ?? '') && (
            <div>
              <label className="label">Día del mes *</label>
              <input
                className="input w-full mt-1"
                type="number"
                min="1"
                max="31"
                value={data?.dia_mes ?? ''}
                onChange={e => onChange({ ...data, dia_mes: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="ej. 15"
              />
              <p className="text-xs text-slate-500 mt-1">
                Si eliges 31 y el mes sólo tiene 30 (o febrero), se genera el último día del mes.
              </p>
            </div>
          )}

          {/* Mes del año: sólo para anual */}
          {data?.frecuencia === 'anual' && (
            <div>
              <label className="label">Mes del año *</label>
              <select
                className="input w-full mt-1"
                value={data?.mes_anual ?? ''}
                onChange={e => onChange({ ...data, mes_anual: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Seleccionar…</option>
                <option value="1">Enero</option>
                <option value="2">Febrero</option>
                <option value="3">Marzo</option>
                <option value="4">Abril</option>
                <option value="5">Mayo</option>
                <option value="6">Junio</option>
                <option value="7">Julio</option>
                <option value="8">Agosto</option>
                <option value="9">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>
            </div>
          )}

          {/* Aviso informativo para trimestral/semestral */}
          {(data?.frecuencia === 'trimestral' || data?.frecuencia === 'semestral') && (
            <div className="text-xs text-slate-500 bg-bg-elevated/40 p-3 rounded border border-bg-border">
              {data.frecuencia === 'trimestral'
                ? '📅 Se generará en enero, abril, julio y octubre.'
                : '📅 Se generará en enero y julio.'}
            </div>
          )}

          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={data?.consolidar_recordatorios ?? true}
              onChange={e => onChange({ ...data, consolidar_recordatorios: e.target.checked })}
            />
            <span className="text-sm">Consolidar recordatorios en un email</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-bg-border">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
