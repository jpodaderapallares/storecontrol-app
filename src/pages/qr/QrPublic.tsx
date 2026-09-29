// StoreControl · Vista pública del QR (/qr/:slug)
// Comportamiento contextual según usuario:
//   - Sin login (auditor/mecánico): ficha herramienta + acceso al cert PDF
//   - Storekeeper en la base actual: + Enviar / Marcar defectuosa
//   - Storekeeper en la base destino de un tránsito: + Confirmar recepción
//   - Admin: + Editar ficha + Baja + Bloquear
//
// Si el QR NO está vinculado a herramienta (documento suelto histórico),
// se mantiene el comportamiento de redirect al PDF vía qr-redirect.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Loader2, AlertCircle, ShieldCheck, FileText, Building2, Send,
  CheckCircle2, AlertTriangle, LogIn, Wrench, Calendar, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { fmtDate, fmtDateTime } from '@/lib/format'

const FN_REDIRECT = (import.meta.env.VITE_SUPABASE_URL ?? '') + '/functions/v1/qr-redirect'
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? ''

interface Base { id: string; codigo_iata: string; nombre_completo: string }
interface Herr {
  id: string; codigo_interno: string; numero_serie: string | null
  marca: string | null; modelo: string | null; tipo: string | null; rango: string | null
  estado: 'activa'|'en_transito'|'bloqueada'|'baja'
  ubicacion: Base | null
}
interface Calib {
  id: string; fecha_calibracion: string; vence_en: string; laboratorio: string | null
  has_pdf: boolean; incertidumbre: { valor: number | null; unidad: string | null } | null
}
interface Mov {
  id: string; from_base: string | null; from_base_id: string | null
  to_base: string | null; to_base_id: string | null
  enviado_at: string; estado: string; notas: string | null
}
interface QrInfo {
  slug: string
  filename: string | null
  herramienta: Herr | null
  calibracion: Calib | null
  movimiento_activo: Mov | null
}

export default function QrPublic() {
  const { slug } = useParams<{ slug: string }>()
  const { usuario, base: miBase } = useAuth()
  const [info, setInfo] = useState<QrInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (slug) cargar(slug) }, [slug])

  async function cargar(s: string) {
    setLoading(true); setError(null)
    const { data, error } = await supabase.rpc('qr_info_publica', { p_slug: s })
    if (error) { setError(error.message); setLoading(false); return }
    if (!data) {
      // No es una herramienta — fallback al comportamiento original de descarga
      redirigirDocumento(s)
      return
    }
    const parsed = data as QrInfo
    if (!parsed.herramienta) {
      // Documento suelto sin herramienta — fallback
      redirigirDocumento(s)
      return
    }
    setInfo(parsed)
    setLoading(false)
  }

  async function redirigirDocumento(s: string) {
    try {
      const r = await fetch(FN_REDIRECT + '?s=' + encodeURIComponent(s), {
        method: 'GET',
        headers: ANON ? { apikey: ANON, Authorization: 'Bearer ' + ANON } : {},
      })
      const body = await r.json().catch(() => null)
      if (body?.ok && body.signedUrl) {
        window.location.replace(body.signedUrl as string)
        return
      }
      setError(body?.error ?? 'Documento no encontrado')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function abrirCertificado() {
    if (!slug) return
    const r = await fetch(FN_REDIRECT + '?s=' + encodeURIComponent(slug), {
      method: 'GET',
      headers: ANON ? { apikey: ANON, Authorization: 'Bearer ' + ANON } : {},
    })
    const body = await r.json().catch(() => null)
    if (body?.ok && body.signedUrl) window.open(body.signedUrl as string, '_blank')
    else alert(body?.error ?? 'No se pudo abrir el certificado')
  }

  if (loading) return <Pantalla><Loader2 className="w-8 h-8 text-accent animate-spin" /><div className="text-slate-400 text-sm mt-3">Cargando…</div></Pantalla>
  if (error && !info) return <Pantalla><AlertCircle className="w-8 h-8 text-danger" /><div className="text-slate-200 text-sm font-medium mt-3">{error}</div></Pantalla>
  if (!info) return null

  const h = info.herramienta!
  const c = info.calibracion
  const m = info.movimiento_activo

  const soyAdmin = usuario?.rol === 'admin'
  const soyStoreEnBaseActual = usuario?.rol === 'storekeeper' && miBase?.id === h.ubicacion?.base_id
  const soyStoreEnDestino = usuario?.rol === 'storekeeper' && m && m.to_base_id === miBase?.id
  const soyStoreEnOrigen = usuario?.rol === 'storekeeper' && m && m.from_base_id === miBase?.id
  const puedoInteractuar = soyAdmin || soyStoreEnBaseActual || soyStoreEnDestino

  return (
    <div className="min-h-screen bg-bg py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Header />

        {/* Estado destacado */}
        <EstadoBanner herramienta={h} movimiento={m} />

        {/* Ficha herramienta */}
        <div className="surface p-6">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">Herramienta</div>
          <h1 className="font-display text-3xl font-extrabold">{h.codigo_interno}</h1>
          <div className="text-slate-400 mt-1">
            {[h.marca, h.modelo].filter(Boolean).join(' · ')}
            {h.tipo && <span className="text-slate-500"> · {h.tipo}</span>}
          </div>
          {h.rango && (
            <div className="text-xs text-slate-500 font-mono mt-2">{h.rango}</div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-5">
            {h.numero_serie && (
              <Dato label="Número de serie" value={h.numero_serie} mono />
            )}
            <Dato
              label="Ubicación"
              value={h.ubicacion ? (h.ubicacion.codigo_iata + ' — ' + h.ubicacion.nombre_completo) : 'Logística Central'}
            />
          </div>
        </div>

        {/* Certificado — el corazón del QR */}
        {c ? (
          <div className={clsx(
            'surface p-6',
            venceEnDias(c.vence_en) < 0 ? 'border-danger/40 bg-danger/5' :
            venceEnDias(c.vence_en) < 15 ? 'border-warning/40 bg-warning/5' :
            'border-success/30 bg-success/5',
          )}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-danger to-orange-600 grid place-items-center text-white font-bold font-mono flex-shrink-0">
                PDF
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">Certificado de calibración</div>
                <div className={clsx(
                  'font-display text-lg font-bold',
                  venceEnDias(c.vence_en) < 0 ? 'text-danger' :
                  venceEnDias(c.vence_en) < 15 ? 'text-warning' :
                  'text-success',
                )}>
                  {venceEnDias(c.vence_en) < 0
                    ? 'Calibración VENCIDA · No usar la herramienta'
                    : 'Vence: ' + fmtDate(c.vence_en) + ' (' + venceEnDias(c.vence_en) + ' días)'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Última cal.: {fmtDate(c.fecha_calibracion)}
                  {c.laboratorio && <> · {c.laboratorio}</>}
                </div>
                {c.incertidumbre?.valor && (
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    Incertidumbre ±{c.incertidumbre.valor} {c.incertidumbre.unidad ?? ''}
                  </div>
                )}
              </div>
            </div>

            {c.has_pdf && (
              <button className="btn-primary w-full mt-4 justify-center" onClick={abrirCertificado}>
                <FileText className="w-4 h-4" /> Ver certificado PDF
                <ExternalLink className="w-3 h-3 opacity-70" />
              </button>
            )}
          </div>
        ) : (
          <div className="surface p-6 border-warning/40 bg-warning/5">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning" />
              <div>
                <div className="font-medium text-warning">Sin certificado registrado</div>
                <div className="text-xs text-slate-400">La herramienta existe pero no tiene calibración cargada.</div>
              </div>
            </div>
          </div>
        )}

        {/* Acciones según usuario logueado */}
        {!usuario && (
          <div className="surface p-4 text-center">
            <div className="text-xs text-slate-500 mb-2">¿Eres del equipo HLA?</div>
            <Link to="/login" className="btn-secondary inline-flex">
              <LogIn className="w-4 h-4" /> Iniciar sesión para más acciones
            </Link>
          </div>
        )}

        {puedoInteractuar && (
          <AccionesHerramienta
            herramienta={h}
            movimiento={m}
            soyAdmin={soyAdmin}
            soyStoreEnDestino={!!soyStoreEnDestino}
            soyStoreEnOrigen={!!soyStoreEnOrigen}
            onCambio={() => cargar(slug!)}
          />
        )}

        {usuario && !puedoInteractuar && miBase && (
          <div className="surface p-4">
            <div className="text-xs text-slate-500">
              Esta herramienta está en <b className="font-mono">{h.ubicacion?.codigo_iata ?? 'Central'}</b> y
              tú perteneces a <b className="font-mono">{miBase.codigo_iata}</b>. Solo puedes ver los datos.
              Si la tienes físicamente aquí, contacta con Logística Central.
            </div>
          </div>
        )}

        <Footer />
      </div>
    </div>
  )
}

function venceEnDias(iso: string): number {
  const d = new Date(iso).getTime()
  return Math.floor((d - Date.now()) / (24*3600*1000))
}

function Dato({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">{label}</div>
      <div className={clsx('text-sm mt-0.5', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-3 justify-center mb-6">
      <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center">
        <ShieldCheck className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="font-display text-xl font-extrabold leading-none">StoreControl</div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">HLA · ES.145.165</div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div className="text-center text-[10px] text-slate-600 font-mono pt-4 pb-8">
      HLA Maintenance · EASA Part 145 · ES.145.165 · Registro AMC1 145.A.30(e)
    </div>
  )
}

function Pantalla({ children }: { children: any }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="surface max-w-md w-full p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-display text-xl font-extrabold leading-none">StoreControl</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">HLA · ES.145.165</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ============================================================
//  Banner con el estado destacado (activa / en_transito / bloqueada / baja)
// ============================================================
function EstadoBanner({ herramienta: h, movimiento: m }: { herramienta: Herr; movimiento: Mov | null }) {
  if (h.estado === 'baja') {
    return (
      <div className="surface p-4 border-slate-500/40 bg-slate-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-500/30 grid place-items-center">
            <AlertTriangle className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <div className="font-display font-bold text-slate-200">Herramienta dada de baja</div>
            <div className="text-xs text-slate-400">Este activo ya no está en servicio. Solo se muestra el histórico.</div>
          </div>
        </div>
      </div>
    )
  }
  if (h.estado === 'bloqueada') {
    return (
      <div className="surface p-4 border-danger/40 bg-danger/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger/30 grid place-items-center">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div>
            <div className="font-display font-bold text-danger">NO USAR — Herramienta bloqueada</div>
            <div className="text-xs text-slate-400">Calibración vencida o defecto reportado. Enviar a Logística Central.</div>
          </div>
        </div>
      </div>
    )
  }
  if (h.estado === 'en_transito' && m) {
    return (
      <div className="surface p-4 border-cyan-500/40 bg-cyan-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-500/30 grid place-items-center">
            <Send className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-cyan-300">En tránsito</div>
            <div className="text-xs text-slate-400">
              Enviada desde <b className="font-mono text-slate-200">{m.from_base ?? '—'}</b>
              {' → '}
              <b className="font-mono text-slate-200">{m.to_base ?? '—'}</b>
              {' · '}{fmtDateTime(m.enviado_at)}
            </div>
          </div>
        </div>
      </div>
    )
  }
  return null
}

// ============================================================
//  Acciones según rol y estado (Enviar, Recibir, Marcar defectuosa, etc.)
// ============================================================
function AccionesHerramienta({
  herramienta: h, movimiento: m, soyAdmin, soyStoreEnDestino, soyStoreEnOrigen,
  onCambio,
}: {
  herramienta: Herr; movimiento: Mov | null
  soyAdmin: boolean; soyStoreEnDestino: boolean; soyStoreEnOrigen: boolean
  onCambio: () => void
}) {
  const [modalEnviar, setModalEnviar] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmarRecepcion() {
    if (!m) return
    if (!confirm('¿Confirmar recepción en tu base? Se registrará el movimiento como completado.')) return
    setConfirmando(true); setError(null)
    try {
      const { error } = await supabase.rpc('confirmar_recepcion', { p_mov: m.id })
      if (error) throw error
      await logAccion('herramienta_recibida', 'movimientos', m.id, { herramienta_id: h.id })
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setConfirmando(false)
    }
  }

  async function anularEnvio() {
    if (!m) return
    const motivo = prompt('Motivo de anulación (opcional):') ?? ''
    if (!confirm('¿Anular el envío? La herramienta vuelve a estado activa en la base origen.')) return
    setConfirmando(true); setError(null)
    try {
      const { error } = await supabase.rpc('anular_traslado', { p_mov: m.id, p_motivo: motivo || null })
      if (error) throw error
      await logAccion('traslado_anulado', 'movimientos', m.id, { motivo })
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setConfirmando(false)
    }
  }

  async function marcarDefectuosa() {
    const motivo = prompt('Describe el defecto (obligatorio):') ?? ''
    if (!motivo.trim()) return
    if (!confirm('¿Marcar como bloqueada? Aparecerá "NO USAR" en cualquier futuro escaneo.')) return
    setConfirmando(true); setError(null)
    try {
      const { error } = await supabase.from('herramientas')
        .update({ estado: 'bloqueada', notas: motivo })
        .eq('id', h.id)
      if (error) throw error
      await logAccion('herramienta_bloqueada', 'herramientas', h.id, { motivo })
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setConfirmando(false)
    }
  }

  // Vista de recepción destacada
  if (soyStoreEnDestino && m) {
    return (
      <div className="surface p-5 border-success/40 bg-success/5">
        <div className="text-center mb-3">
          <div className="text-[10px] uppercase tracking-wider text-success font-mono">Acción pendiente</div>
          <div className="font-display text-lg font-bold text-success mt-1">Confirmar recepción en tu base</div>
        </div>
        <button className="btn-primary w-full justify-center bg-success hover:bg-success/80" onClick={confirmarRecepcion} disabled={confirmando}>
          {confirmando ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirmando…</> : <><CheckCircle2 className="w-4 h-4" /> Confirmar recepción</>}
        </button>
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      </div>
    )
  }

  return (
    <div className="surface p-5 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-2">Acciones disponibles</div>

      {h.estado === 'activa' && (
        <>
          <button
            className="btn-secondary w-full justify-center"
            onClick={() => setModalEnviar(true)}
            disabled={confirmando}
          >
            <Send className="w-4 h-4" /> Enviar a otra base
          </button>
          <button
            className="btn-ghost w-full justify-center text-danger hover:bg-danger/10"
            onClick={marcarDefectuosa}
            disabled={confirmando}
          >
            <AlertTriangle className="w-4 h-4" /> Marcar defectuosa
          </button>
        </>
      )}

      {h.estado === 'en_transito' && soyStoreEnOrigen && m && (
        <button
          className="btn-ghost w-full justify-center text-warning hover:bg-warning/10"
          onClick={anularEnvio}
          disabled={confirmando}
        >
          Anular envío
        </button>
      )}

      {soyAdmin && (
        <Link
          to={'/herramientas'}
          className="btn-ghost w-full justify-center"
        >
          <Wrench className="w-4 h-4" /> Ver en Herramientas (admin)
        </Link>
      )}

      {error && <div className="text-xs text-danger">{error}</div>}

      {modalEnviar && <ModalEnviar herramienta={h} onClose={() => setModalEnviar(false)} onDone={() => { setModalEnviar(false); onCambio() }} />}
    </div>
  )
}

// ============================================================
//  Modal para elegir base destino y notas
// ============================================================
function ModalEnviar({ herramienta: h, onClose, onDone }: { herramienta: Herr; onClose: () => void; onDone: () => void }) {
  const [bases, setBases] = useState<Base[]>([])
  const [destino, setDestino] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bases').select('id, codigo_iata, nombre_completo').eq('activo', true).order('codigo_iata')
      setBases((data ?? []).filter(b => b.id !== h.ubicacion?.base_id))
    })()
  }, [h.ubicacion?.base_id])

  async function enviar() {
    if (!destino) { setError('Selecciona base destino'); return }
    setEnviando(true); setError(null)
    try {
      const { error } = await supabase.rpc('iniciar_traslado', {
        p_herramienta: h.id, p_to_base: destino, p_notas: notas || null,
      })
      if (error) throw error
      const dest = bases.find(b => b.id === destino)
      await logAccion('traslado_iniciado', 'herramientas', h.id, {
        codigo: h.codigo_interno, from: h.ubicacion?.codigo_iata ?? 'Central', to: dest?.codigo_iata,
      })
      onDone()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-accent grid place-items-center text-white">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display text-xl font-extrabold">Enviar {h.codigo_interno}</div>
            <div className="text-xs text-slate-500 font-mono">Desde {h.ubicacion?.codigo_iata ?? 'Central'}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Base destino *</label>
            <select className="input w-full mt-1" value={destino} onChange={e => setDestino(e.target.value)}>
              <option value="">Elige una base…</option>
              {bases.map(b => <option key={b.id} value={b.id}>{b.codigo_iata} — {b.nombre_completo}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Notas (opcional)</label>
            <textarea
              className="input w-full mt-1 min-h-[60px]"
              placeholder="Ej: envío semanal, sustituye a T-092…"
              value={notas} onChange={e => setNotas(e.target.value)}
            />
          </div>
          {error && <div className="p-2 bg-danger/10 border border-danger/30 text-danger text-xs rounded">{error}</div>}
          <div className="text-xs text-slate-500 leading-relaxed">
            La herramienta pasa a <b className="text-cyan-300">en tránsito</b>. Cuando el storekeeper
            de la base destino la reciba, escaneará este QR y confirmará la recepción.
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-bg-border">
            <button className="btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
            <button className="btn-primary" onClick={enviar} disabled={enviando || !destino}>
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Send className="w-4 h-4" /> Iniciar envío</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
