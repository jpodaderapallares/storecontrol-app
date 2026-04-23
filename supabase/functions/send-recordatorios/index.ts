// Supabase Edge Function · send-recordatorios
// =====================================================
// Ejecutada cada 15 min por pg_cron. Consulta tareas_instancia,
// determina qué notificaciones toca enviar según la política:
//
//   · recordatorio_24h  → 24 h antes del vencimiento (destinatario: storekeeper)
//   · recordatorio_hoy  → entre 0 y 4 h antes del vencimiento (storekeeper)
//   · vencida_24h       → 24 h después del vencimiento sin completar (storekeeper + CC admin)
//   · escalado_admin    → 48 h después del vencimiento sin completar (solo admin)
//
// Renderiza el HTML/asunto usando la tabla plantillas_email (editable por admin).
// Registra cada envío en notificaciones_log (idempotencia: una sola notificación
// por (instancia, tipo)).
//
// Variables de entorno necesarias (Secrets de la Edge Function):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, RESEND_FROM_EMAIL   (p.ej. "StoreControl <notificaciones@h-la.es>")
//   APP_URL                              (p.ej. "https://storecontrol-app.vercel.app")

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Tipo = 'recordatorio_24h' | 'recordatorio_hoy' | 'vencida_24h' | 'escalado_admin'

// Mapa a los enum definidos en initial_schema (tipo_notificacion):
//   recordatorio_1 → recordatorio_24h
//   recordatorio_2 → recordatorio_hoy
//   vencimiento    → vencida_24h
//   escalado       → escalado_admin
const TIPO_ENUM: Record<Tipo, string> = {
  recordatorio_24h: 'recordatorio_1',
  recordatorio_hoy: 'recordatorio_2',
  vencida_24h: 'vencimiento',
  escalado_admin: 'escalado',
}

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'StoreControl <notificaciones@h-la.es>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://storecontrol-app.vercel.app'

// ────────────────────────── Utilidades ──────────────────────────

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

function fmtES(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  })
}

async function sendResend(
  to: string[],
  cc: string[],
  subject: string,
  html: string,
  text: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (!RESEND_KEY) {
    return { ok: false, detail: 'Falta RESEND_API_KEY en secrets' }
  }
  const body: Record<string, unknown> = { from: FROM, to, subject, html }
  if (cc.length > 0) body.cc = cc
  if (text) body.text = text

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const detail = await res.text()
  return { ok: res.ok, detail: res.ok ? detail : `HTTP ${res.status}: ${detail}` }
}

async function yaEnviado(instanciaId: string, tipoEnum: string): Promise<boolean> {
  const { data } = await sb
    .from('notificaciones_log')
    .select('id')
    .eq('instancia_id', instanciaId)
    .eq('tipo', tipoEnum)
    .eq('status', 'ok')
    .maybeSingle()
  return !!data
}

async function registrar(
  instanciaId: string,
  destinatarioId: string | null,
  tipoEnum: string,
  status: 'ok' | 'error',
  detalle?: string,
) {
  await sb.from('notificaciones_log').insert({
    instancia_id: instanciaId,
    destinatario_id: destinatarioId,
    tipo: tipoEnum,
    canal: 'email',
    status,
    detalle: detalle?.slice(0, 2000) ?? null,
  })
}

async function cargarPlantillas(): Promise<Map<Tipo, any>> {
  const { data } = await sb
    .from('plantillas_email')
    .select('*')
    .eq('activo', true)
  const map = new Map<Tipo, any>()
  for (const p of data ?? []) map.set(p.tipo as Tipo, p)
  return map
}

async function cargarConfigAdmin(): Promise<{ email: string; nombre: string; empresa: string }> {
  const { data } = await sb.from('configuracion').select('*').eq('clave', 'empresa').maybeSingle()
  const empresa = (data?.valor as any) ?? {}
  const emailAdmin: string = empresa.email_admin ?? 'logistics@h-la.es'

  const { data: admin } = await sb
    .from('usuarios')
    .select('nombre')
    .eq('email', emailAdmin)
    .maybeSingle()

  return {
    email: emailAdmin,
    nombre: admin?.nombre ?? 'Admin',
    empresa: empresa.nombre ?? 'HLA Logística',
  }
}

async function urlFirmadaFormato(pdfPath: string | null): Promise<string> {
  if (!pdfPath) return ''
  const { data } = await sb.storage
    .from('formatos')
    .createSignedUrl(pdfPath, 60 * 60 * 24) // 24 h
  return data?.signedUrl ?? ''
}

// ─────────────────── Reglas de decisión ───────────────────

interface Decision {
  tipo: Tipo
  destinatariosTo: string[]
  destinatariosCc: string[]
  destinatarioIdPrincipal: string | null
}

function decidir(
  limite: Date,
  ahora: Date,
  estado: string,
  storekeeperEmail: string | null,
  storekeeperId: string | null,
  adminEmail: string,
): Decision | null {
  const msHoraLimite = limite.getTime() - ahora.getTime()
  const horasHasta = msHoraLimite / 3_600_000
  const horasDesde = -horasHasta

  if (estado === 'pendiente' && storekeeperEmail) {
    // 24h antes (ventana 20-28h)
    if (horasHasta >= 20 && horasHasta <= 28) {
      return {
        tipo: 'recordatorio_24h',
        destinatariosTo: [storekeeperEmail],
        destinatariosCc: [],
        destinatarioIdPrincipal: storekeeperId,
      }
    }
    // Mismo día (ventana 0-4h antes)
    if (horasHasta >= 0 && horasHasta <= 4) {
      return {
        tipo: 'recordatorio_hoy',
        destinatariosTo: [storekeeperEmail],
        destinatariosCc: [],
        destinatarioIdPrincipal: storekeeperId,
      }
    }
  }

  // Vencida: la tarea puede estar ya en estado 'vencida' (marcada por cron DB)
  // o seguir 'pendiente' si el cron no ha corrido. Consideramos ambos.
  const vencida = (estado === 'vencida' || estado === 'pendiente') && horasDesde > 0

  if (vencida && storekeeperEmail) {
    // 24h después de vencida, CC admin
    if (horasDesde >= 24 && horasDesde <= 32) {
      return {
        tipo: 'vencida_24h',
        destinatariosTo: [storekeeperEmail],
        destinatariosCc: [adminEmail],
        destinatarioIdPrincipal: storekeeperId,
      }
    }
  }

  if (vencida) {
    // 48h después sin completar → solo admin
    if (horasDesde >= 48 && horasDesde <= 56) {
      return {
        tipo: 'escalado_admin',
        destinatariosTo: [adminEmail],
        destinatariosCc: [],
        destinatarioIdPrincipal: null,
      }
    }
  }

  return null
}

// ─────────────────── Procesamiento principal ───────────────────

async function procesar() {
  const ahora = new Date()
  const plantillas = await cargarPlantillas()
  const admin = await cargarConfigAdmin()

  // Rango: instancias con fecha_limite entre ahora-60h y ahora+30h
  // (cubre todas las ventanas de decisión con margen)
  const minLim = new Date(ahora.getTime() - 60 * 3_600_000).toISOString()
  const maxLim = new Date(ahora.getTime() + 30 * 3_600_000).toISOString()

  const { data: instancias, error } = await sb
    .from('tareas_instancia')
    .select(`
      id, fecha_limite, fecha_asignada, estado, usuario_id,
      tareas_plantilla!inner(id, titulo, descripcion, formato_id, formatos(id, pdf_path)),
      bases!inner(id, codigo_iata, nombre_completo),
      usuarios(id, email, nombre)
    `)
    .gte('fecha_limite', minLim)
    .lte('fecha_limite', maxLim)
    .in('estado', ['pendiente', 'vencida'])

  if (error) {
    console.error('query error', error)
    return { procesadas: 0, enviadas: 0, errores: [error.message] }
  }

  let enviadas = 0
  const errores: string[] = []

  for (const i of instancias ?? []) {
    const limite = new Date(i.fecha_limite as string)
    const storekeeper = (i as any).usuarios ?? null
    const base = (i as any).bases
    const plantilla = (i as any).tareas_plantilla
    const formato = plantilla?.formatos ?? null

    const decision = decidir(
      limite,
      ahora,
      i.estado as string,
      storekeeper?.email ?? null,
      storekeeper?.id ?? null,
      admin.email,
    )
    if (!decision) continue

    const tipoEnum = TIPO_ENUM[decision.tipo]
    if (await yaEnviado(i.id as string, tipoEnum)) continue

    const plantillaEmail = plantillas.get(decision.tipo)
    if (!plantillaEmail) {
      errores.push(`plantilla ${decision.tipo} no encontrada`)
      continue
    }

    const horasHasta = (limite.getTime() - ahora.getTime()) / 3_600_000
    const pdfFormatoUrl = formato ? await urlFirmadaFormato(formato.pdf_path) : ''

    const vars: Record<string, string> = {
      nombre_storekeeper: storekeeper?.nombre ?? '',
      email_storekeeper: storekeeper?.email ?? '',
      base_codigo: base?.codigo_iata ?? '',
      base_nombre: base?.nombre_completo ?? '',
      titulo_tarea: plantilla?.titulo ?? 'Tarea',
      descripcion_tarea: plantilla?.descripcion ?? '',
      fecha_limite: fmtES(i.fecha_limite as string),
      fecha_limite_corta: fmtHora(i.fecha_limite as string),
      horas_restantes: Math.max(0, Math.round(horasHasta)).toString(),
      horas_vencida: Math.max(0, Math.round(-horasHasta)).toString(),
      link_app: APP_URL,
      pdf_formato_url: pdfFormatoUrl,
      nombre_admin: admin.nombre,
      email_admin: admin.email,
      empresa_nombre: admin.empresa,
    }

    const asunto = render(plantillaEmail.asunto, vars)
    const html = render(plantillaEmail.cuerpo_html, vars)
    const text = plantillaEmail.cuerpo_texto ? render(plantillaEmail.cuerpo_texto, vars) : null

    // CC admin solo si la plantilla lo marca
    const cc = plantillaEmail.cc_admin ? decision.destinatariosCc : []

    const { ok, detail } = await sendResend(decision.destinatariosTo, cc, asunto, html, text)
    if (ok) {
      enviadas++
      await registrar(i.id as string, decision.destinatarioIdPrincipal, tipoEnum, 'ok', detail.slice(0, 200))
    } else {
      errores.push(`${decision.tipo} / ${i.id}: ${detail}`)
      await registrar(i.id as string, decision.destinatarioIdPrincipal, tipoEnum, 'error', detail)
    }
  }

  return { procesadas: instancias?.length ?? 0, enviadas, errores }
}

// ─────────────────── Handler HTTP ───────────────────

Deno.serve(async (req) => {
  try {
    const resultado = await procesar()
    return new Response(JSON.stringify(resultado, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
