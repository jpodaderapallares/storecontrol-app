import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { BookOpen, Download, Search, FileText } from 'lucide-react'
import type { BibliotecaDoc } from '@/lib/database.types'
import { fmtDate } from '@/lib/format'

const CATEGORIAS = ['Todas', 'Recepción', 'Inventario', 'Almacenamiento', 'Expedición', 'Seguridad', 'CAMO', 'Herramientas', 'Materiales Peligrosos']

export default function StorekeeperBiblioteca() {
  const [docs, setDocs] = useState<BibliotecaDoc[]>([])
  const [cat, setCat] = useState('Todas')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase
      .from('biblioteca_tecnica')
      .select('*').eq('activo', true).order('fecha_revision', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }

  const filtrados = docs.filter(d =>
    (cat === 'Todas' || d.categoria === cat) &&
    (q === '' || d.titulo.toLowerCase().includes(q.toLowerCase())
      || d.referencia.toLowerCase().includes(q.toLowerCase())),
  )

  async function verPdf(d: BibliotecaDoc) {
    await logAccion('bt_consultado', 'biblioteca_tecnica', d.id, { referencia: d.referencia })
    if (d.pdf_path) {
      const { data } = await supabase.storage.from('biblioteca-tecnica').createSignedUrl(d.pdf_path, 300)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } else {
      alert('PDF aún no subido. Contacta con Logística.')
    }
  }

  return (
    <>
      <PageHeader
        title="Biblioteca técnica"
        subtitle="Procedimientos, notices y training de Logística HLA"
      />

      <div className="surface p-4 mb-6 flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar por título o referencia (p.ej. LOGN_22_01)…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIAS.map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                cat === c
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-slate-500 text-sm">Cargando…</div>}

      <div className="grid grid-cols-3 gap-4">
        {filtrados.map(d => (
          <div key={d.id} id={d.id} className="surface p-5 hover:border-accent/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="font-mono text-[11px] text-slate-400">{d.referencia}</span>
              <span className="pill bg-bg-elevated border border-bg-border text-slate-400 ml-auto">
                v{d.version}
              </span>
            </div>
            <h3 className="font-semibold leading-snug mb-1 line-clamp-2">{d.titulo}</h3>
            <div className="text-xs text-slate-500 font-mono mb-3">
              {d.categoria} · {fmtDate(d.fecha_revision)}
              {d.emisor && <> · {d.emisor}</>}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => verPdf(d)}>
                <BookOpen className="w-4 h-4" /> Ver PDF
              </button>
            </div>
          </div>
        ))}
      </div>
      {filtrados.length === 0 && !loading && (
        <div className="surface p-6 text-center text-sm text-slate-500">
          No hay procedimientos que coincidan con los filtros.
        </div>
      )}
    </>
  )
}
