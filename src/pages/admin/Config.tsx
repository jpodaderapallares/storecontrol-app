import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import type { Base } from '@/lib/database.types'
import { Save, Plus } from 'lucide-react'

type TipoNotif = 'recordatorio_24h' | 'recordatorio_hoy' | 'vencida_24h' | 'escalado_admin'
type Frecuencia = 'diaria' | 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'

interface MatrizNotif {
  recordatorio_24h: Record<Frecuencia, boolean>
  recordatorio_hoy: Record<Frecuencia, boolean>
  vencida_24h: Record<Frecuencia, boolean>
  escalado_admin: Record<Frecuencia, boolean>
}

const TIPOS: { key: TipoNotif; label: string; descripcion: string }[] = [
  { key: 'recordatorio_24h', label: 'Recordatorio 24h antes', descripcion: 'Aviso al storekeeper 24h antes del vencimiento' },
  { key: 'recordatorio_hoy', label: 'Recordatorio mismo día',  descripcion: 'Aviso al storekeeper en las 4h previas al vencimiento' },
  { key: 'vencida_24h',      label: 'Tarea vencida (24h)',     descripcion: '24h después sin completar — storekeeper + CC admin' },
  { key: 'escalado_admin',   label: 'Escalado admin (48h)',    descripcion: '48h después sin completar — solo admin' },
]
const FRECUENCIAS: Frecuencia[] = ['diaria','semanal','mensual','trimestral','semestral','anual']

function matrizDefault(): MatrizNotif {
  const allOn = Object.fromEntries(FRECUENCIAS.map(f => [f, true])) as Record<Frecuencia, boolean>
  return {
    recordatorio_24h: { ...allOn, diaria: false }, // sin spam para diarias
    recordatorio_hoy: { ...allOn },
    vencida_24h:      { ...allOn },
    escalado_admin:   { ...allOn },
  }
}

interface ConfMap {
  empresa: { nombre: string; certificado_easa: string; email_admin: string }
  umbrales_cumplimiento: { verde: number; amarillo: number; rojo: number }
  dias_sin_actividad_alerta: number
  recordatorios_antes_escalado: number
  horas_escalado_vencida: number
  notificaciones_matriz: MatrizNotif
}

export default function Config() {
  const [conf, setConf] = useState<ConfMap | null>(null)
  const [bases, setBases] = useState<Base[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])
  async function cargar() {
    const { data } = await supabase.from('configuracion').select('*')
    const map: any = {}
    for (const r of data ?? []) map[r.clave] = r.valor
    // Si no existe la matriz aún (config legacy), aplicar default
    if (!map.notificaciones_matriz) map.notificaciones_matriz = matrizDefault()
    setConf(map)
    const { data: b } = await supabase.from('bases').select('*').order('codigo_iata')
    setBases(b ?? [])
  }

  async function guardar() {
    if (!conf) return
    setGuardando(true)
    for (const [clave, valor] of Object.entries(conf)) {
      await supabase.from('configuracion').upsert({ clave, valor })
    }
    await logAccion('config_actualizada', 'configuracion', undefined, conf)
    setGuardando(false)
  }

  if (!conf) return <div className="text-slate-500 text-sm">Cargando…</div>

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Parámetros globales del sistema"
        actions={
          <button className="btn-primary" onClick={guardar} disabled={guardando}>
            <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-6">
        <div className="surface p-6">
          <h3 className="font-display text-lg font-bold mb-4">Datos de la empresa</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input w-full mt-1" value={conf.empresa.nombre}
                onChange={e => setConf({ ...conf, empresa: { ...conf.empresa, nombre: e.target.value } })} />
            </div>
            <div>
              <label className="label">Certificado EASA Part 145</label>
              <input className="input w-full mt-1 font-mono" value={conf.empresa.certificado_easa}
                onChange={e => setConf({ ...conf, empresa: { ...conf.empresa, certificado_easa: e.target.value } })} />
            </div>
            <div>
              <label className="label">Email admin (escalado)</label>
              <input className="input w-full mt-1" value={conf.empresa.email_admin}
                onChange={e => setConf({ ...conf, empresa: { ...conf.empresa, email_admin: e.target.value } })} />
            </div>
          </div>
        </div>

        <div className="surface p-6">
          <h3 className="font-display text-lg font-bold mb-4">Umbrales de cumplimiento</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label text-success">Verde ≥</label>
                <input type="number" className="input w-full mt-1 font-mono" value={conf.umbrales_cumplimiento.verde}
                  onChange={e => setConf({ ...conf, umbrales_cumplimiento: { ...conf.umbrales_cumplimiento, verde: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="label text-warning">Amarillo ≥</label>
                <input type="number" className="input w-full mt-1 font-mono" value={conf.umbrales_cumplimiento.amarillo}
                  onChange={e => setConf({ ...conf, umbrales_cumplimiento: { ...conf.umbrales_cumplimiento, amarillo: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="label text-danger">Rojo &lt;</label>
                <input type="number" className="input w-full mt-1 font-mono" value={conf.umbrales_cumplimiento.amarillo}
                  readOnly />
              </div>
            </div>
            <div>
              <label className="label">Días sin actividad para alerta</label>
              <input type="number" className="input w-full mt-1 font-mono" value={conf.dias_sin_actividad_alerta}
                onChange={e => setConf({ ...conf, dias_sin_actividad_alerta: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Recordatorios antes de escalar</label>
              <input type="number" className="input w-full mt-1 font-mono" value={conf.recordatorios_antes_escalado}
                onChange={e => setConf({ ...conf, recordatorios_antes_escalado: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Horas desde vencimiento para escalado urgente</label>
              <input type="number" className="input w-full mt-1 font-mono" value={conf.horas_escalado_vencida}
                onChange={e => setConf({ ...conf, horas_escalado_vencida: Number(e.target.value) })} />
            </div>
          </div>
        </div>

        <div className="surface p-6 col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-lg font-bold">Frecuencia de notificaciones</h3>
            <button
              className="btn-ghost text-xs"
              onClick={() => setConf({ ...conf, notificaciones_matriz: matrizDefault() })}
            >
              Restaurar por defecto
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Activa o desactiva cada combinación tipo de aviso × frecuencia de tarea.
            Las desactivadas no se enviarán por email.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400 uppercase">
                <tr>
                  <th className="text-left py-2 pr-4">Tipo de aviso</th>
                  {FRECUENCIAS.map(f => (
                    <th key={f} className="text-center py-2 px-2 capitalize font-mono">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIPOS.map(({ key, label, descripcion }) => (
                  <tr key={key} className="border-t border-bg-border">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-slate-500">{descripcion}</div>
                    </td>
                    {FRECUENCIAS.map(f => {
                      const checked = conf.notificaciones_matriz?.[key]?.[f] ?? true
                      return (
                        <td key={f} className="text-center py-2 px-2">
                          <button
                            onClick={() => setConf({
                              ...conf,
                              notificaciones_matriz: {
                                ...conf.notificaciones_matriz,
                                [key]: { ...conf.notificaciones_matriz[key], [f]: !checked },
                              },
                            })}
                            className={[
                              'w-9 h-5 rounded-full transition-colors relative inline-block',
                              checked ? 'bg-accent' : 'bg-bg-border',
                            ].join(' ')}
                            title={checked ? 'Activado' : 'Desactivado'}
                          >
                            <span className={[
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                              checked ? 'translate-x-4' : 'translate-x-0.5',
                            ].join(' ')} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface p-6 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold">Bases · zonas horarias</h3>
            <button className="btn-secondary" disabled title="Añadir base (TODO)">
              <Plus className="w-4 h-4" /> Añadir base
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase">
              <tr>
                <th className="text-left py-2">Código IATA</th>
                <th className="text-left py-2">Nombre</th>
                <th className="text-left py-2">País</th>
                <th className="text-left py-2">Zona horaria</th>
                <th className="text-left py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {bases.map(b => (
                <tr key={b.id} className="border-t border-bg-border">
                  <td className="py-2 iata">{b.codigo_iata}</td>
                  <td className="py-2">{b.nombre_completo}</td>
                  <td className="py-2 font-mono text-xs">{b.pais}</td>
                  <td className="py-2 font-mono text-xs text-slate-400">{b.zona_horaria}</td>
                  <td className="py-2">
                    <span className={b.activo ? 'pill-done' : 'pill-pend'}>
                      {b.activo ? 'activa' : 'inactiva'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
