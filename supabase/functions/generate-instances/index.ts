// Supabase Edge Function · generate-instances
// Rueda diariamente a las 00:10 UTC para garantizar que siempre haya
// instancias futuras de todas las plantillas activas en los próximos 60 días.
// Llama a la función SQL public.generar_instancias_proximas(60).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async () => {
  try {
    const { data, error } = await sb.rpc('generar_instancias_proximas', { dias_adelante: 60 })
    if (error) throw error
    const resumen = (data ?? []) as Array<{ out_plantilla_id: string; out_instancias_creadas: number }>
    const total = resumen.reduce((a, r) => a + (r.out_instancias_creadas ?? 0), 0)
    return new Response(JSON.stringify({ ok: true, creadas: total, detalle: resumen }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
