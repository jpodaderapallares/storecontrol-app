import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Usuario, Base } from '@/lib/database.types'

interface AuthState {
  usuario: Usuario | null
  base: Base | null
  cargando: boolean
  inicializar: () => Promise<void>
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  usuario: null,
  base: null,
  cargando: true,

  inicializar: async () => {
    set({ cargando: true })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { set({ usuario: null, base: null, cargando: false }); return }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    let base: Base | null = null
    if (usuario?.base_id) {
      const { data: b } = await supabase
        .from('bases').select('*').eq('id', usuario.base_id).maybeSingle()
      base = b ?? null
    }
    set({ usuario: usuario as Usuario | null, base, cargando: false })
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_log').insert({
        usuario_id: user.id,
        accion: 'login',
        entidad: 'usuarios',
        entidad_id: user.id,
      })
      await supabase.from('usuarios').update({ ultimo_login: new Date().toISOString() }).eq('id', user.id)
    }
    await useAuth.getState().inicializar()
    return {}
  },

  logout: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_log').insert({
        usuario_id: user.id, accion: 'logout', entidad: 'usuarios', entidad_id: user.id,
      })
    }
    await supabase.auth.signOut()
    set({ usuario: null, base: null })
  },
}))

supabase.auth.onAuthStateChange(() => {
  useAuth.getState().inicializar()
})
