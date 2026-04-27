import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Plus, UserCog, Mail } from 'lucide-react'
import { fmtDateTime, fmtRelativa } from '@/lib/format'
import type { Usuario, Base, RolUsuario } from '@/lib/database.types'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<(Usuario & { bases?: Base })[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [form, setForm] = useState<Usuario | null>(null)
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [u, b] = await Promise.all([
      supabase.from('usuarios').select('*, bases(codigo_iata, nombre_completo)').order('nombre'),
      supabase.from('bases').select('*').order('codigo_iata'),
    ])
    setUsuarios(u.data as any ?? [])
    setBases(b.data ?? [])
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Storekeepers y administradores"
        actions={
          <button className="btn-primary" onClick={() => { setForm(null); setMostrar(true) }}>
            <Plus className="w-4 h-4" /> Nuevo usuario
          </button>
        }
      />

      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Rol</th>
              <th className="px-4 py-3 text-left">Base</th>
              <th className="px-4 py-3 text-left">Último acceso</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {usuarios.map(u => (
              <tr key={u.id} className="row-hover">
                <td className="px-4 py-3 font-medium">{u.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={u.rol === 'admin' ? 'pill bg-accent/15 text-accent border border-accent/30' : 'pill bg-bg-elevated border border-bg-border text-slate-300'}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.bases ? <span className="iata">{(u.bases as any).codigo_iata}</span> : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                  {u.ultimo_login ? fmtRelativa(u.ultimo_login) : 'Nunca'}
                </td>
                <td className="px-4 py-3">
                  <span className={u.activo ? 'pill-done' : 'pill-pend'}>
                    {u.activo ? 'activo' : 'inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="btn-ghost" onClick={() => { setForm(u); setMostrar(true) }}>
                    <UserCog className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrar && (
        <FormUsuario
          usuario={form}
          bases={bases}
          onClose={() => { setMostrar(false); cargar() }}
        />
      )}
    </>
  )
}

function FormUsuario({ usuario, bases, onClose }: { usuario: Usuario | null; bases: Base[]; onClose: () => void }) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<RolUsuario>(usuario?.rol ?? 'storekeeper')
  const [baseId, setBaseId] = useState(usuario?.base_id ?? '')
  const [activo, setActivo] = useState(usuario?.activo ?? true)
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    if (!nombre.trim() || !email.trim()) {
      setError('Nombre y email son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      if (usuario) {
        const { error: errUpd } = await supabase.from('usuarios').update({
          nombre, rol, base_id: baseId || null, activo,
        }).eq('id', usuario.id)
        if (errUpd) throw errUpd
        await logAccion('usuario_modificado', 'usuarios', usuario.id, { nombre, rol })
      } else {
        if (!password || password.length < 6) {
          throw new Error('La contraseña temporal debe tener al menos 6 caracteres.')
        }
        // Llamada a la Edge Function crear-usuario (service role + Resend)
        const { data, error: errFn } = await supabase.functions.invoke('crear-usuario', {
          body: {
            nombre: nombre.trim(),
            email: email.trim().toLowerCase(),
            rol,
            base_id: rol === 'storekeeper' ? (baseId || null) : null,
            password,
          },
        })
        if (errFn) throw errFn
        if (data && data.ok === false) throw new Error(data.error ?? 'Error al crear usuario')
      }
      setGuardando(false)
      onClose()
    } catch (e: any) {
      setGuardando(false)
      const msg = e?.message ?? String(e)
      setError(msg)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="surface p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {usuario ? 'Editar usuario' : 'Nuevo usuario'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input w-full mt-1" value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input w-full mt-1" value={email} onChange={e => setEmail(e.target.value)} disabled={!!usuario} />
          </div>
          {!usuario && (
            <div>
              <label className="label">Contraseña temporal</label>
              <input className="input w-full mt-1" value={password} onChange={e => setPassword(e.target.value)} />
              <div className="text-xs text-slate-500 mt-1 font-mono">
                <Mail className="w-3 h-3 inline" /> Se enviará por email con Resend
              </div>
            </div>
          )}
          <div>
            <label className="label">Rol</label>
            <select className="input w-full mt-1" value={rol} onChange={e => setRol(e.target.value as RolUsuario)}>
              <option value="storekeeper">Storekeeper</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {rol === 'storekeeper' && (
            <div>
              <label className="label">Base asignada</label>
              <select className="input w-full mt-1" value={baseId} onChange={e => setBaseId(e.target.value)}>
                <option value="">—</option>
                {bases.map(b => (
                  <option key={b.id} value={b.id}>{b.codigo_iata} — {b.nombre_completo}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            <span className="text-sm">Activo</span>
          </label>
        </div>
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-bg-border">
          <button className="btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? (usuario ? 'Guardando…' : 'Creando usuario…') : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
