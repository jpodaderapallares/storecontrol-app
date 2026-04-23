// Edge Function · crear-usuario
// Crea un usuario en Supabase Auth con contraseña temporal y envía email de bienvenida.
// Requiere SERVICE_ROLE porque admin.createUser sólo está disponible con service key.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'storecontrol@hla.es'

async function sendWelcome(to: string, nombre: string, password: string) {
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
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  try {
    const { nombre, email, rol, base_id, password } = await req.json()

    // 1) Crear en Auth
    const { data: auth, error: errAuth } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { nombre, rol },
    })
    if (errAuth) throw errAuth

    // 2) Insertar en tabla usuarios
    await sb.from('usuarios').insert({
      id: auth.user.id, nombre, email, rol, base_id, activo: true,
    })

    // 3) Audit log
    await sb.from('audit_log').insert({
      accion: 'usuario_creado', entidad: 'usuarios', entidad_id: auth.user.id,
      metadata_json: { email, rol, base_id },
    })

    // 4) Email de bienvenida
    await sendWelcome(email, nombre, password)

    return new Response(JSON.stringify({ ok: true, id: auth.user.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
})
