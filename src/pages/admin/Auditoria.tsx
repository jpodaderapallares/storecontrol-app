import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Download, Search, ShieldCheck } from 'lucide-react'
import { fmtDateTime } from '@/lib/format'
import type { AuditEvento, Base, Usuario } from '@/lib/database.types'

export default function Auditoria() {
  const [eventos, setEventos] = useState<(AuditEvento & { usuarios?: Usuario; bases?: Base })[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => { cargarMeta() }, [])
  useEffect(() => { cargar() }, [filtroUsuario, filtroBase, filtroAccion, desde, hasta])

  async function cargarMeta() {
    const [u, b] = await Promise.all([
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('bases').select('*').order('codigo_iata'),
    ])
    setUsuarios(u.data ?? []); setBases(b.data ?? [])
  }

  async function cargar() {
    let q2 = supabase.from('audit_log').select('*, usuarios(nombre, email, rol), bases(codigo_iata)').order('timestamp', { ascending: false }).limit(500)
    if (filtroUsuario) q2 = q2.eq('usuario_id', filtroUsuario)
    if (filtroBase) q2 = q2.eq('base_id', filtroBase)
    if (filtroAccion) q2 = q2.eq('accion', filtroAccion)
    if (desde) q2 = q2.gte('timestamp', desde)
    if (hasta) q2 = q2.lte('timestamp', hasta + 'T23:59:59')
    const { data } = await q2
    setEventos(data as any ?? [])
  }

  const filtrados = eventos.filter(e =>
    !q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase()),
  )

  function exportarCsv() {
    const rows = [
      ['timestamp', 'usuario', 'rol', 'accion', 'entidad', 'base', 'metadata'],
      ...filtrados.map(e => [
        e.timestamp, (e as any).usuarios?.nombre ?? '—', (e as any).usuarios?.rol ?? '—',
        e.accion, e.entidad ?? '', (e as any).bases?.codigo_iata ?? '',
        JSON.stringify(e.metadata_json ?? {}),
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const acciones = Array.from(new Set(eventos.map(e => e.accion))).sort()

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle="Registro inmutable de acciones (AMC1 145.A.30(e) — defensa EASA)"
        actions={
          <button className="btn-primary" onClick={exportarCsv}>
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        }
      />

      <div className="surface p-3 mb-4 flex items-center gap-2 text-xs border-l-4 border-accent">
        <ShieldCheck className="w-4 h-4 text-accent" />
        <span className="text-slate-300">
          Los registros de este log son <strong>inmutables</strong> (solo INSERT). Cumplimiento
          documental <span className="font-mono">AMC1 145.A.30(e)</span> · utilizable ante inspecciones EASA.
        </span>
      </div>

      <div className="surface p-3 mb-4 grid grid-cols-6 gap-2">
        <select className="input" value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select className="input" value={filtroBase} onChange={e => setFiltroBase(e.target.value)}>
          <option value="">Todas las bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.codigo_iata}</option>)}
        </select>
        <select className="input" value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)}>
          <option value="">Todas las acciones</option>
          {acciones.map(a => <option key={a}>{a}</option>)}
        </select>
        <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} />
        <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input w-full pl-9" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead className="bg-bg-elevated text-slate-400 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Timestamp</th>
              <th className="px-3 py-2 text-left">Usuario</th>
              <th className="px-3 py-2 text-left">Acción</th>
              <th className="px-3 py-2 text-left">Entidad</th>
              <th className="px-3 py-2 text-left">Base</th>
              <th className="px-3 py-2 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {filtrados.map(e => (
              <tr key={e.id} className="row-hover">
                <td className="px-3 py-2 text-slate-400">{fmtDateTime(e.timestamp)}</td>
                <td className="px-3 py-2">{(e as any).usuarios?.nombre ?? '—'}</td>
                <td className="px-3 py-2 text-accent">{e.accion}</td>
                <td className="px-3 py-2 text-slate-400">{e.entidad ?? '—'}</td>
                <td className="px-3 py-2">{(e as any).bases?.codigo_iata ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400 max-w-md truncate">
                  {e.metadata_json ? JSON.stringify(e.metadata_json) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">Sin eventos en este filtro.</div>
        )}
      </div>
    </>
  )
}
