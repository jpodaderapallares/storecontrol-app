import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import type { Base } from '@/lib/database.types'
import { Save, Plus } from 'lucide-react'

interface ConfMap {
  empresa: { nombre: string; certificado_easa: string; email_admin: string }
  umbrales_cumplimiento: { verde: number; amarillo: number; rojo: number }
  dias_sin_actividad_alerta: number
  recordatorios_antes_escalado: number
  horas_escalado_vencida: number
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
