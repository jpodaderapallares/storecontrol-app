// StoreControl · Módulo QR (storekeeper)
// Pestaña independiente: subir documento → generar QR → compartir URL.
// No interactúa con plantillas, instancias, formatos ni biblioteca.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  QrCode, Upload, Search, Trash2, RotateCcw, Download, Copy, Check, X,
  FileText, Loader2, Eye, AlertCircle,
} from 'lucide-react'
import QRCode from 'qrcode'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import type { DocumentoQR } from '@/lib/database.types'
import { fmtDate } from '@/lib/format'

// Bucket privado para los documentos del módulo QR.
const BUCKET = 'tooling_qr'
// 50 MB por archivo (coincide con la política del bucket).
const MAX_BYTES = 52428800

// Tipos MIME aceptados. Se prioriza PDF; se permiten imágenes para fichas.
const ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
}

// Genera un slug corto URL-safe (10 chars sin ambigüedad: 0/O, 1/l/I, 5/S).
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

// URL pública que se codifica en el QR. Resuelta por el cliente (window.origin)
// + ruta SPA /qr/:slug que delega en el Edge Function qr-redirect.
function urlPublicaQR(slug: string): string {
  if (typeof window === 'undefined') return `/qr/${slug}`
  return `${window.location.origin}/qr/${slug}`
}

type Tab = 'activos' | 'papelera'

export default function StorekeeperQR() {
  const { usuario, base } = useAuth()
  const [docs, setDocs] = useState<DocumentoQR[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('activos')
  const [q, setQ] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [progresoArchivo, setProgresoArchivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrAbierto, setQrAbierto] = useState<DocumentoQR | null>(null)
  const [logoOk, setLogoOk] = useState(true) // graceful degradation

  useEffect(() => {
    if (!usuario || !base) return
    cargar()
    // Refrescar al volver a la pestaña (papelera <-> activos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id, base?.id, tab])

  async function cargar() {
    setLoading(true)
    setError(null)
    const query = supabase
      .from('documentos_qr')
      .select('*')
      .eq('base_id', base!.id)
      .order('created_at', { ascending: false })

    if (tab === 'activos') query.is('deleted_at', null)
    else query.not('deleted_at', 'is', null)

    const { data, error } = await query
    if (error) setError(error.message)
    setDocs((data ?? []) as DocumentoQR[])
    setLoading(false)
  }

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter(
      d =>
        d.filename.toLowerCase().includes(needle) ||
        d.slug.toLowerCase().includes(needle) ||
        (d.notes ?? '').toLowerCase().includes(needle),
    )
  }, [docs, q])

  // ---------- Subida ----------
  const onDrop = async (files: File[]) => {
    if (!usuario || !base) return
    setError(null)
    setSubiendo(true)
    try {
      for (const f of files) {
        if (f.size > MAX_BYTES) {
          throw new Error(`"${f.name}" supera 50 MB.`)
        }
        await subirUno(f)
      }
      await cargar()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSubiendo(false)
      setProgresoArchivo(null)
    }
  }

  async function subirUno(file: File) {
    setProgresoArchivo(file.name)
    const slug = generarSlug()
    const path = `${base!.id}/${slug}/${sanitizarNombre(file.name)}`

    // 1) Subir archivo al bucket
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (up.error) throw new Error(`Subida fallida: ${up.error.message}`)

    // 2) Insertar fila en documentos_qr
    const ins = await supabase
      .from('documentos_qr')
      .insert({
        propietario_id: usuario!.id,
        base_id: base!.id,
        slug,
        filename: file.name,
        size_bytes: file.size,
        content_type: file.type || 'application/octet-stream',
        storage_path: path,
      })
      .select()
      .single()

    if (ins.error) {
      // Rollback: borrar el objeto huérfano
      await supabase.storage.from(BUCKET).remove([path])
      throw new Error(`Registro fallido: ${ins.error.message}`)
    }

    await logAccion('qr_doc_creado', 'documentos_qr', ins.data.id, {
      slug, filename: file.name, size: file.size,
    })
  }

  function sanitizarNombre(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
  }

  // ---------- Papelera ----------
  async function moverAPapelera(d: DocumentoQR) {
    if (!confirm(`¿Mover "${d.filename}" a la papelera?\n(Se purgará definitivamente a los 30 días.)`)) return
    const { error } = await supabase
      .from('documentos_qr')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', d.id)
    if (error) {
      setError(`Papelera: ${error.message}`)
      return
    }
    await logAccion('qr_doc_papelera', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  async function restaurar(d: DocumentoQR) {
    const { error } = await supabase
      .from('documentos_qr')
      .update({ deleted_at: null })
      .eq('id', d.id)
    if (error) {
      setError(`Restaurar: ${error.message}`)
      return
    }
    await logAccion('qr_doc_restaurado', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  async function eliminarDefinitivo(d: DocumentoQR) {
    if (!confirm(`Eliminar "${d.filename}" definitivamente. ¿Estás seguro?\nEsta acción no se puede deshacer.`)) return
    // 1) Borrar storage (objeto + posible qr.png)
    const paths = [d.storage_path]
    if (d.qr_path) paths.push(d.qr_path)
    const stRm = await supabase.storage.from(BUCKET).remove(paths)
    if (stRm.error) {
      setError(`Storage: ${stRm.error.message}`)
      // continuar igualmente para no dejar la fila zombie
    }
    // 2) Borrar fila — solo admin tiene policy DELETE; el storekeeper hace soft-delete + storage remove,
    //    así que llamamos a un update que mantiene la fila o usamos la papelera. Para "eliminar
    //    definitivo" desde storekeeper, marcamos deleted_at = epoch antiguo para que la próxima
    //    purga la limpie. Esto evita necesitar permiso DELETE en RLS.
    const { error: upErr } = await supabase
      .from('documentos_qr')
      .update({
        deleted_at: new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString(),
        notes: (d.notes ? d.notes + ' · ' : '') + 'eliminada-por-usuario',
      })
      .eq('id', d.id)
    if (upErr) {
      setError(`Eliminar: ${upErr.message}`)
      return
    }
    await logAccion('qr_doc_eliminado', 'documentos_qr', d.id, { slug: d.slug })
    cargar()
  }

  // ---------- Acciones de fila ----------
  async function abrirDocumento(d: DocumentoQR) {
    const { data, error } = await supabase
      .storage.from(BUCKET).createSignedUrl(d.storage_path, 300)
    if (error || !data?.signedUrl) {
      setError(`URL firmada: ${error?.message ?? 'desconocido'}`)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <>
      <PageHeader
        title="Generar QR"
        subtitle="Sube un documento de herramientas y obtén un QR para imprimir o compartir."
        actions={
          <div className="flex items-center gap-3">
            {logoOk && (
              <img
                src="/hla-logo.png"
                alt="HLA"
                className="h-9 opacity-90"
                onError={() => setLogoOk(false)}
              />
            )}
          </div>
        }
      />

      {/* Pestañas */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab('activos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'activos'
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Activos
          </span>
        </button>
        <button
          onClick={() => setTab('papelera')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'papelera'
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-bg-elevated border-bg-border text-slate-400 hover:text-slate-100'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Papelera
          </span>
        </button>

        <div className="flex-1" />

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

      {/* Dropzone (solo en pestaña Activos) */}
      {tab === 'activos' && (
        <DropzoneArea onDrop={onDrop} subiendo={subiendo} progresoArchivo={progresoArchivo} />
      )}

      {/* Mensajes */}
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
            ? 'No hay documentos QR activos. Arrastra un PDF o imagen arriba para empezar.'
            : 'La papelera está vacía. Los documentos se purgan automáticamente a los 30 días.'}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Documento</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-right px-4 py-3 font-medium">Tamaño</th>
                <th className="text-right px-4 py-3 font-medium">Descargas</th>
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
                      <span className="font-medium truncate" title={d.filename}>
                        {d.filename}
                      </span>
                    </div>
                    {d.notes && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={d.notes}>
                        {d.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-300">{d.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">
                    {fmtBytes(d.size_bytes)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                    {d.downloads}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                    {fmtDate(tab === 'activos' ? d.created_at : (d.deleted_at ?? d.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    {tab === 'activos' ? (
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-ghost px-2 py-1.5"
                          title="Ver QR"
                          onClick={() => setQrAbierto(d)}
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          className="btn-ghost px-2 py-1.5"
                          title="Abrir documento"
                          onClick={() => abrirDocumento(d)}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="btn-ghost px-2 py-1.5 text-danger"
                          title="Mover a papelera"
                          onClick={() => moverAPapelera(d)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-ghost px-2 py-1.5"
                          title="Restaurar"
                          onClick={() => restaurar(d)}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          className="btn-ghost px-2 py-1.5 text-danger"
                          title="Eliminar definitivamente"
                          onClick={() => eliminarDefinitivo(d)}
                        >
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

      {/* Modal QR */}
      {qrAbierto && (
        <QrModal doc={qrAbierto} onClose={() => setQrAbierto(null)} />
      )}
    </>
  )
}

// ============================================================
//  Dropzone
// ============================================================
function DropzoneArea({
  onDrop, subiendo, progresoArchivo,
}: { onDrop: (files: File[]) => void; subiendo: boolean; progresoArchivo: string | null }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    maxSize: MAX_BYTES,
    disabled: subiendo,
  })
  return (
    <div
      {...getRootProps()}
      className={`surface p-6 mb-6 cursor-pointer transition-colors text-center ${
        isDragActive ? 'border-accent bg-accent/5' : 'hover:border-accent/40'
      } ${subiendo ? 'opacity-70 cursor-wait' : ''}`}
    >
      <input {...getInputProps()} />
      <Upload className="w-8 h-8 text-accent mx-auto mb-2" />
      {subiendo ? (
        <div className="text-slate-300 text-sm">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
          Subiendo {progresoArchivo ?? 'archivo'}…
        </div>
      ) : (
        <>
          <div className="font-medium">
            {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra un PDF o imagen, o haz clic para elegir'}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            PDF · PNG · JPG · WebP — máximo 50 MB por archivo
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
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
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
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="surface max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
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
