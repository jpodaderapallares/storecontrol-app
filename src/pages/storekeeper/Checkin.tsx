// StoreControl · Check-in semanal
// El storekeeper firma 1 vez/semana que todo está en orden en su base.
// Reemplaza las tareas diarias repetitivas (F005, U/S Area, caducidades, etc.)
// Si algo NO está bien, marca la excepción y explica en observaciones.
// La firma queda en check_ins_semanales + audit_log inmutable.

import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, CheckCircle2, AlertCircle, Loader2, Sparkles, Calendar,
  FileText, Info, ArrowLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import { fmtDateTime } from '@/lib/format'

// Definición canónica de los ítems del check-in.
// Si mañana añades/quitas ítems, guarda su clave/estado por historial.
const CHECKIN_ITEMS = [
  {
    clave: 'f005',
    label: 'F005 · Temperatura y humedad dentro de rango toda la semana',
    ayuda: 'Consulta el registro F005. Todos los días 15-30°C y 30-60% HR.',
  },
  {
    clave: 'caducidades',
    label: 'Control de caducidades · sin materiales vencidos ni próximos',
    ayuda: 'Revisa sellantes, consumibles y precintados. Todo dentro de vigencia.',
  },
  {
    clave: 'us_area',
    label: 'U/S Area · limpia, ordenada e identificada correctamente',
    ayuda: 'Zona unserviceable delimitada, sin herramientas mezcladas con material bueno.',
  },
  {
    clave: 'inventario_ciclico',
    label: 'Inventario cíclico semanal · sin discrepancias',
    ayuda: 'Recuento del lote asignado a esta semana. Coincide con el sistema.',
  },
  {
    clave: 'toolboxes',
    label: 'Toolboxes · precintos íntegros y calibraciones vigentes',
    ayuda: 'Inspección visual, no reinventario completo. Precintos + fecha próxima cal.',
  },
  {
    clave: 'incidencias',
    label: 'Sin incidencias de material/herramienta que reportar',
    ayuda: 'Herramientas dañadas, pérdidas, robos, o cualquier evento anómalo.',
  },
] as const

type ItemEstado = null | 'ok' | 'ko'

interface CheckInRow {
  id: string
  base_id: string
  semana_iso: string
  fecha_firmado: string
  firmado_por_nombre: string
  items: Array<{ clave: string; label: string; ok: boolean; observaciones?: string }>
  todo_ok: boolean
  notas: string | null
}

// Devuelve "2026-W40" en zona horaria Europe/Madrid (aprox — cliente usa local)
function semanaISO(d: Date = new Date()): string {
  // ISO week: jueves de la semana marca el año
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0')
}

async function hashContenido(items: any, notas: string): Promise<string> {
  const enc = new TextEncoder().encode(JSON.stringify({ items, notas: notas.trim() }))
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function CheckinSemanal() {
  const { usuario, base } = useAuth()
  const [semana, setSemana] = useState<string>('')
  const [firmaActual, setFirmaActual] = useState<CheckInRow | null>(null)
  const [historial, setHistorial] = useState<CheckInRow[]>([])
  const [loading, setLoading] = useState(true)
  const [estados, setEstados] = useState<Record<string, ItemEstado>>({})
  const [obs, setObs] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSemana(semanaISO())
    if (base?.id) cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id])

  async function cargar() {
    setLoading(true)
    setError(null)
    const semAct = semanaISO()
    const { data, error } = await supabase
      .from('check_ins_semanales')
      .select('*')
      .eq('base_id', base!.id)
      .order('semana_iso', { ascending: false })
      .limit(20)
    if (error) { setError(error.message); setLoading(false); return }
    const rows = (data ?? []) as CheckInRow[]
    const actual = rows.find(r => r.semana_iso === semAct) ?? null
    setFirmaActual(actual)
    setHistorial(rows.filter(r => r.semana_iso !== semAct))
    setLoading(false)
  }

  const todosMarcados = useMemo(
    () => CHECKIN_ITEMS.every(it => estados[it.clave] === 'ok' || estados[it.clave] === 'ko'),
    [estados],
  )
  const hayExcepciones = useMemo(
    () => CHECKIN_ITEMS.some(it => estados[it.clave] === 'ko'),
    [estados],
  )
  const excepcionesSinObs = useMemo(
    () => CHECKIN_ITEMS.some(it => estados[it.clave] === 'ko' && !(obs[it.clave] ?? '').trim()),
    [estados, obs],
  )

  async function firmar() {
    if (!usuario || !base) return
    if (!todosMarcados) { setError('Marca cada ítem como OK o excepción antes de firmar.'); return }
    if (excepcionesSinObs) { setError('Las excepciones (KO) necesitan una observación breve.'); return }
    setGuardando(true)
    setError(null)
    try {
      const items = CHECKIN_ITEMS.map(it => ({
        clave: it.clave,
        label: it.label,
        ok: estados[it.clave] === 'ok',
        observaciones: estados[it.clave] === 'ko' ? (obs[it.clave] ?? '').trim() : undefined,
      }))
      const todoOk = !hayExcepciones
      const hash = await hashContenido(items, notas)
      const { error } = await supabase.from('check_ins_semanales').insert({
        base_id: base.id,
        semana_iso: semana,
        firmado_por: usuario.id,
        firmado_por_nombre: usuario.nombre,
        items,
        todo_ok: todoOk,
        notas: notas.trim() || null,
        hash_firma: hash,
      })
      if (error) throw error
      await logAccion('checkin_semanal_firmado', 'check_ins_semanales', undefined, {
        base_id: base.id, semana_iso: semana, todo_ok: todoOk, excepciones: items.filter(i => !i.ok).length,
      })
      await cargar()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setGuardando(false)
    }
  }

  if (!base) return <div className="text-slate-500 text-sm">Cargando…</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in semanal"
        subtitle={'Firma que todo está en orden en tu base esta semana · ' + semana}
        actions={
          <Link to={`/base/${base.codigo_iata}`} className="btn-ghost">
            <ArrowLeft className="w-4 h-4" /> Volver a inicio
          </Link>
        }
      />

      {loading && (
        <div className="surface p-8 text-center text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Cargando…
        </div>
      )}

      {!loading && firmaActual && (
        <FirmadoResumen row={firmaActual} />
      )}

      {!loading && !firmaActual && (
        <FormularioFirmar
          items={CHECKIN_ITEMS}
          estados={estados}
          setEstados={setEstados}
          obs={obs}
          setObs={setObs}
          notas={notas}
          setNotas={setNotas}
          error={error}
          guardando={guardando}
          onFirmar={firmar}
          semana={semana}
          hayExcepciones={hayExcepciones}
          todosMarcados={todosMarcados}
        />
      )}

      {historial.length > 0 && (
        <div className="surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h3 className="font-display text-lg font-bold">Semanas anteriores</h3>
            <span className="text-xs text-slate-500 font-mono">últimos {historial.length}</span>
          </div>
          <div className="space-y-2">
            {historial.map(r => <HistItem key={r.id} row={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
function FormularioFirmar({
  items, estados, setEstados, obs, setObs, notas, setNotas,
  error, guardando, onFirmar, semana, hayExcepciones, todosMarcados,
}: any) {
  return (
    <div className="surface p-5 space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          Marca cada ítem como <b className="text-success">OK</b> si esta semana ha sido correcto,
          o <b className="text-danger">Excepción</b> si hay algo que reportar. Los ítems marcados
          como excepción requieren una observación breve. Al firmar quedará constancia inmutable
          en el registro de auditoría (semana <span className="font-mono">{semana}</span>).
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it: any) => (
          <ItemFirma
            key={it.clave}
            item={it}
            estado={estados[it.clave] ?? null}
            observacion={obs[it.clave] ?? ''}
            onEstado={(e) => setEstados({ ...estados, [it.clave]: e })}
            onObservacion={(v) => setObs({ ...obs, [it.clave]: v })}
          />
        ))}
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          Notas generales de la semana <span className="text-slate-600">(opcional)</span>
        </label>
        <textarea
          className="input w-full mt-1 min-h-[70px]"
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Cualquier información adicional para el jefe de logística"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t border-bg-border">
        <div className="text-xs text-slate-500">
          {todosMarcados ? (
            hayExcepciones
              ? <span className="text-warning">⚠ Firmarás con excepciones</span>
              : <span className="text-success">✓ Todo en orden</span>
          ) : <span>Marca todos los ítems para firmar</span>}
        </div>
        <button
          className="btn-primary"
          onClick={onFirmar}
          disabled={!todosMarcados || guardando}
        >
          {guardando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Firmando…</>
            : <><ClipboardCheck className="w-4 h-4" /> Firmar check-in semanal</>
          }
        </button>
      </div>
    </div>
  )
}

function ItemFirma({
  item, estado, observacion, onEstado, onObservacion,
}: {
  item: { clave: string; label: string; ayuda?: string }
  estado: ItemEstado
  observacion: string
  onEstado: (e: ItemEstado) => void
  onObservacion: (v: string) => void
}) {
  return (
    <div className={clsx(
      'p-3 rounded-lg border transition-colors',
      estado === 'ok' && 'bg-success/5 border-success/30',
      estado === 'ko' && 'bg-danger/5 border-danger/30',
      !estado && 'bg-bg-elevated border-bg-border',
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{item.label}</div>
          {item.ayuda && (
            <div className="text-[11px] text-slate-500 mt-1">{item.ayuda}</div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onEstado(estado === 'ok' ? null : 'ok')}
            className={clsx(
              'px-3 py-1 rounded text-xs font-semibold transition-colors',
              estado === 'ok'
                ? 'bg-success text-white'
                : 'bg-bg-surface border border-bg-border text-slate-400 hover:text-success hover:border-success/40',
            )}
          >OK</button>
          <button
            type="button"
            onClick={() => onEstado(estado === 'ko' ? null : 'ko')}
            className={clsx(
              'px-3 py-1 rounded text-xs font-semibold transition-colors',
              estado === 'ko'
                ? 'bg-danger text-white'
                : 'bg-bg-surface border border-bg-border text-slate-400 hover:text-danger hover:border-danger/40',
            )}
          >Excepción</button>
        </div>
      </div>
      {estado === 'ko' && (
        <textarea
          className="input w-full mt-2 min-h-[50px] text-xs"
          placeholder="Describe la excepción (obligatorio)…"
          value={observacion}
          onChange={e => onObservacion(e.target.value)}
        />
      )}
    </div>
  )
}

function FirmadoResumen({ row }: { row: CheckInRow }) {
  const excep = row.items.filter(i => !i.ok)
  return (
    <div className="surface p-5 border-success/40 bg-success/5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-success/20 grid place-items-center flex-shrink-0">
          <CheckCircle2 className="w-6 h-6 text-success" />
        </div>
        <div className="flex-1">
          <div className="font-display text-xl font-extrabold text-success">
            Check-in de la semana firmado
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Firmado por <b className="text-slate-200">{row.firmado_por_nombre}</b> · {fmtDateTime(row.fecha_firmado)}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            Semana <b>{row.semana_iso}</b> · {row.todo_ok ? 'todo OK' : (excep.length + ' excepciones')}
          </div>
        </div>
      </div>

      {excep.length > 0 && (
        <div className="mt-3 pt-3 border-t border-bg-border">
          <div className="text-xs text-warning uppercase tracking-wider font-semibold mb-2">
            Excepciones reportadas
          </div>
          <div className="space-y-2">
            {excep.map((it, i) => (
              <div key={i} className="text-xs bg-warning/5 border border-warning/30 rounded-lg p-2">
                <div className="font-medium text-slate-200">{it.label}</div>
                {it.observaciones && (
                  <div className="text-slate-400 mt-1 italic">{it.observaciones}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {row.notas && (
        <div className="mt-3 pt-3 border-t border-bg-border">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">Notas</div>
          <div className="text-sm text-slate-300">{row.notas}</div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-bg-border text-[11px] text-slate-500 font-mono flex items-center gap-2">
        <FileText className="w-3 h-3" />
        Hash de firma disponible en auditoría · registro inmutable
      </div>
    </div>
  )
}

function HistItem({ row }: { row: CheckInRow }) {
  const excep = row.items.filter(i => !i.ok).length
  return (
    <div className="flex items-center gap-3 py-2 border-b border-bg-border last:border-b-0">
      <div className={clsx(
        'w-2 h-2 rounded-full',
        row.todo_ok ? 'bg-success' : 'bg-warning',
      )} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-mono">{row.semana_iso}</div>
        <div className="text-[11px] text-slate-500">
          {row.firmado_por_nombre} · {fmtDateTime(row.fecha_firmado)}
        </div>
      </div>
      <div className="text-xs">
        {row.todo_ok
          ? <span className="text-success">✓ Todo OK</span>
          : <span className="text-warning">{excep} excepciones</span>
        }
      </div>
    </div>
  )
}
