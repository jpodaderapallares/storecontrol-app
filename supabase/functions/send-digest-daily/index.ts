// Supabase Edge Function · send-digest-daily
// =====================================================
// Envía UN ÚNICO email diario por storekeeper con TODAS las tareas
// frecuencia=diaria asignadas para hoy. Se ejecuta cada hora vía pg_cron;
// el envío real ocurre solo cuando la hora local de la base alcanza
// digests.hora_envio_local (default 07:30) y aún no se ha enviado el digest
// del día. Constraint único en notificaciones_log(destinatario_id, bucket, periodo)
// blinda contra duplicados ante reintentos SMTP.
//
// Side-effect: durante la pasada diaria, si detecta instancias vencidas más de
// `digests.umbral_critico_dias` días (default 7) y aún sin escalado_admin,
// envía 1 único email a admin (bucket=admin_critico, periodo=instancia_id).
//
// Secrets: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM,
// APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
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

// ─────────────────── SMTP minimal client ───────────────────
function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))) }
function extractAddress(h: string): string { const m = h.match(/<([^>]+)>/); return m ? m[1] : h.trim() }

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

async function smtpSend(to: string[], cc: string[], subject: string, html: string, text: string): Promise<{ ok: boolean; detail: string }> {
  if (!SMTP_USERNAME || !SMTP_PASSWORD) return { ok: false, detail: 'Faltan secrets SMTP_USERNAME/SMTP_PASSWORD' }
  const useImplicitTls = SMTP_PORT === 465
  let conn: Deno.Conn | null = null
  const enc = new TextEncoder(); const dec = new TextDecoder(); const buf = new Uint8Array(8192)
  async function read(): Promise<string> {
    let acc = ''
    while (true) {
      const n = await conn!.read(buf); if (n === null) break
      acc += dec.decode(buf.subarray(0, n))
      const lines = acc.split(/\r\n/)
      const last = lines.length >= 2 ? lines[lines.length - 2] : lines[lines.length - 1]
      if (/^\d{3} /.test(last)) break
      if (acc.length > 65536) break
    }
    return acc
  }
  async function write(s: string): Promise<void> { await conn!.write(enc.encode(s)) }
  async function cmd(line: string, expect: string): Promise<string> {
    await write(line + '\r\n')
    const r = await read()
    if (!r.startsWith(expect)) throw new Error(`SMTP "${line.slice(0,24)}": esperaba ${expect}, recibido: ${r.trim().slice(0,400)}`)
    return r
  }
  try {
    conn = useImplicitTls
      ? await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT })
      : await Deno.connect({ hostname: SMTP_HOST, port: SMTP_PORT })
    const greeting = await read()
    if (!greeting.startsWith('220')) throw new Error(`SMTP greeting: ${greeting.slice(0,200)}`)
    await cmd(`EHLO ${SMTP_HOST}`, '250')
    if (!useImplicitTls) {
      await cmd('STARTTLS', '220')
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
    const after = await read()
    if (!after.startsWith('250')) throw new Error(`SMTP DATA end: ${after.slice(0,200)}`)
    try { await write('QUIT\r\n'); await read() } catch {/**/}
    return { ok: true, detail: `sent to ${to.join(',')}${cc.length ? ' cc ' + cc.join(',') : ''}` }
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e).slice(0, 400) }
  } finally { try { conn?.close() } catch {/**/} }
}

// ─────────────────── Time utilities (TZ-aware) ───────────────────
// Devuelve {date:'YYYY-MM-DD', time:'HH:MM', minutes:0..1439, dow:1..7} en la zona indicada.
function nowInTz(tz: string): { date: string; time: string; minutes: number; dow: number; dom: number } {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const hh = parseInt(get('hour'), 10) % 24
  const mm = parseInt(get('minute'), 10)
  const time = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
  const dows: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 }
  const dow = dows[get('weekday')] ?? 1
  const dom = parseInt(get('day'), 10)
  return { date, time, minutes: hh*60 + mm, dow, dom }
}

// Parses 'HH:MM' to minutes since midnight.
function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(x => parseInt(x, 10))
  return (isNaN(h)?7:h)*60 + (isNaN(m)?30:m)
}

// ─────────────────── DB helpers ───────────────────
async function loadCfg(): Promise<{ enabled: boolean; daily_enabled: boolean; admin_email: string; hora_envio_local: string; umbral_critico_dias: number; admin_critico_enabled: boolean; no_enviar_a: string[] }> {
  const { data } = await sb().from('configuracion').select('valor').eq('clave', 'digests').maybeSingle()
  const v = (data?.valor as any) ?? {}
  return {
    enabled: v.enabled !== false,
    daily_enabled: v.daily_enabled !== false,
    admin_email: v.admin_email ?? 'logistics@h-la.es',
    hora_envio_local: v.hora_envio_local ?? '07:30',
    umbral_critico_dias: typeof v.umbral_critico_dias === 'number' ? v.umbral_critico_dias : 7,
    admin_critico_enabled: v.admin_critico_enabled !== false,
    no_enviar_a: Array.isArray(v.no_enviar_a) ? v.no_enviar_a : [],
  }
}

async function lookupAdmin(email: string): Promise<{ id: string | null; nombre: string }> {
  const { data } = await sb().from('usuarios').select('id, nombre').eq('email', email).maybeSingle()
  return { id: data?.id ?? null, nombre: data?.nombre ?? 'Admin' }
}

async function alreadySent(destinatarioId: string, bucket: string, periodo: string): Promise<boolean> {
  const { data } = await sb()
    .from('notificaciones_log').select('id')
    .eq('destinatario_id', destinatarioId).eq('bucket', bucket).eq('periodo', periodo)
    .eq('status', 'ok').maybeSingle()
  return !!data
}

async function logEntry(destinatarioId: string | null, bucket: string, periodo: string, status: 'ok' | 'error', detalle: string, instanciaId?: string | null) {
  await sb().from('notificaciones_log').insert({
    instancia_id: instanciaId ?? null,
    destinatario_id: destinatarioId,
    tipo: 'recordatorio_1', // valor histórico requerido (NOT NULL)
    canal: 'email',
    status, detalle: detalle.slice(0, 1900),
    bucket, periodo,
  })
}

// ─────────────────── Render ───────────────────
function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' } as Record<string,string>)[c])
}

function fmtHoraTZ(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

interface TaskRow { id: string; titulo: string; hora_limite: string; descripcion: string | null; categoria: string | null }

function renderHTML(nombre: string, baseCodigo: string, fechaES: string, tasks: TaskRow[], tz: string): string {
  const rows = tasks.map(t => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${htmlEscape(t.titulo)}${t.categoria?` <span style="color:#6b7280;font-size:12px">(${htmlEscape(t.categoria)})</span>`:''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827;white-space:nowrap;">${htmlEscape(fmtHoraTZ(t.hora_limite, tz))}</td>
    </tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
    <tr><td style="background:#1e40af;color:#fff;padding:20px 24px;font-size:18px;font-weight:600;">StoreControl · ${htmlEscape(baseCodigo)}</td></tr>
    <tr><td style="padding:24px;">
      <p style="margin:0 0 8px;font-size:16px;">Hola ${htmlEscape(nombre)},</p>
      <p style="margin:0 0 16px;color:#374151;">Estas son tus <b>tareas diarias</b> de hoy <b>${htmlEscape(fechaES)}</b>:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
        <thead><tr style="background:#f3f4f6;">
          <th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Tarea</th>
          <th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Hora límite</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:24px 0 0;"><a href="${APP_URL}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Abrir StoreControl</a></p>
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Recibes este email porque tienes tareas asignadas en ${htmlEscape(baseCodigo)}. Es un único resumen diario; no enviaremos recordatorios adicionales por cada tarea.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`
}

function renderTEXT(nombre: string, baseCodigo: string, fechaES: string, tasks: TaskRow[], tz: string): string {
  const lines = tasks.map(t => `  - ${t.titulo} (${fmtHoraTZ(t.hora_limite, tz)})`).join('\n')
  return `Hola ${nombre},\n\nTus tareas diarias de hoy ${fechaES} en ${baseCodigo}:\n\n${lines}\n\nAbrir StoreControl: ${APP_URL}\n`
}

// ─────────────────── Main ───────────────────
async function procesar(opts: { force?: boolean; dryRun?: boolean }) {
  const cfg = await loadCfg()
  if (!cfg.enabled || !cfg.daily_enabled) {
    return { skipped: true, reason: 'digests deshabilitados' }
  }
  const horaMin = hhmmToMin(cfg.hora_envio_local)
  const ventanaMax = horaMin + 6 * 60 // 6h ventana de envío

  // Cargar bases activas
  const { data: bases } = await sb().from('bases').select('id, codigo_iata, nombre_completo, zona_horaria').eq('activo', true)
  const adminInfo = await lookupAdmin(cfg.admin_email)

  let enviadas = 0
  let omitidas_ventana = 0
  let omitidas_dup = 0
  let sin_tareas = 0
  let criticos = 0
  const errores: string[] = []

  for (const base of bases ?? []) {
    const tz = base.zona_horaria || 'Europe/Madrid'
    const local = nowInTz(tz)
    const dentroVentana = opts.force || (local.minutes >= horaMin && local.minutes <= ventanaMax)
    if (!dentroVentana) { omitidas_ventana++; continue }

    const periodo = local.date // YYYY-MM-DD en TZ de la base
    const startISO = new Date(`${periodo}T00:00:00${tzOffsetSuffix(tz, periodo)}`).toISOString()
    const endISO = new Date(`${periodo}T23:59:59${tzOffsetSuffix(tz, periodo)}`).toISOString()

    // Obtener storekeepers de la base (con tareas hoy)
    const { data: instancias, error } = await sb()
      .from('tareas_instancia')
      .select(`id, fecha_limite, estado, usuario_id,
        tareas_plantilla!inner(id, titulo, descripcion, frecuencia, categoria, hora_limite),
        usuarios!inner(id, email, nombre, activo)`)
      .eq('base_id', base.id)
      .gte('fecha_limite', startISO)
      .lte('fecha_limite', endISO)
      .in('estado', ['pendiente', 'vencida'])

    if (error) { errores.push(`${base.codigo_iata}: ${error.message}`); continue }

    // Solo frecuencia=diaria para este digest
    const filtradas = (instancias ?? []).filter(i =>
      (i as any).tareas_plantilla?.frecuencia === 'diaria'
      && (i as any).usuarios?.activo
      && (i as any).usuarios?.email
    )

    // Agrupar por storekeeper
    const porUsuario = new Map<string, { user: any; tasks: TaskRow[] }>()
    for (const i of filtradas) {
      const u = (i as any).usuarios
      const t = (i as any).tareas_plantilla
      if (cfg.no_enviar_a.includes(u.email)) continue
      const entry = porUsuario.get(u.id) ?? { user: u, tasks: [] }
      entry.tasks.push({
        id: i.id as string,
        titulo: t.titulo,
        hora_limite: i.fecha_limite as string,
        descripcion: t.descripcion ?? null,
        categoria: t.categoria ?? null,
      })
      porUsuario.set(u.id, entry)
    }

    if (porUsuario.size === 0) { sin_tareas++; continue }

    for (const { user, tasks } of porUsuario.values()) {
      // Ordenar por hora_limite
      tasks.sort((a, b) => a.hora_limite.localeCompare(b.hora_limite))

      if (!opts.force && await alreadySent(user.id, 'digest_diario', periodo)) {
        omitidas_dup++; continue
      }

      const fechaES = new Date(periodo + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: tz })
      const subject = `[${base.codigo_iata}] Tus tareas diarias · ${fechaES}`
      const html = renderHTML(user.nombre ?? 'Storekeeper', base.codigo_iata, fechaES, tasks, tz)
      const text = renderTEXT(user.nombre ?? 'Storekeeper', base.codigo_iata, fechaES, tasks, tz)

      if (opts.dryRun) {
        enviadas++
        continue
      }

      const { ok, detail } = await smtpSend([user.email], [], subject, html, text)
      if (ok) {
        enviadas++
        await logEntry(user.id, 'digest_diario', periodo, 'ok', `${tasks.length} tareas`)
      } else {
        errores.push(`${base.codigo_iata}/${user.email}: ${detail}`)
        await logEntry(user.id, 'digest_diario', periodo, 'error', detail)
      }
    }
  }

  // Side-effect: escalado crítico admin (instancias con >= umbral_critico_dias días vencidas)
  if (cfg.admin_critico_enabled && adminInfo.id) {
    const cutoff = new Date(Date.now() - cfg.umbral_critico_dias * 86400000).toISOString()
    const { data: viejas } = await sb()
      .from('tareas_instancia')
      .select(`id, fecha_limite, estado, base_id,
        tareas_plantilla!inner(titulo, frecuencia),
        bases!inner(codigo_iata),
        usuarios(email, nombre)`)
      .lt('fecha_limite', cutoff)
      .in('estado', ['pendiente', 'vencida'])

    for (const inst of viejas ?? []) {
      const periodo = inst.id as string // 1 email por instancia, jamás se repite
      if (await alreadySent(adminInfo.id, 'admin_critico', periodo)) continue
      const t = (inst as any).tareas_plantilla
      const b = (inst as any).bases
      const sk = (inst as any).usuarios
      const dias = Math.floor((Date.now() - new Date(inst.fecha_limite as string).getTime()) / 86400000)
      const subject = `[CRÍTICO] Tarea sin atender ${dias} días — ${b.codigo_iata}`
      const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#fef2f2;padding:24px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #fecaca;overflow:hidden;">
  <div style="background:#b91c1c;color:#fff;padding:20px 24px;font-size:18px;font-weight:700;">⚠️ Escalado crítico</div>
  <div style="padding:24px;color:#111827;">
    <p style="margin:0 0 8px;">Tarea pendiente <b>${dias} días</b>:</p>
    <p style="margin:0 0 16px;"><b>${htmlEscape(t.titulo)}</b> (${htmlEscape(t.frecuencia)})</p>
    <p style="margin:0 0 4px;">Base: <b>${htmlEscape(b.codigo_iata)}</b></p>
    <p style="margin:0 0 4px;">Asignada a: ${htmlEscape(sk?.nombre ?? '—')} ${sk?.email?`<${htmlEscape(sk.email)}>`:''}</p>
    <p style="margin:0 0 16px;">Estado: <b>${htmlEscape(inst.estado as string)}</b></p>
    <p style="margin:24px 0 0;"><a href="${APP_URL}/admin/base/${htmlEscape(b.codigo_iata)}" style="background:#b91c1c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block;">Ver base ${htmlEscape(b.codigo_iata)}</a></p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Este email se envía una sola vez por instancia. No habrá insistencias.</p>
  </div>
</div></body></html>`
      const text = `[CRÍTICO] ${t.titulo} en ${b.codigo_iata} — ${dias} días sin atender. Asignada a ${sk?.nombre ?? '—'}. ${APP_URL}`
      if (opts.dryRun) { criticos++; continue }
      const { ok, detail } = await smtpSend([cfg.admin_email], [], subject, html, text)
      if (ok) {
        criticos++
        await logEntry(adminInfo.id, 'admin_critico', periodo, 'ok', `${dias}d`, inst.id as string)
      } else {
        errores.push(`admin_critico/${inst.id}: ${detail}`)
        await logEntry(adminInfo.id, 'admin_critico', periodo, 'error', detail, inst.id as string)
      }
    }
  }

  return { ok: true, enviadas, criticos, omitidas_ventana, omitidas_dup, sin_tareas, errores: errores.slice(0, 20) }
}

// Aproxima el offset de TZ para una fecha (sin DST cruces durante un día). Devuelve "+HH:MM" o "-HH:MM".
function tzOffsetSuffix(tz: string, dateStr: string): string {
  // Toma 12:00 UTC de ese día y mira qué hora marca en tz; el delta es el offset.
  const probe = new Date(dateStr + 'T12:00:00Z')
  const local = new Date(probe.toLocaleString('en-US', { timeZone: tz }))
  const diffMin = Math.round((local.getTime() - probe.getTime()) / 60000)
  const sign = diffMin >= 0 ? '+' : '-'
  const abs = Math.abs(diffMin)
  return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === '1'
    const dryRun = url.searchParams.get('dry_run') === '1'
    const out = await procesar({ force, dryRun })
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
