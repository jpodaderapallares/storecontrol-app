// Supabase Edge Function · send-recordatorios
// =====================================================
// Envía emails vía SMTP (Gmail SMTP) según las reglas:
//
//   · recordatorio_24h  → 24h antes del vencimiento (destinatario: storekeeper)
//   · recordatorio_hoy  → 0-4h antes del vencimiento (storekeeper)
//   · vencida_24h       → 24h después sin completar (storekeeper + CC admin)
//   · escalado_admin    → 48h después sin completar (solo admin)
//
// Secrets necesarios en la Edge Function:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (inyectados automáticamente)
//   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, APP_URL
//
// Implementación SMTP: cliente minimal sin dependencias externas de terceros.
// Usa Deno.connectTls() directamente para hablar SMTP con Gmail.

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Tipo = 'recordatorio_24h' | 'recordatorio_hoy' | 'vencida_24h' | 'escalado_admin'

const TIPO_ENUM: Record<Tipo, string> = {
  recordatorio_24h: 'recordatorio_1',
  recordatorio_hoy: 'recordatorio_2',
  vencida_24h: 'vencimiento',
  escalado_admin: 'escalado',
}

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
// NOTA: forzamos 587 + STARTTLS para Gmail. El puerto 465 (implicit TLS) tiene un bug
// de rustls en Deno Deploy con Gmail ("InvalidContentType"). 587 STARTTLS es lo
// más fiable. Ignoramos el secret SMTP_PORT cuando el host es Gmail.
const SMTP_PORT = SMTP_HOST.endsWith('gmail.com')
  ? 587
  : parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10)
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') ?? ''
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? ''
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? 'StoreControl <no-reply@example.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://storecontrol-app.vercel.app'

function sb() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

// ─────────────────── Utilidades ───────────────────

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

// ─────────────────── Cliente SMTP minimal (TLS, puerto 465) ───────────────────

function extractAddress(headerVal: string): string {
  const m = headerVal.match(/<([^>]+)>/)
  return m ? m[1] : headerVal.trim()
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function buildMIME(from: string, to: string[], cc: string[], subject: string, html: string, text: string): string {
  const boundary = 'bnd_' + crypto.randomUUID().replace(/-/g, '')
  const lines: string[] = []
  lines.push(`From: ${from}`)
  lines.push(`To: ${to.join(', ')}`)
  if (cc.length) lines.push(`Cc: ${cc.join(', ')}`)
  lines.push(`Subject: =?UTF-8?B?${b64(subject)}?=`)
  lines.push('MIME-Version: 1.0')
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
  lines.push('')
  lines.push(`--${boundary}`)
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: base64')
  lines.push('')
  lines.push(b64(text))
  lines.push(`--${boundary}`)
  lines.push('Content-Type: text/html; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: base64')
  lines.push('')
  lines.push(b64(html))
  lines.push(`--${boundary}--`)
  return lines.join('\r\n')
}

async function smtpSend(
  to: string[], cc: string[], subject: string, html: string, text: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!SMTP_USERNAME || !SMTP_PASSWORD) {
    return { ok: false, detail: 'Faltan secrets SMTP_USERNAME/SMTP_PASSWORD' }
  }

  const useImplicitTls = SMTP_PORT === 465
  let conn: Deno.Conn | null = null
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const buf = new Uint8Array(8192)

  // Lee hasta tener una respuesta SMTP completa (última línea: "XXX " con espacio).
  async function read(): Promise<string> {
    let acc = ''
    while (true) {
      const n = await conn!.read(buf)
      if (n === null) break
      acc += decoder.decode(buf.subarray(0, n))
      // ¿Última línea marca fin? SMTP: líneas intermedias "XXX-..." y final "XXX ..."
      const lines = acc.split(/\r\n/)
      // Quita último segmento vacío por el \r\n final
      const last = lines.length >= 2 ? lines[lines.length - 2] : lines[lines.length - 1]
      if (/^\d{3} /.test(last)) break
      if (acc.length > 65536) break // safety
    }
    return acc
  }
  async function write(s: string): Promise<void> {
    await conn!.write(encoder.encode(s))
  }
  async function cmd(line: string, expect: string): Promise<string> {
    await write(line + '\r\n')
    const r = await read()
    if (!r.startsWith(expect)) {
      const short = line.length > 24 ? line.slice(0, 24) + '...' : line
      throw new Error(`SMTP "${short}": esperaba ${expect}, recibido: ${r.trim().slice(0, 400)}`)
    }
    return r
  }

  try {
    if (useImplicitTls) {
      conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT })
    } else {
      conn = await Deno.connect({ hostname: SMTP_HOST, port: SMTP_PORT })
    }

    const greeting = await read()
    if (!greeting.startsWith('220')) throw new Error(`SMTP greeting inesperado: ${greeting.slice(0, 200)}`)

    await cmd(`EHLO ${SMTP_HOST}`, '250')

    if (!useImplicitTls) {
      // STARTTLS en 587
      await cmd('STARTTLS', '220')
      // Upgrade TCP → TLS. La conexión plana se consume.
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: SMTP_HOST })
      await cmd(`EHLO ${SMTP_HOST}`, '250')
    }

    await cmd('AUTH LOGIN', '334')
    await cmd(btoa(SMTP_USERNAME), '334')
    await cmd(btoa(SMTP_PASSWORD), '235')

    const fromAddr = extractAddress(SMTP_FROM)
    await cmd(`MAIL FROM:<${fromAddr}>`, '250')
    for (const r of to) await cmd(`RCPT TO:<${r}>`, '250')
    for (const r of cc) await cmd(`RCPT TO:<${r}>`, '250')
    await cmd('DATA', '354')

    const mime = buildMIME(SMTP_FROM, to, cc, subject, html, text)
    const stuffed = mime.split('\r\n').map(l => l.startsWith('.') ? '.' + l : l).join('\r\n')
    await write(stuffed + '\r\n.\r\n')
    const afterData = await read()
    if (!afterData.startsWith('250')) throw new Error(`SMTP DATA end: ${afterData.slice(0, 200)}`)

    try { await write('QUIT\r\n'); await read() } catch { /* ignore */ }

    return { ok: true, detail: `sent to ${to.join(',')}${cc.length ? ' cc ' + cc.join(',') : ''}` }
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e).slice(0, 400) }
  } finally {
    try { conn?.close() } catch { /* ignore */ }
  }
}

// ─────────────────── Helpers base de datos ───────────────────

async function yaEnviado(instanciaId: string, tipoEnum: string): Promise<boolean> {
  const { data } = await sb()
    .from('notificaciones_log')
    .select('id')
    .eq('instancia_id', instanciaId)
    .eq('tipo', tipoEnum)
    .eq('status', 'ok')
    .maybeSingle()
  return !!data
}

async function registrar(
  instanciaId: string, destinatarioId: string | null, tipoEnum: string,
  status: 'ok' | 'error', detalle?: string,
) {
  await sb().from('notificaciones_log').insert({
    instancia_id: instanciaId, destinatario_id: destinatarioId,
    tipo: tipoEnum, canal: 'email', status,
    detalle: detalle?.slice(0, 2000) ?? null,
  })
}

async function cargarPlantillas(): Promise<Map<Tipo, any>> {
  const { data } = await sb().from('plantillas_email').select('*').eq('activo', true)
  const map = new Map<Tipo, any>()
  for (const p of data ?? []) map.set(p.tipo as Tipo, p)
  return map
}

async function cargarConfigAdmin(): Promise<{ email: string; nombre: string; empresa: string }> {
  const { data } = await sb().from('configuracion').select('*').eq('clave', 'empresa').maybeSingle()
  const empresa = (data?.valor as any) ?? {}
  const emailAdmin: string = empresa.email_admin ?? 'logistics@h-la.es'
  const { data: admin } = await sb().from('usuarios').select('nombre').eq('email', emailAdmin).maybeSingle()
  return {
    email: emailAdmin,
    nombre: admin?.nombre ?? 'Admin',
    empresa: empresa.nombre ?? 'HLA Logística',
  }
}

type Frecuencia = 'diaria' | 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
type MatrizNotif = Record<Tipo, Record<Frecuencia, boolean>>

function matrizDefault(): MatrizNotif {
  return {
    recordatorio_24h: { diaria: false, semanal: true, mensual: true, trimestral: true, semestral: true, anual: true },
    recordatorio_hoy: { diaria: true,  semanal: true, mensual: true, trimestral: true, semestral: true, anual: true },
    vencida_24h:      { diaria: true,  semanal: true, mensual: true, trimestral: true, semestral: true, anual: true },
    escalado_admin:   { diaria: true,  semanal: true, mensual: true, trimestral: true, semestral: true, anual: true },
  }
}

async function cargarMatrizNotif(): Promise<MatrizNotif> {
  const { data } = await sb().from('configuracion').select('valor').eq('clave', 'notificaciones_matriz').maybeSingle()
  const out = matrizDefault()
  const v = data?.valor as any
  if (!v) return out
  for (const tipo of Object.keys(out) as Tipo[]) {
    const fila = v?.[tipo]
    if (fila && typeof fila === 'object') {
      for (const f of Object.keys(out[tipo]) as Frecuencia[]) {
        if (typeof fila[f] === 'boolean') out[tipo][f] = fila[f]
      }
    }
  }
  return out
}

async function urlFirmadaFormato(pdfPath: string | null): Promise<string> {
  if (!pdfPath) return ''
  const { data } = await sb().storage.from('formatos').createSignedUrl(pdfPath, 60 * 60 * 24)
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
  limite: Date, ahora: Date, estado: string,
  storekeeperEmail: string | null, storekeeperId: string | null, adminEmail: string,
): Decision | null {
  const horasHasta = (limite.getTime() - ahora.getTime()) / 3_600_000
  const horasDesde = -horasHasta

  if (estado === 'pendiente' && storekeeperEmail) {
    if (horasHasta >= 20 && horasHasta <= 28) {
      return { tipo: 'recordatorio_24h', destinatariosTo: [storekeeperEmail], destinatariosCc: [], destinatarioIdPrincipal: storekeeperId }
    }
    if (horasHasta >= 0 && horasHasta <= 4) {
      return { tipo: 'recordatorio_hoy', destinatariosTo: [storekeeperEmail], destinatariosCc: [], destinatarioIdPrincipal: storekeeperId }
    }
  }

  const vencida = (estado === 'vencida' || estado === 'pendiente') && horasDesde > 0

  if (vencida && storekeeperEmail) {
    if (horasDesde >= 24 && horasDesde <= 32) {
      return { tipo: 'vencida_24h', destinatariosTo: [storekeeperEmail], destinatariosCc: [adminEmail], destinatarioIdPrincipal: storekeeperId }
    }
  }

  if (vencida) {
    if (horasDesde >= 48 && horasDesde <= 56) {
      return { tipo: 'escalado_admin', destinatariosTo: [adminEmail], destinatariosCc: [], destinatarioIdPrincipal: null }
    }
  }

  return null
}

// ─────────────────── Procesamiento principal ───────────────────

async function procesar(testTo?: string) {
  const ahora = new Date()

  // Modo test: envía un email de diagnóstico sin tocar la BD.
  if (testTo) {
    const subj = 'StoreControl — Test SMTP ' + ahora.toISOString()
    const htm = `<p>Email de prueba desde send-recordatorios.</p><p>Hora: ${ahora.toISOString()}</p>`
    const txt = `Email de prueba desde send-recordatorios. Hora: ${ahora.toISOString()}`
    const res = await smtpSend([testTo], [], subj, htm, txt)
    return { modo: 'test', destinatario: testTo, ...res }
  }

  const plantillas = await cargarPlantillas()
  const admin = await cargarConfigAdmin()
  const matriz = await cargarMatrizNotif()
  const minLim = new Date(ahora.getTime() - 60 * 3_600_000).toISOString()
  const maxLim = new Date(ahora.getTime() + 30 * 3_600_000).toISOString()

  // Las desasignadas NO disparan notificaciones (Julio: tareas que desasigne no cuentan).
  const { data: instancias, error } = await sb()
    .from('tareas_instancia')
    .select(`id, fecha_limite, fecha_asignada, estado, usuario_id,
      tareas_plantilla!inner(id, titulo, descripcion, frecuencia, formato_id, formatos(id, pdf_path)),
      bases!inner(id, codigo_iata, nombre_completo),
      usuarios(id, email, nombre)`)
    .gte('fecha_limite', minLim)
    .lte('fecha_limite', maxLim)
    .in('estado', ['pendiente', 'vencida'])

  if (error) {
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
      limite, ahora, i.estado as string,
      storekeeper?.email ?? null, storekeeper?.id ?? null, admin.email,
    )
    if (!decision) continue

    // Filtrar por matriz: si el admin desactivó esta combinación, saltar
    const frecuencia = (plantilla?.frecuencia ?? 'diaria') as Frecuencia
    const habilitado = matriz[decision.tipo]?.[frecuencia]
    if (habilitado === false) continue

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
    const text = plantillaEmail.cuerpo_texto ? render(plantillaEmail.cuerpo_texto, vars) : 'Consulta la versión HTML.'
    const cc = plantillaEmail.cc_admin ? decision.destinatariosCc : []

    const { ok, detail } = await smtpSend(decision.destinatariosTo, cc, asunto, html, text)
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

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const testTo = url.searchParams.get('test_to') ?? undefined
    const resultado = await procesar(testTo)
    return new Response(JSON.stringify(resultado, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
