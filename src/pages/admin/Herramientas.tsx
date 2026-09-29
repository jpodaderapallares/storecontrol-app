// StoreControl · Gestión de Herramientas Calibradas (Admin / Logística Central)
// Flujo de alta:
//  1. Admin sube el PDF del certificado.
//  2. Se llama a la Edge Function parse-cert-pdf → Claude Haiku extrae los campos.
//  3. Admin verifica/edita y confirma.
//  4. Se crea la herramienta + calibración + se sube el PDF + se genera el QR.
// La página funciona SIN IA (modo manual) si ANTHROPIC_API_KEY no está configurada.

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import QRCode from 'qrcode'
import {
  Wrench, Plus, Search, RefreshCw, Loader2, Upload, X, CheckCircle2,
  AlertCircle, FileText, Sparkles, QrCode as QrIcon, Edit2, Building2,
  Download, Copy, Check, Calendar, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScanQRButton } from '@/components/ui/ScanQRButton'
import { fmtDate } from '@/lib/format'
import type { Herramienta, Calibracion, Base } from '@/lib/database.types'

const CERT_BUCKET = 'certificados_calibracion'
const QR_BUCKET = 'tooling_qr'
const MAX_BYTES = 20971520 // 20 MB

interface HerramientaConCal extends Herramienta {
  bases?: { codigo_iata: string; nombre_completo: string } | null
  calibracion?: Calibracion | null
  qr_slug?: string | null
}

function generarSlug(len = 10): string {
  const alfabeto = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < len; i++) s += alfabeto[bytes[i] % alfabeto.length]
  return s
}

function urlPublicaQR(slug: string): string {
  if (typeof window === 'undefined') return `/qr/${slug}`
  return `${window.location.origin}/qr/${slug}`
}

function siguienteCodigo(items: Herramienta[]): string {
  // Detecta el patrón dominante en los códigos existentes:
  //   HLACAL_XXX  (convención HLA — mayoritaria)
  //   T-XXX
  //   fallback: HLACAL_001 si la app está recién estrenada
  const patterns: Array<{ re: RegExp; prefix: string; sep: string; pad: number }> = [
    { re: /^HLACAL[_-](\d+)/i, prefix: 'HLACAL', sep: '_', pad: 3 },
    { re: /^T[_-]?(\d+)/i,     prefix: 'T',      sep: '-', pad: 3 },
  ]
  let bestPattern = patterns[0]  // HLACAL_XXX por defecto (convención HLA)
  let maxCount = 0
  let maxSeen = 0
  for (const p of patterns) {
    let count = 0
    let maxInThis = 0
    for (const h of items) {
      const m = h.codigo_interno.match(p.re)
      if (m) { count++; maxInThis = Math.max(maxInThis, parseInt(m[1], 10)) }
    }
    if (count > maxCount) {
      maxCount = count
      bestPattern = p
      maxSeen = maxInThis
    }
  }
  return bestPattern.prefix + bestPattern.sep + String(maxSeen + 1).padStart(bestPattern.pad, '0')
}

function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  return Math.floor((d - Date.now()) / (24 * 3600 * 1000))
}

export default function HerramientasPage() {
  const { usuario } = useAuth()
  const [herramientas, setHerramientas] = useState<HerramientaConCal[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filtroBase, setFiltroBase] = useState<string>('')
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<HerramientaConCal | null>(null)
  const [qrOpen, setQrOpen] = useState<{ slug: string; label: string; sn?: string | null } | null>(null)

  useEffect(() => { if (usuario) { cargar(); cargarBases() } /* eslint-disable-next-line */ }, [usuario?.id])

  async function cargarBases() {
    const { data } = await supabase.from('bases').select('*').order('codigo_iata')
    setBases(data ?? [])
  }

  async function cargar() {
    setLoading(true)
    // Herramientas + base propietaria + última calibración
    const { data: herrs, error } = await supabase
      .from('herramientas')
      .select('*, bases:ubicacion_base_id(codigo_iata, nombre_completo)')
      .order('codigo_interno')

    if (error) { alert('Error: ' + error.message); setLoading(false); return }

    const ids = (herrs ?? []).map(h => h.id)
    const calMap: Record<string, Calibracion> = {}
    const qrMap: Record<string, string> = {}

    if (ids.length > 0) {
      const [{ data: cs }, { data: qs }] = await Promise.all([
        supabase.from('calibraciones').select('*')
          .in('herramienta_id', ids)
          .order('fecha_calibracion', { ascending: false }),
        supabase.from('documentos_qr').select('slug, herramienta_id')
          .in('herramienta_id', ids)
          .is('deleted_at', null),
      ])
      for (const c of (cs ?? []) as any[]) if (!calMap[c.herramienta_id]) calMap[c.herramienta_id] = c
      for (const q of (qs ?? []) as any[]) qrMap[q.herramienta_id] = q.slug
    }

    setHerramientas((herrs ?? []).map((h: any) => ({
      ...h,
      calibracion: calMap[h.id] ?? null,
      qr_slug: qrMap[h.id] ?? null,
    })))
    setLoading(false)
  }

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return herramientas.filter(h => {
      if (filtroBase === '__central' && h.ubicacion_base_id) return false
      if (filtroBase && filtroBase !== '__central' && h.ubicacion_base_id !== filtroBase) return false
      if (filtroEstado && h.estado !== filtroEstado) return false
      if (!needle) return true
      return (
        h.codigo_interno.toLowerCase().includes(needle) ||
        (h.numero_serie ?? '').toLowerCase().includes(needle) ||
        (h.marca ?? '').toLowerCase().includes(needle) ||
        (h.modelo ?? '').toLowerCase().includes(needle) ||
        (h.tipo ?? '').toLowerCase().includes(needle)
      )
    })
  }, [herramientas, q, filtroBase, filtroEstado])

  const stats = useMemo(() => {
    const activas = herramientas.filter(h => h.estado === 'activa').length
    const bloqueadas = herramientas.filter(h => h.estado === 'bloqueada').length
    const pronto = herramientas.filter(h => {
      const d = diasHasta(h.calibracion?.vence_en)
      return d !== null && d >= 0 && d <= 30
    }).length
    return { total: herramientas.length, activas, bloqueadas, pronto }
  }, [herramientas])

  return (
    <>
      <PageHeader
        title="Herramientas calibradas"
        subtitle="Torquímetros, calibradores, multímetros y demás activos con certificado. Cada herramienta lleva su QR único."
        actions={
          <>
            <ScanQRButton variant="compact" label="Escanear QR" />
            <button className="btn-ghost" onClick={cargar} disabled={loading}>
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> Actualizar
            </button>
            <button
              className="btn-primary"
              onClick={() => { setEditing(null); setModalOpen(true) }}
            >
              <Plus className="w-4 h-4" /> Nueva herramienta
            </button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Kpi label="Total" value={stats.total} />
        <Kpi label="Activas" value={stats.activas} color="text-success" />
        <Kpi label="Vencen en < 30 días" value={stats.pronto} color={stats.pronto > 0 ? 'text-warning' : ''} />
        <Kpi label="Bloqueadas" value={stats.bloqueadas} color={stats.bloqueadas > 0 ? 'text-danger' : ''} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input w-full pl-9" placeholder="Buscar código, SN, marca…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input font-mono text-sm" value={filtroBase} onChange={e => setFiltroBase(e.target.value)}>
          <option value="">Todas las bases</option>
          <option value="__central">Logística Central</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.codigo_iata}</option>)}
        </select>
        <select className="input text-sm" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Cualquier estado</option>
          <option value="activa">Activa</option>
          <option value="en_transito">En tránsito</option>
          <option value="bloqueada">Bloqueada</option>
          <option value="baja">Baja</option>
        </select>
        {(q || filtroBase || filtroEstado) && (
          <button className="btn-ghost text-xs"
            onClick={() => { setQ(''); setFiltroBase(''); setFiltroEstado('') }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="surface p-8 text-center text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Cargando…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="surface p-10 text-center">
          <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <div className="text-sm text-slate-400">
            {herramientas.length === 0
              ? 'Aún no hay herramientas. Pulsa "Nueva herramienta" para dar de alta la primera.'
              : 'No hay resultados con estos filtros.'}
          </div>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Código</th>
                <th className="text-left px-4 py-3 font-medium">Herramienta</th>
                <th className="text-left px-4 py-3 font-medium">Ubicación</th>
                <th className="text-left px-4 py-3 font-medium">Calibración vence</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(h => <FilaHerramienta key={h.id} h={h}
                onEditar={() => { setEditing(h); setModalOpen(true) }}
                onVerQR={() => {
                  if (h.qr_slug) setQrOpen({ slug: h.qr_slug, label: h.codigo_interno, sn: h.numero_serie })
                  else alert('Esta herramienta aún no tiene QR asignado. Edítala y guarda para generarlo.')
                }} />)}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NuevaHerramientaModal
          bases={bases}
          existentes={herramientas}
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); cargar() }}
        />
      )}

      {qrOpen && <QrPreviewModal slug={qrOpen.slug} label={qrOpen.label} sn={qrOpen.sn} onClose={() => setQrOpen(null)} />}
    </>
  )
}

// ============================================================
//  KPI
// ============================================================
function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</div>
      <div className={clsx('font-display text-3xl font-extrabold mt-1', color)}>{value}</div>
    </div>
  )
}

// ============================================================
//  Fila de herramienta
// ============================================================
function FilaHerramienta({
  h, onEditar, onVerQR,
}: {
  h: HerramientaConCal; onEditar: () => void; onVerQR: () => void
}) {
  const dias = diasHasta(h.calibracion?.vence_en)
  const venceColor =
    dias === null ? 'text-slate-500'
    : dias < 0 ? 'text-danger'
    : dias <= 15 ? 'text-danger'
    : dias <= 30 ? 'text-warning'
    : 'text-success'

  const estadoBadge =
    h.estado === 'activa' ? 'pill-done'
    : h.estado === 'en_transito' ? 'pill bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
    : h.estado === 'bloqueada' ? 'pill-vencida'
    : 'pill-pend'

  return (
    <tr className="border-t border-bg-border row-hover">
      <td className="px-4 py-3">
        <span className="font-mono font-bold text-warning">{h.codigo_interno}</span>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{h.marca || '—'} {h.modelo || ''}</div>
        <div className="text-[11px] text-slate-500 font-mono">
          {h.tipo || '—'}{h.numero_serie ? ' · SN ' + h.numero_serie : ''}{h.rango ? ' · ' + h.rango : ''}
        </div>
      </td>
      <td className="px-4 py-3">
        {h.bases ? (
          <span className="font-mono font-bold text-slate-200" title={h.bases.nombre_completo}>
            {h.bases.codigo_iata}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-accent text-xs" title="Logística Central">
            <Building2 className="w-3 h-3" /> Central
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {h.calibracion ? (
          <div className="flex items-center gap-2">
            <Calendar className={clsx('w-3.5 h-3.5', venceColor)} />
            <div>
              <div className={clsx('font-mono text-xs', venceColor)}>{fmtDate(h.calibracion.vence_en)}</div>
              <div className="text-[10px] text-slate-500">
                {dias === null ? '' : dias < 0 ? Math.abs(dias) + ' días atrás' : dias + ' días'}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">Sin certificado</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={estadoBadge}>{h.estado.replace('_', ' ')}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <button className="btn-ghost px-2 py-1.5" title="Ver QR" onClick={onVerQR}>
            <QrIcon className="w-4 h-4" />
          </button>
          <button className="btn-ghost px-2 py-1.5" title="Editar / historial" onClick={onEditar}>
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ============================================================
//  Modal Nueva Herramienta (3 pasos)
// ============================================================
type Fields = {
  codigo_interno: string
  numero_serie: string
  marca: string
  modelo: string
  tipo: string
  rango: string
  ubicacion_base_id: string        // '' = Central
  fecha_calibracion: string        // YYYY-MM-DD
  vence_en: string                 // YYYY-MM-DD
  laboratorio: string
  incertidumbre_valor: string
  incertidumbre_unidad: string
  notas: string
}

const CAMPOS_VACIOS: Fields = {
  codigo_interno: '', numero_serie: '', marca: '', modelo: '', tipo: '', rango: '',
  ubicacion_base_id: '', fecha_calibracion: '', vence_en: '', laboratorio: '',
  incertidumbre_valor: '', incertidumbre_unidad: '', notas: '',
}

function NuevaHerramientaModal({
  bases, existentes, editing, onClose,
}: {
  bases: Base[]
  existentes: HerramientaConCal[]
  editing: HerramientaConCal | null
  onClose: () => void
}) {
  const { usuario } = useAuth()
  const [step, setStep] = useState<'upload' | 'ia' | 'form' | 'saving' | 'done'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [fields, setFields] = useState<Fields>(() => {
    if (!editing) return { ...CAMPOS_VACIOS, codigo_interno: siguienteCodigo(existentes) }
    return {
      codigo_interno: editing.codigo_interno,
      numero_serie: editing.numero_serie ?? '',
      marca: editing.marca ?? '',
      modelo: editing.modelo ?? '',
      tipo: editing.tipo ?? '',
      rango: editing.rango ?? '',
      ubicacion_base_id: editing.ubicacion_base_id ?? '',
      fecha_calibracion: editing.calibracion?.fecha_calibracion ?? '',
      vence_en: editing.calibracion?.vence_en ?? '',
      laboratorio: editing.calibracion?.laboratorio ?? '',
      incertidumbre_valor: editing.calibracion?.incertidumbre?.valor?.toString() ?? '',
      incertidumbre_unidad: editing.calibracion?.incertidumbre?.unidad ?? '',
      notas: editing.notas ?? '',
    }
  })
  const [iaError, setIaError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [nuevoSlug, setNuevoSlug] = useState<string>('')

  useEffect(() => {
    // Si estamos editando, saltar directo al form
    if (editing) setStep('form')
  }, [editing])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) { setFile(files[0]); procesarPdf(files[0]) } },
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    disabled: step !== 'upload',
  })

  async function procesarPdf(f: File) {
    setStep('ia')
    setIaError(null)
    try {
      const form = new FormData()
      form.append('file', f)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const url = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1/parse-cert-pdf'
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        body: form,
      })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.ok) {
        if (body?.needs_api_key) {
          setIaError('IA no configurada aún (falta ANTHROPIC_API_KEY). Puedes rellenar los campos a mano.')
        } else {
          setIaError('IA no pudo leer el PDF: ' + (body?.error ?? r.status))
        }
        setStep('form')
        return
      }
      const d = body.data ?? {}
      // Si la IA extrajo un código interno con formato HLA (HLACAL_XXX o similar),
      // lo usamos por encima del T-001 auto-sugerido.
      const codigoIA = (d.codigo_interno ?? '').toString().trim()
      // Si sigue faltando vence_en pero hay fecha, +12 meses cliente (por si el edge no lo puso)
      let venceComputado = d.vence_en ?? ''
      if (!venceComputado && d.fecha_calibracion) {
        try {
          const [y, m, dd] = d.fecha_calibracion.split('-').map((x: string) => parseInt(x, 10))
          const dt = new Date(Date.UTC(y, m - 1, dd)); dt.setUTCFullYear(dt.getUTCFullYear() + 1)
          venceComputado = dt.toISOString().slice(0, 10)
        } catch { /* ignore */ }
      }
      setFields(prev => ({
        ...prev,
        codigo_interno: codigoIA || prev.codigo_interno,
        numero_serie: d.numero_serie ?? prev.numero_serie,
        marca: d.marca ?? prev.marca,
        modelo: d.modelo ?? prev.modelo,
        tipo: d.tipo ?? prev.tipo,
        rango: d.rango ?? prev.rango,
        fecha_calibracion: d.fecha_calibracion ?? prev.fecha_calibracion,
        vence_en: venceComputado || prev.vence_en,
        laboratorio: d.laboratorio ?? prev.laboratorio,
        incertidumbre_valor: d.incertidumbre?.valor?.toString() ?? prev.incertidumbre_valor,
        incertidumbre_unidad: d.incertidumbre?.unidad ?? prev.incertidumbre_unidad,
        notas: d.observaciones ?? prev.notas,
      }))
      setStep('form')
    } catch (e: any) {
      setIaError('Error de red: ' + (e?.message ?? String(e)))
      setStep('form')
    }
  }

  async function guardar() {
    if (!usuario) return
    if (!fields.codigo_interno.trim()) { setSaveError('Falta código interno'); return }
    setSaveError(null)
    setStep('saving')
    try {
      let herrId = editing?.id
      // 1. UPSERT herramienta
      if (editing) {
        const { error } = await supabase.from('herramientas').update({
          codigo_interno: fields.codigo_interno.trim(),
          numero_serie: fields.numero_serie || null,
          marca: fields.marca || null,
          modelo: fields.modelo || null,
          tipo: fields.tipo || null,
          rango: fields.rango || null,
          ubicacion_base_id: fields.ubicacion_base_id || null,
          notas: fields.notas || null,
        }).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('herramientas').insert({
          codigo_interno: fields.codigo_interno.trim(),
          numero_serie: fields.numero_serie || null,
          marca: fields.marca || null,
          modelo: fields.modelo || null,
          tipo: fields.tipo || null,
          rango: fields.rango || null,
          ubicacion_base_id: fields.ubicacion_base_id || null,
          notas: fields.notas || null,
          created_by: usuario.id,
        }).select().single()
        if (error) throw error
        herrId = data.id
      }

      // 2. Subir PDF cert (si hay) + INSERT calibración
      if (fields.fecha_calibracion && fields.vence_en) {
        let certPath: string | null = null
        if (file) {
          const path = `${herrId}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`
          const up = await supabase.storage.from(CERT_BUCKET).upload(path, file, {
            contentType: 'application/pdf', upsert: false,
          })
          if (up.error) throw new Error('Subida PDF: ' + up.error.message)
          certPath = path
        }

        const inc = fields.incertidumbre_valor
          ? { valor: Number(fields.incertidumbre_valor), unidad: fields.incertidumbre_unidad || null }
          : null

        const { error } = await supabase.from('calibraciones').insert({
          herramienta_id: herrId,
          fecha_calibracion: fields.fecha_calibracion,
          vence_en: fields.vence_en,
          laboratorio: fields.laboratorio || null,
          certificado_pdf: certPath,
          incertidumbre: inc,
          parseado_por_ia: !!file && !iaError,
          created_by: usuario.id,
        })
        if (error) throw error
      }

      // 3. Asegurar que la herramienta tiene su QR único.
      //    NO subimos placeholder: la Edge Function qr-redirect (v3) detecta
      //    herramienta_id y sirve automáticamente la ÚLTIMA calibración
      //    desde el bucket certificados_calibracion. Al renovar el cert,
      //    el mismo QR físico apunta al nuevo PDF sin regenerar nada.
      const yaTieneQR = editing?.qr_slug ?? null
      if (herrId && !yaTieneQR) {
        const slug = generarSlug()
        setNuevoSlug(slug)
        // storage_path debe ser NOT NULL pero no se usa cuando hay herramienta_id.
        // Usamos un identificador sintético (no crea fichero real).
        const dummyPath = `herramientas/${herrId}/no-storage`
        await supabase.from('documentos_qr').insert({
          propietario_id: usuario.id,
          base_id: fields.ubicacion_base_id || null,
          herramienta_id: herrId,
          slug,
          filename: 'Herramienta ' + fields.codigo_interno,
          size_bytes: 0,
          content_type: 'application/pdf',
          storage_path: dummyPath,
        })
        await logAccion(editing ? 'herramienta_qr_generado' : 'herramienta_creada',
          'herramientas', herrId, {
            codigo: fields.codigo_interno, slug_qr: slug,
          })
      } else if (yaTieneQR) {
        setNuevoSlug(yaTieneQR)  // para mostrar el mismo QR en el resumen final
        await logAccion('herramienta_modificada', 'herramientas', herrId, { codigo: fields.codigo_interno })
      }

      setStep('done')
    } catch (e: any) {
      setSaveError(e?.message ?? String(e))
      setStep('form')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border sticky top-0 bg-bg-surface z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display font-extrabold">
                {editing ? 'Editar herramienta' : 'Nueva herramienta'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {step === 'upload' && 'Paso 1 · Subir certificado (opcional)'}
                {step === 'ia' && 'Paso 2 · IA analizando…'}
                {step === 'form' && 'Paso 3 · Revisa y confirma'}
                {step === 'saving' && 'Guardando…'}
                {step === 'done' && 'Herramienta creada'}
              </div>
            </div>
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-5">

          {step === 'upload' && (
            <>
              <p className="text-sm text-slate-400 mb-4">
                Arrastra el PDF del certificado de calibración. La IA extraerá SN, marca, modelo, fechas y laboratorio automáticamente. Si no tienes PDF, salta este paso.
              </p>
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                  isDragActive ? 'border-accent bg-accent/5' : 'border-bg-border hover:border-accent/50',
                )}
              >
                <input {...getInputProps()} />
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-cyan-500 grid place-items-center mx-auto mb-3">
                  <Upload className="w-7 h-7 text-white" strokeWidth={2.5} />
                </div>
                <div className="font-medium">
                  {isDragActive ? 'Suelta el PDF aquí' : 'Arrastra el certificado o haz clic'}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono">PDF · máx 20 MB</div>
              </div>

              <div className="flex justify-between mt-4">
                <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                <button className="btn-secondary" onClick={() => setStep('form')}>
                  Sin PDF · rellenar manualmente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 'ia' && (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 grid place-items-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div className="font-display text-xl font-extrabold">IA leyendo el certificado…</div>
              <div className="text-sm text-slate-400 mt-2">Claude Haiku extrae SN, marca, modelo, fechas y laboratorio</div>
              <div className="text-[11px] text-slate-500 font-mono mt-4">{file?.name}</div>
              <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto mt-6" />
            </div>
          )}

          {step === 'form' && (
            <FormCampos
              fields={fields}
              setFields={setFields}
              bases={bases}
              iaError={iaError}
              saveError={saveError}
              file={file}
              onCancel={onClose}
              onSave={guardar}
              editing={!!editing}
            />
          )}

          {step === 'saving' && (
            <div className="text-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
              <div className="text-sm text-slate-300">Guardando herramienta y generando QR…</div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-success/20 grid place-items-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div className="font-display text-xl font-extrabold">Herramienta creada ✓</div>
              <div className="text-sm text-slate-400 mt-1">
                {fields.codigo_interno} · {fields.marca} {fields.modelo}
              </div>
              {nuevoSlug && (
                <div className="mt-6 inline-block">
                  <QrPreviewInline slug={nuevoSlug} codigo={fields.codigo_interno} />
                </div>
              )}
              <div className="flex justify-center gap-2 mt-6">
                <button className="btn-primary" onClick={onClose}>Cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
//  Formulario editable
// ============================================================
function FormCampos({
  fields, setFields, bases, iaError, saveError, file, onCancel, onSave, editing,
}: {
  fields: Fields
  setFields: (f: Fields) => void
  bases: Base[]
  iaError: string | null
  saveError: string | null
  file: File | null
  onCancel: () => void
  onSave: () => void
  editing: boolean
}) {
  const set = (k: keyof Fields) => (e: any) => setFields({ ...fields, [k]: e.target.value })

  return (
    <div className="space-y-4">
      {iaError && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{iaError}</span>
        </div>
      )}
      {file && !iaError && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-success text-xs flex gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0" /> <span>Campos rellenados por IA a partir de <b>{file.name}</b>. Revísalos.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Código interno *" value={fields.codigo_interno} onChange={set('codigo_interno')} placeholder="HLACAL_002" mono />
        <Campo label="Número de serie" value={fields.numero_serie} onChange={set('numero_serie')} placeholder="1050655531" mono />
        <Campo label="Marca" value={fields.marca} onChange={set('marca')} placeholder="Stahlwille · Limit · Fluke…" />
        <Campo label="Modelo" value={fields.modelo} onChange={set('modelo')} placeholder="730/20 · 500Auto…" />
        <Campo label="Tipo" value={fields.tipo} onChange={set('tipo')} placeholder="Torquímetro · Multímetro digital…" />
        <Campo label="Rango" value={fields.rango} onChange={set('rango')} placeholder="15-60 Nm · 200mV/2V/20V/200V DC…" />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Ubicación</label>
        <select className="input w-full mt-1" value={fields.ubicacion_base_id} onChange={set('ubicacion_base_id')}>
          <option value="">Logística Central (sin asignar)</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.codigo_iata} — {b.nombre_completo}</option>)}
        </select>
      </div>

      <div className="border-t border-bg-border pt-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
          Calibración {editing && <span className="text-warning">(al guardar se añade como nueva)</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha calibración" value={fields.fecha_calibracion} onChange={set('fecha_calibracion')} type="date" />
          <Campo label="Vence" value={fields.vence_en} onChange={set('vence_en')} type="date" />
          <Campo label="Laboratorio" value={fields.laboratorio} onChange={set('laboratorio')} placeholder="SIEMENS Industrial" />
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Incertidumbre" value={fields.incertidumbre_valor} onChange={set('incertidumbre_valor')} placeholder="0.5" mono />
            <Campo label="Unidad" value={fields.incertidumbre_unidad} onChange={set('incertidumbre_unidad')} placeholder="Nm" mono />
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Notas</label>
        <textarea className="input w-full mt-1 min-h-[60px]" value={fields.notas}
          onChange={set('notas')} placeholder="Observaciones internas" />
      </div>

      {saveError && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
          {saveError}
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-bg-border">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={onSave} disabled={!fields.codigo_interno.trim()}>
          <CheckCircle2 className="w-4 h-4" /> {editing ? 'Guardar cambios' : 'Crear herramienta y generar QR'}
        </button>
      </div>
    </div>
  )
}

function Campo({
  label, value, onChange, placeholder, type = 'text', mono,
}: {
  label: string; value: string; onChange: (e: any) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</label>
      <input
        className={clsx('input w-full mt-1', mono && 'font-mono')}
        type={type} value={value} onChange={onChange} placeholder={placeholder}
      />
    </div>
  )
}

// ============================================================
//  QR preview (inline y modal) — con etiqueta imprimible
//
//  La etiqueta imprimible incluye dentro del recuadro blanco:
//    - Header:  código interno (HLACAL_002)   ← dinámico
//    - QR centrado (protagonista)
//    - Footer:  HLA · ES.145.165              ← fijo, identificador organización
//
//  El texto tiene tamaño proporcional al QR, sin restarle protagonismo.
// ============================================================

const LABEL_ORG_FOOTER = 'HLA · ES.145.165'
const QR_SIZE = 320

async function renderEtiquetaQR(
  canvas: HTMLCanvasElement,
  url: string,
  codigo: string,
  qrSize: number = QR_SIZE,
) {
  // Alturas de zonas — proporcionales al tamaño del QR
  // (QR 320 → header 42, footer 26 · QR 180 → header 26, footer 16)
  const headerH = Math.round(qrSize * 0.13)
  const footerH = Math.round(qrSize * 0.08)
  const pad     = Math.round(qrSize * 0.06)   // margen blanco alrededor
  const w = qrSize + pad * 2
  const h = headerH + qrSize + footerH + pad * 2
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Fondo blanco
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  // 1) QR (usando un canvas temporal a resolución exacta)
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: qrSize,
    color: { dark: '#0a0d14', light: '#ffffff' },
  })
  ctx.drawImage(qrCanvas, pad, pad + headerH)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 2) Header con el código (bold, negro puro, tamaño proporcional al QR)
  const headerFontSize = Math.max(11, Math.round(qrSize * 0.075))   // 24px con QR=320
  ctx.fillStyle = '#000000'
  ctx.font = `bold ${headerFontSize}px Arial, Helvetica, sans-serif`
  ctx.fillText(codigo, w / 2, pad + headerH / 2)

  // 3) Footer con identificador fijo de la organización
  const footerFontSize = Math.max(9, Math.round(qrSize * 0.045))    // ~14px con QR=320
  ctx.fillStyle = '#334155'
  ctx.font = `500 ${footerFontSize}px Arial, Helvetica, sans-serif`
  ctx.fillText(LABEL_ORG_FOOTER, w / 2, pad + headerH + qrSize + footerH / 2)
}

function QrPreviewInline({ slug, codigo }: { slug: string; codigo: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const url = urlPublicaQR(slug)
  useEffect(() => {
    if (!canvasRef.current) return
    renderEtiquetaQR(canvasRef.current, url, codigo, 180).catch(() => {})
  }, [url, codigo])
  return (
    <div className="bg-white p-2 rounded-lg inline-block">
      <canvas ref={canvasRef} />
    </div>
  )
}

function QrPreviewModal({
  slug, label, sn, onClose,
}: {
  slug: string; label: string; sn?: string | null; onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copiado, setCopiado] = useState(false)
  const url = urlPublicaQR(slug)

  useEffect(() => {
    if (!canvasRef.current) return
    renderEtiquetaQR(canvasRef.current, url, label, QR_SIZE).catch(() => {})
  }, [url, label])

  function descargarPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `qr-${label}.png`
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
            <div className="text-xs text-slate-500 font-mono">QR imprimible · pega en la herramienta</div>
            <h3 className="font-display text-xl font-extrabold">{label}</h3>
            {sn && (
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">SN: {sn}</div>
            )}
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-white rounded-lg flex items-center justify-center mb-4 p-2" style={{ minHeight: 400 }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
        </div>
        <div className="surface-elevated p-3 mb-4 font-mono text-xs text-slate-300 break-all">{url}</div>
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
