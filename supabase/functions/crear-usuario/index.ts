// Edge Function · crear-usuario
// Crea un usuario en Supabase Auth con contraseña temporal y envía email de bienvenida.
// Requiere SERVICE_ROLE porque admin.createUser sólo está disponible con service key.
// CORS habilitado para llamadas desde el frontend (Vercel).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'storecontrol@hla.es'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sendWelcome(to: string, nombre: string, password: string) {
  if (!RESEND_KEY) return // si no hay clave de Resend, no enviamos correo (fallo silencioso ok)
  const html = `<div style="font-family:Arial;padding:20px;max-width:520px;margin:0 auto">
    <h2>Bienvenido a StoreControl</h2>
    <p>Hola ${nombre},</p>
    <p>Se ha creado tu cuenta para la gestión de almacenes HLA.</p>
    <p>Tu contraseña temporal es: <code style="background:#eee;padding:4px 8px;border-radius:4px">${password}</code></p>
    <p>Cámbiala la primera vez que accedas.</p>
  </div>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject: 'Bienvenido a StoreControl', html }),
  })
}

Deno.serve(async (req) => {
  // Preflight CORS — los navegadores envían OPTIONS antes del POST cross-origin
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const nombre = (body.nombre ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const rol = body.rol
    const base_id = body.base_id ?? null
    const password = body.password

    if (!nombre || !email || !password) {
      throw new Error('Faltan campos obligatorios (nombre, email, password)')
    }
    if (rol !== 'admin' && rol !== 'storekeeper') {
      throw new Error('Rol inválido')
    }
    if (rol === 'storekeeper' && !base_id) {
      throw new Error('Los storekeepers requieren una base asignada')
    }

    // 1) Crear en Auth
    const { data: auth, error: errAuth } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol },
    })
    if (errAuth) throw errAuth

    // 2) Insertar en tabla usuarios
    const { error: errIns } = await sb.from('usuarios').insert({
      id: auth.user.id,
      nombre,
      email,
      rol,
      base_id: rol === 'storekeeper' ? base_id : null,
      activo: true,
    })
    if (errIns) {
      // Intentar limpiar el auth.user si falla la inserción en BD
      try { await sb.auth.admin.deleteUser(auth.user.id) } catch (_) { /* ignore */ }
      throw errIns
    }

    // 3) Audit log
    await sb.from('audit_log').insert({
      accion: 'usuario_creado',
      entidad: 'usuarios',
      entidad_id: auth.user.id,
      metadata_json: { email, rol, base_id },
    })

    // 4) Email de bienvenida (no bloqueante: si falla, el usuario igual queda creado)
    try {
      await sendWelcome(email, nombre, password)
    } catch (_) { /* email no crítico */ }

    return new Response(JSON.stringify({ ok: true, id: auth.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
