// StoreControl · Gestor de QRs (Admin / Logística Central)
// Diferencias con el módulo storekeeper:
// - Ve TODOS los documentos QR de todas las bases (no filtra por base)
// - Puede crear QRs sin asignar a base ("QR de Logística Central") o asignados a una base
// - Puede eliminar definitivamente (política RLS ya lo permite)
// - Muestra la base propietaria en cada fila

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  QrCode, Upload, Search, Trash2, RotateCcw, Download, Copy, Check, X,
  FileText, Loader2, Eye, AlertCircle, Camera, Building2,
} from 'lucide-react'
import QRCode from 'qrcode'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScanQRButton } from '@/components/ui/ScanQRButton'
import type { DocumentoQR, Base } from '@/lib/database.types'
import { fmtDate } from '@/lib/format'

const BUCKET = 'tooling_qr'
const MAX_BYTES = 52428800

const ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
}

function generarSlug(len = 10): string {
  const alfabeto = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < len; i++) s += alfabeto[bytes[i] % alfabeto.length]
  return s
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function urlPublicaQR(slug: string): string {
  if (typeof window === 'undefined') return `/qr/${slug}`
  return `${window.location.origin}/qr/${slug}`
}

function sanitizarNombre(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
}

type Tab = 'activos' | 'papelera'
type DocConBase = DocumentoQR & { bases?: { codigo_iata: string; nombre_completo: string } | null }

export default function AdminQR() {
  const { usuario } = useAuth()
  const [docs, setDocs] = useState<DocConBase[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('activos')
  const [q, setQ] = useState('')
  const [filtroBase, setFiltroBase] = useState<string>('')
  const [subiendo, setSubiendo] = useState(false)
  const [progresoArchivo, setProgresoArchivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrAbierto, setQrAbierto] = useState<DocConBase | null>(null)
  const [asignacionBase, setAsignacionBase] = useState<string>('')  // '' = Logística central

  useEffect(() => {
    if (!usuario) return
    cargar()
    cargarBases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id, tab])

  async function cargarBases() {
    const { data } = await supabase.from('bases').select('*').order('codigo_iata')
    setBases(data ?? [])
  }

  async function cargar() {
    setLoading(true)
    setError(null)
    const query = supabase
      .from('documentos_qr')
      .select('*, bases(codigo_iata, nombre_completo)')
      .order('created_at', { ascending: false })

    if (tab === 'activos') query.is('deleted_at', null)
    else query.not('deleted_at', 'is', null)

    const { data, error } = await query
    if (error) setError(error.message)
    setDocs((data as any) ?? [])
    setLoading(false)
  }

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return docs
      .filter(d => !filtroBase
        || (filtroBase === '__central' && !d.base_id)
        || d.base_id === filtroBase)
      .filter(d => !needle
        || d.filename.toLowerCase().includes(needle)
        || d.slug.toLowerCase().includes(needle)
        || (d.notes ?? '').toLowerCase().includes(needle))
  }, [docs, q, filtroBase])

  const onDrop = useCallback(async (files: File[]) => {
    if (!usuario) return
    setError(null)
    setSubiendo(true)
    try {
      for (const f of files) {
        if (f.size > MAX_BYTES) throw new Error(`"${f.name}" supera 50 MB.`)
        await subirUno(f)
      }
      await cargar()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSubiendo(false)
      setProgresoArchivo(null)
    }
  }, [usuario, asignacionBase])

  async function subirUno(file: File) {
    setProgresoArchivo(file.name)
    const slug = generarSlug()
    const targetBase = asignacionBase || 'central'
    const path = `${targetBase}/${slug}/${sanitizarNombre(file.name)}`

    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (up.error) throw new Error(`Subida fallida: ${up.error.message}`)

    const payload: any = {
      propietario_id: usuario!.id,
      base_id: asignacionBase || null,   // null = Logística Central
      slug,
      filename: file.name,
      size_bytes: file.size,
      content_type: file.type || 'application/octet-stream',
      storage_path: path,
    }

    const ins = await supabase.from('documentos_qr').insert(payload).select().single()
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove([path])
      throw new Error(`Registro fallido: ${ins.error.message}`)
    }

    await logAccion('qr_doc_creado_admin', 'documentos_qr', ins.data.id, {
      slug, filename: file.name, size: file.size, base_id: asignacionBase || null,
    })
  }

  async function moverAPapelera(d: DocConBase) {
    if (!confirm(`"${d.filename}"\n\n¿Mover a la papelera? Se purgará a los 30 días.`)) return
    const { error } = await supabase.from('documentos_qr')
      .update({ deleted_at: new Date().toISOString() }).eq('id', d.id)
    if (error) { setError(`Papelera: ${error.message}`); return }
    await logAccion('qr_doc_papelera_admin', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  async function restaurar(d: DocConBase) {
    const { error } = await supabase.from('documentos_qr')
      .update({ deleted_at: null }).eq('id', d.id)
    if (error) { setError(`Restaurar: ${error.message}`); return }
    await logAccion('qr_doc_restaurado_admin', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  async function eliminarDefinitivo(d: DocConBase) {
    if (!confirm(`"${d.filename}"\n\nEliminar DEFINITIVAMENTE. ¿Seguro?`)) return
    const paths = [d.storage_path]
    if (d.qr_path) paths.push(d.qr_path)
    await supabase.storage.from(BUCKET).remove(paths)
    // Admin sí tiene política DELETE
    const { error } = await supabase.from('documentos_qr').delete().eq('id', d.id)
    if (error) { setError(`Eliminar: ${error.message}`); return }
    await logAccion('qr_doc_eliminado_admin', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  async function abrirDocumento(d: DocConBase) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 300)
    if (error || !data?.signedUrl) {
      setError(`URL firmada: ${error?.message ?? 'desconocido'}`)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  // Contadores rápidos por base
  const stats = useMemo(() => {
    const total = docs.length
    const central = docs.filter(d => !d.base_id).length
    const conBase = total - central
    return { total, central, conBase }
  }, [docs])

  return (
    <>
      <PageHeader
        title="Gestor de QRs · Logística Central"
        subtitle="Sube documentos y certificados, genera QRs únicos para herramientas de todas las bases"
        actions={
          <>
            <ScanQRButton variant="compact" label="Escanear QR" />
          </>
        }
      />

      {/* KPI mini */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Total activos</div>
          <div className="font-display text-2xl font-extrabold mt-1">{stats.total}</div>
        </div>
        <div className="surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Logística Central</div>
          <div className="font-display text-2xl font-extrabold mt-1 text-accent">{stats.central}</div>
        </div>
        <div className="surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">En bases</div>
          <div className="font-display text-2xl font-extrabold mt-1">{stats.conBase}</div>
        </div>
      </div>

      {/* Selector de asignación al subir */}
      <div className="surface p-4 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
          Al subir un documento, asignarlo a:
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAsignacionBase('')}
            className={
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-2 ' +
              (asignacionBase === ''
                ? 'bg-accent/15 text-accent border-accent/40'
                : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100')
            }
          >
            <Building2 className="w-4 h-4" /> Logística Central
          </button>
          {bases.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setAsignacionBase(b.id)}
              className={
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors font-mono ' +
                (asignacionBase === b.id
                  ? 'bg-accent/15 text-accent border-accent/40'
                  : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100')
              }
              title={b.nombre_completo}
            >
              {b.codigo_iata}
            </button>
          ))}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('activos')}
          className={
            'px-4 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-2 ' +
            (tab === 'activos'
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100')
          }
        >
          <QrCode className="w-4 h-4" /> Activos
        </button>
        <button
          onClick={() => setTab('papelera')}
          className={
            'px-4 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-2 ' +
            (tab === 'papelera'
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100')
          }
        >
          <Trash2 className="w-4 h-4" /> Papelera
        </button>

        <div className="flex-1" />

        {/* Filtro por base */}
        <select
          className="input font-mono text-sm"
          value={filtroBase}
          onChange={e => setFiltroBase(e.target.value)}
        >
          <option value="">Todas las bases</option>
          <option value="__central">Solo Logística Central</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.codigo_iata}</option>)}
        </select>

        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar por nombre, slug o nota…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Dropzone */}
      {tab === 'activos' && (
        <DropzoneArea onDrop={onDrop} subiendo={subiendo} progresoArchivo={progresoArchivo}
          contexto={asignacionBase
            ? bases.find(b => b.id === asignacionBase)?.codigo_iata ?? 'BASE'
            : 'Logística Central'} />
      )}

      {error && (
        <div className="surface p-3 mb-4 flex items-start gap-2 border-danger/40">
          <AlertCircle className="w-4 h-4 text-danger mt-0.5" />
          <div className="text-sm text-danger">{error}</div>
          <button className="ml-auto text-slate-500" onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="surface p-8 text-center text-sm text-slate-500">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Cargando…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="surface p-8 text-center text-sm text-slate-500">
          {tab === 'activos'
            ? 'No hay documentos QR activos. Arrastra un PDF o imagen arriba para crear el primero.'
            : 'La papelera está vacía.'}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Documento</th>
                <th className="text-left px-4 py-3 font-medium">Base</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-right px-4 py-3 font-medium">Tamaño</th>
                <th className="text-right px-4 py-3 font-medium">Escaneos</th>
                <th className="text-left px-4 py-3 font-medium">
                  {tab === 'activos' ? 'Subido' : 'Borrado'}
                </th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(d => (
                <tr key={d.id} className="border-t border-bg-border row-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-accent shrink-0" />
                      <span className="font-medium truncate" title={d.filename}>{d.filename}</span>
                    </div>
                    {d.notes && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={d.notes}>
                        {d.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.bases ? (
                      <span className="font-mono font-bold text-slate-200" title={d.bases.nombre_completo}>
                        {d.bases.codigo_iata}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-accent text-xs" title="Logística Central">
                        <Building2 className="w-3 h-3" /> Central
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-300">{d.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">{fmtBytes(d.size_bytes)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">{d.downloads}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                    {fmtDate(tab === 'activos' ? d.created_at : (d.deleted_at ?? d.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    {tab === 'activos' ? (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1.5" title="Ver QR"
                          onClick={() => setQrAbierto(d)}>
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button className="btn-ghost px-2 py-1.5" title="Abrir documento"
                          onClick={() => abrirDocumento(d)}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="btn-ghost px-2 py-1.5 text-danger" title="Mover a papelera"
                          onClick={() => moverAPapelera(d)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1.5" title="Restaurar"
                          onClick={() => restaurar(d)}>
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button className="btn-ghost px-2 py-1.5 text-danger"
                          title="Eliminar definitivamente"
                          onClick={() => eliminarDefinitivo(d)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qrAbierto && <QrModal doc={qrAbierto} onClose={() => setQrAbierto(null)} />}
    </>
  )
}

// ============================================================
//  Dropzone
// ============================================================
function DropzoneArea({
  onDrop, subiendo, progresoArchivo, contexto,
}: {
  onDrop: (files: File[]) => void
  subiendo: boolean
  progresoArchivo: string | null
  contexto: string
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, multiple: true, maxSize: MAX_BYTES, disabled: subiendo,
  })
  return (
    <div
      {...getRootProps()}
      className={
        'surface p-6 mb-4 cursor-pointer transition-colors text-center ' +
        (isDragActive ? 'border-accent bg-accent/5' : 'hover:border-accent/40') +
        (subiendo ? ' opacity-70 cursor-wait' : '')
      }
    >
      <input {...getInputProps()} />
      <Upload className="w-8 h-8 text-accent mx-auto mb-2" />
      {subiendo ? (
        <div className="text-slate-300 text-sm">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
          Subiendo {progresoArchivo ?? '…'}
        </div>
      ) : (
        <>
          <div className="font-medium">
            {isDragActive
              ? 'Suelta el archivo aquí'
              : 'Arrastra un PDF o imagen, o haz clic para elegir'}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            PDF · PNG · JPG · WebP · máx 50 MB — asignar a <b className="text-accent">{contexto}</b>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
//  Modal QR (preview + descargar PNG + copiar URL)
// ============================================================
function QrModal({ doc, onClose }: { doc: DocumentoQR; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copiado, setCopiado] = useState(false)
  const url = urlPublicaQR(doc.slug)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, {
      errorCorrectionLevel: 'M', margin: 2, width: 320,
      color: { dark: '#0a0d14', light: '#ffffff' },
    }).catch(() => { /* noop */ })
  }, [url])

  function descargarPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `qr-${doc.slug}.png`
    a.click()
  }

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* noop */ }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500 font-mono">QR · {doc.slug}</div>
            <h3 className="font-display text-xl font-extrabold leading-tight truncate" title={doc.filename}>
              {doc.filename}
            </h3>
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white p-4 rounded-lg flex items-center justify-center mb-4">
          <canvas ref={canvasRef} className="w-[320px] h-[320px]" />
        </div>

        <div className="surface-elevated p-3 mb-4 font-mono text-xs text-slate-300 break-all">
          {url}
        </div>

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={copiarUrl}>
            {copiado ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'Copiado' : 'Copiar URL'}
          </button>
          <button className="btn-primary flex-1" onClick={descargarPng}>
            <Download className="w-4 h-4" /> Descargar PNG
          </button>
        </div>
      </div>
    </div>
  )
}
