// Supabase Edge Function · purge-qr-trash
// Diariamente a las 02:30 UTC: borra del bucket tooling_qr los objetos cuyas
// filas en documentos_qr están en papelera (deleted_at) desde hace más de 30
// días, y luego elimina las filas.
//
// Usa service_role: el SQL público no puede DELETE de storage.objects (lo
// bloquea el trigger storage.protect_delete()).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BUCKET = 'tooling_qr'

Deno.serve(async () => {
  try {
    // 1) Lista de candidatos
    const { data: rows, error: listErr } = await sb.rpc('listar_qr_para_purgar')
    if (listErr) throw listErr
    const filas = (rows ?? []) as Array<{ id: string; storage_path: string; qr_path: string | null }>

    if (filas.length === 0) {
      return resp({ ok: true, borrados: 0, detalle: 'sin candidatos' })
    }

    // 2) Recolectar TODOS los paths (doc + qr opcional) y borrar en lote del bucket
    const paths = filas.flatMap(r =>
      r.qr_path ? [r.storage_path, r.qr_path] : [r.storage_path],
    )

    const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths)
    // Si falla la limpieza del storage, NO borramos las filas (reintentar mañana).
    if (rmErr) {
      return resp({ ok: false, error: `storage_remove: ${rmErr.message}`, paths }, 500)
    }

    // 3) Borrar las filas
    const ids = filas.map(r => r.id)
    const { error: delErr } = await sb.from('documentos_qr').delete().in('id', ids)
    if (delErr) {
      return resp(
        { ok: false, error: `db_delete: ${delErr.message}`, storage_cleaned: paths.length },
        500,
      )
    }

    return resp({
      ok: true,
      borrados: ids.length,
      objetos_storage: paths.length,
    })
  } catch (e) {
    return resp({ ok: false, error: String(e) }, 500)
  }
})

function resp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
