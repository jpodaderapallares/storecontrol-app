import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // No romper en dev para que se pueda ver la UI; las llamadas fallarán con mensaje claro.
  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  StoreControl: faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env'
  )
}

export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Helper: registrar acción en audit_log
export async function logAccion(accion: string, entidad?: string, entidad_id?: string, metadata?: any) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: u } = await supabase.from('usuarios').select('base_id').eq('id', user?.id ?? '').maybeSingle()
  await supabase.from('audit_log').insert({
    usuario_id: user?.id,
    accion,
    entidad,
    entidad_id,
    base_id: u?.base_id,
    metadata_json: metadata,
  })
}
