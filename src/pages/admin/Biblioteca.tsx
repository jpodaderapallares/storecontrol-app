import { useEffect, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Plus, FileText, Search, Upload, Edit, Archive } from 'lucide-react'
import type { BibliotecaDoc } from '@/lib/database.types'
import { fmtDate } from '@/lib/format'

const CATEGORIAS = ['Recepción', 'Inventario', 'Almacenamiento', 'Expedición', 'Seguridad', 'CAMO', 'Herramientas', 'Materiales Peligrosos']

export default function BibliotecaAdmin() {
  const [docs, setDocs] = useState<BibliotecaDoc[]>([])
  const [q, setQ] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [edit, setEdit] = useState<BibliotecaDoc | null>(null)

  useEffect(() => { cargar() }, [])
  async function cargar() {
    const { data } = await supabase.from('biblioteca_tecnica').select('*').order('fecha_revision', { ascending: false })
    setDocs(data ?? [])
  }

  const filtrados = docs.filter(d =>
    q === '' || d.titulo.toLowerCase().includes(q.toLowerCase())
      || d.referencia.toLowerCase().includes(q.toLowerCase()),
  )

  async function toggleActivo(d: BibliotecaDoc) {
    await supabase.from('biblioteca_tecnica').update({ activo: !d.activo }).eq('id', d.id)
    await logAccion('bt_toggle', 'biblioteca_tecnica', d.id, { activo: !d.activo })
    cargar()
  }

  return (
    <>
      <PageHeader
        title="Biblioteca técnica"
        subtitle="Procedimientos, Notices y Trainings de Logística"
        actions={
          <button className="btn-primary" onClick={() => { setEdit(null); setMostrarForm(true) }}>
            <Plus className="w-4 h-4" /> Subir procedimiento
          </button>
        }
      />

      <div className="surface p-3 mb-4 flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar por título o referencia (LOGINFO_, LOGN_, LOGTRA_)…"
            value={q} onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Ref.</th>
              <th className="px-4 py-3 text-left">Título</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-left">Versión</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {filtrados.map(d => (
              <tr key={d.id} className="row-hover">
                <td className="px-4 py-3 font-mono text-xs text-accent">{d.referencia}</td>
                <td className="px-4 py-3 font-medium">{d.titulo}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{d.categoria}</td>
                <td className="px-4 py-3 font-mono text-xs">v{d.version}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{fmtDate(d.fecha_revision)}</td>
                <td className="px-4 py-3">
                  <span className={d.activo ? 'pill-done' : 'pill-pend'}>{d.activo ? 'activo' : 'archivado'}</span>
                </td>
                <td className="px-4 py-3 flex gap-1">
                  <button className="btn-ghost" onClick={() => { setEdit(d); setMostrarForm(true) }}>
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="btn-ghost" onClick={() => toggleActivo(d)} title="Archivar/Restaurar">
                    <Archive className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarForm && (
        <FormDoc doc={edit} onClose={() => { setMostrarForm(false); cargar() }} />
      )}
    </>
  )
}

function FormDoc({ doc, onClose }: { doc: BibliotecaDoc | null; onClose: () => void }) {
  const [titulo, setTitulo] = useState(doc?.titulo ?? '')
  const [referencia, setReferencia] = useState(doc?.referencia ?? '')
  const [categoria, setCategoria] = useState(doc?.categoria ?? 'Almacenamiento')
  const [version, setVersion] = useState(doc?.version ?? 1)
  const [fecha, setFecha] = useState(doc?.fecha_revision ?? new Date().toISOString().slice(0, 10))
  const [emisor, setEmisor] = useState(doc?.emisor ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 50 * 1024 * 1024,
  })

  async function guardar() {
    setSubiendo(true)
    try {
      let pdf_path = doc?.pdf_path ?? null
      if (file) {
        const path = `${referencia.replaceAll(' ', '_')}/${version}/${Date.now()}_${file.name}`
        const { error } = await supabase.storage.from('biblioteca-tecnica').upload(path, file, {
          upsert: true, contentType: 'application/pdf',
        })
        if (error) throw error
        pdf_path = path
      }
      const payload: Partial<BibliotecaDoc> = {
        titulo, referencia, categoria, version, fecha_revision: fecha, emisor, pdf_path, activo: true,
      }
      if (doc) {
        await supabase.from('biblioteca_tecnica').update(payload).eq('id', doc.id)
        await logAccion('bt_modificado', 'biblioteca_tecnica', doc.id, { referencia, version })
      } else {
        const { data } = await supabase.from('biblioteca_tecnica').insert(payload).select().single()
        if (data) await logAccion('bt_creado', 'biblioteca_tecnica', data.id, { referencia, version })
      }
      onClose()
    } catch (e: any) {
      alert('Error guardando: ' + (e.message ?? e))
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="surface p-6 max-w-xl w-full max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {doc ? 'Editar procedimiento' : 'Subir nuevo procedimiento'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="label">Referencia (LOGINFO_XX_XX / LOGN_XX_XX / LOGTRA_XX_XX)</label>
            <input className="input w-full mt-1 font-mono" value={referencia} onChange={e => setReferencia(e.target.value)} />
          </div>
          <div>
            <label className="label">Título</label>
            <input className="input w-full mt-1" value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input w-full mt-1" value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Versión</label>
              <input type="number" min={1} className="input w-full mt-1" value={version} onChange={e => setVersion(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Fecha revisión</label>
              <input type="date" className="input w-full mt-1" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Emisor</label>
            <input className="input w-full mt-1" value={emisor} onChange={e => setEmisor(e.target.value)} placeholder="Julio Podadera" />
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
              isDragActive ? 'border-accent bg-accent/5' : 'border-bg-border hover:border-accent/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
            {file ? (
              <div className="text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                {doc?.pdf_path
                  ? 'PDF actual en storage · suelta uno nuevo para reemplazar'
                  : 'Arrastra el PDF del procedimiento o haz clic'}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-bg-border">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={subiendo || !titulo || !referencia}>
            {subiendo ? 'Subiendo…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
