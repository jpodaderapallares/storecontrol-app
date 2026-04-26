// Supabase Edge Function · qr-redirect
// Recibe ?s={slug}, resuelve la fila en documentos_qr (vía función SECURITY
// DEFINER public.resolver_qr_slug), genera una signed URL de 5 minutos para
// el bucket privado tooling_qr y devuelve JSON o 302.
//
// La SPA llama a este endpoint desde la ruta /qr/:slug; también funciona
// directamente vía curl/scan si se invoca con ?redirect=1 (devuelve 302).
//
// CORS abierto: el QR puede escanearse desde cualquier dispositivo y no
// requiere autenticación de StoreControl.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const url = new URL(req.url)
    const slug = (url.searchParams.get('s') ?? '').trim()
    const redirect = url.searchParams.get('redirect') === '1'

    if (!slug || !/^[\w-]{4,40}$/.test(slug)) {
      return json({ ok: false, error: 'slug_invalid' }, 400)
    }

    // 1) Resolver vía RPC SECURITY DEFINER (ya bumpea downloads)
    const { data, error } = await sb.rpc('resolver_qr_slug', { p_slug: slug })
    if (error) {
      const msg = String(error.message ?? '')
      if (msg.includes('qr_not_found')) {
        return notFound(redirect)
      }
      return json({ ok: false, error: msg }, 500)
    }

    const row = (data ?? [])[0]
    if (!row) return notFound(redirect)

    if (row.expirado) {
      return json({ ok: false, error: 'expired' }, 410)
    }

    // 2) Crear signed URL (5 min) en el bucket privado tooling_qr
    const { data: signed, error: sErr } = await sb.storage
      .from('tooling_qr')
      .createSignedUrl(row.storage_path, 300, {
        download: row.filename ?? undefined,
      })

    if (sErr || !signed?.signedUrl) {
      return json({ ok: false, error: sErr?.message ?? 'sign_failed' }, 500)
    }

    if (redirect) {
      return new Response(null, {
        status: 302,
        headers: { ...CORS, Location: signed.signedUrl },
      })
    }

    return json({
      ok: true,
      signedUrl: signed.signedUrl,
      filename: row.filename,
      contentType: row.content_type,
    })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function notFound(redirect: boolean): Response {
  if (redirect) {
    // HTML mínimo (no expone detalles)
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>QR no encontrado</title>
       <style>body{font-family:system-ui;padding:3em;text-align:center;color:#475569}</style>
       <h1 style="color:#0f172a">Documento no encontrado</h1>
       <p>El QR escaneado no apunta a un documento válido o ha sido borrado.</p>`,
      { status: 404, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
  return json({ ok: false, error: 'not_found' }, 404)
}
