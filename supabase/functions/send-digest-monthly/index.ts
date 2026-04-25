// Supabase Edge Function · send-digest-monthly
// =====================================================
// UN único email mensual por storekeeper con TODAS sus tareas frecuencia
// mensual / trimestral / semestral / anual con vencimiento este mes.
// Se ejecuta cada hora; envía solo el primer día laborable del mes a las
// digests.hora_envio_local locales de cada base.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
const SMTP_PORT = SMTP_HOST.endsWith('gmail.com') ? 587 : parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10)
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') ?? ''
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? ''
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? 'StoreControl <no-reply@example.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://storecontrol-app.vercel.app'

function sb() { return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') }

function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))) }
function extractAddress(h: string): string { const m = h.match(/<([^>]+)>/); return m ? m[1] : h.trim() }
function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' } as Record<string,string>)[c])
}

function buildMIME(from: string, to: string[], cc: string[], subject: string, html: string, text: string): string {
  const boundary = 'bnd_' + crypto.randomUUID().replace(/-/g, '')
  const lines: string[] = [
    `From: ${from}`, `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(text),
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(html),
    `--${boundary}--`,
  ]
  return lines.join('\r\n')
}

async function smtpSend(to: string[], cc: string[], subject: string, html: string, text: string): Promise<{ ok: boolean; detail: string }> {
  if (!SMTP_USERNAME || !SMTP_PASSWORD) return { ok: false, detail: 'Faltan secrets SMTP' }
  const useTls = SMTP_PORT === 465
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
  async function write(s: string) { await conn!.write(enc.encode(s)) }
  async function cmd(line: string, expect: string) {
    await write(line + '\r\n'); const r = await read()
    if (!r.startsWith(expect)) throw new Error(`SMTP "${line.slice(0,24)}": esperaba ${expect}, recibido: ${r.trim().slice(0,400)}`)
  }
  try {
    conn = useTls ? await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT }) : await Deno.connect({ hostname: SMTP_HOST, port: SMTP_PORT })
    const g = await read(); if (!g.startsWith('220')) throw new Error(`SMTP greeting: ${g.slice(0,200)}`)
    await cmd(`EHLO ${SMTP_HOST}`, '250')
    if (!useTls) {
      await cmd('STARTTLS', '220')
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: SMTP_HOST })
      await cmd(`EHLO ${SMTP_HOST}`, '250')
    }
    await cmd('AUTH LOGIN', '334'); await cmd(btoa(SMTP_USERNAME), '334'); await cmd(btoa(SMTP_PASSWORD), '235')
    await cmd(`MAIL FROM:<${extractAddress(SMTP_FROM)}>`, '250')
    for (const r of to) await cmd(`RCPT TO:<${r}>`, '250')
    for (const r of cc) await cmd(`RCPT TO:<${r}>`, '250')
    await cmd('DATA', '354')
    const mime = buildMIME(SMTP_FROM, to, cc, subject, html, text)
    const stuffed = mime.split('\r\n').map(l => l.startsWith('.') ? '.' + l : l).join('\r\n')
    await write(stuffed + '\r\n.\r\n')
    const after = await read(); if (!after.startsWith('250')) throw new Error(`SMTP DATA end: ${after.slice(0,200)}`)
    try { await write('QUIT\r\n'); await read() } catch {/**/}
    return { ok: true, detail: `sent to ${to.join(',')}` }
  } catch (e) { return { ok: false, detail: String((e as Error).message ?? e).slice(0,400) } }
  finally { try { conn?.close() } catch {/**/} }
}

function nowInTz(tz: string): { date: string; minutes: number; dow: number; dom: number; ym: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  })
  const p = fmt.formatToParts(new Date())
  const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const hh = parseInt(get('hour'),10) % 24
  const mm = parseInt(get('minute'),10)
  const dows: Record<string, number> = { Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7 }
  return { date, minutes: hh*60+mm, dow: dows[get('weekday')] ?? 1, dom: parseInt(get('day'),10), ym: `${get('year')}-${get('month')}` }
}

function hhmmToMin(s: string): number { const [h,m] = s.split(':').map(x=>parseInt(x,10)); return (isNaN(h)?7:h)*60 + (isNaN(m)?30:m) }

function tzOffsetSuffix(tz: string, dateStr: string): string {
  const probe = new Date(dateStr + 'T12:00:00Z')
  const local = new Date(probe.toLocaleString('en-US', { timeZone: tz }))
  const diffMin = Math.round((local.getTime() - probe.getTime()) / 60000)
  const sign = diffMin >= 0 ? '+' : '-'
  const abs = Math.abs(diffMin)
  return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`
}

function rangoMes(ym: string, tz: string): { startISO: string; endISO: string } {
  const [y, m] = ym.split('-').map(x => parseInt(x, 10))
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate() // último día del mes
  const start = `${ym}-01`
  const end = `${ym}-${String(last).padStart(2,'0')}`
  return {
    startISO: new Date(`${start}T00:00:00${tzOffsetSuffix(tz, start)}`).toISOString(),
    endISO: new Date(`${end}T23:59:59${tzOffsetSuffix(tz, end)}`).toISOString(),
  }
}

// ¿Es hoy el primer día laborable del mes en la TZ?
function esPrimerLaborable(local: { dom: number; dow: number }): boolean {
  // dow: 1=Mon, 7=Sun. dom: 1..31
  if (local.dow >= 6) return false // sábado/domingo nunca cuenta
  // Caso A: es el día 1 y es lun-vie → primer laborable.
  if (local.dom === 1) return true
  // Caso B: día 2 y dow=Mon → primer laborable (sábado 1 saltado).
  if (local.dom === 2 && local.dow === 1) return true
  // Caso C: día 3 y dow=Mon → primer laborable (domingo 1, sábado 2 saltado? no, sat 2 dom 3 sería 3=lun→falso). Dejo solo caso si día 3 es Mon (sat=1, sun=2).
  if (local.dom === 3 && local.dow === 1) return true
  return false
}

async function loadCfg() {
  const { data } = await sb().from('configuracion').select('valor').eq('clave', 'digests').maybeSingle()
  const v = (data?.valor as any) ?? {}
  return {
    enabled: v.enabled !== false,
    monthly_enabled: v.monthly_enabled !== false,
    hora_envio_local: v.hora_envio_local ?? '07:30',
    no_enviar_a: Array.isArray(v.no_enviar_a) ? v.no_enviar_a : [] as string[],
  }
}

async function alreadySent(destinatarioId: string, bucket: string, periodo: string): Promise<boolean> {
  const { data } = await sb().from('notificaciones_log').select('id')
    .eq('destinatario_id', destinatarioId).eq('bucket', bucket).eq('periodo', periodo)
    .eq('status', 'ok').maybeSingle()
  return !!data
}
async function logEntry(destId: string, bucket: string, periodo: string, status: 'ok'|'error', detalle: string) {
  await sb().from('notificaciones_log').insert({
    instancia_id: null, destinatario_id: destId, tipo: 'recordatorio_1', canal: 'email',
    status, detalle: detalle.slice(0, 1900), bucket, periodo,
  })
}

interface Row { id: string; titulo: string; fecha_limite: string; frecuencia: string; categoria: string | null }

function fmtFechaTZ(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: tz })
}

const FREQ_LABEL: Record<string,string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' }

function renderHTML(nombre: string, baseCodigo: string, ymLabel: string, tasks: Row[], tz: string): string {
  const rows = tasks.map(t => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${htmlEscape(t.titulo)}${t.categoria?` <span style="color:#6b7280;font-size:12px">(${htmlEscape(t.categoria)})</span>`:''}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">${htmlEscape(FREQ_LABEL[t.frecuencia] ?? t.frecuencia)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827;white-space:nowrap;">${htmlEscape(fmtFechaTZ(t.fecha_limite, tz))}</td>
  </tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <tr><td style="background:#7c3aed;color:#fff;padding:20px 24px;font-size:18px;font-weight:600;">StoreControl · ${htmlEscape(baseCodigo)} · Mensual</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 8px;">Hola ${htmlEscape(nombre)},</p>
    <p style="margin:0 0 16px;color:#374151;">Tareas mensuales / trimestrales / semestrales / anuales con vencimiento en <b>${htmlEscape(ymLabel)}</b>:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
      <thead><tr style="background:#f3f4f6;">
        <th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Tarea</th>
        <th align="center" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Frecuencia</th>
        <th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Vence</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:24px 0 0;"><a href="${APP_URL}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Abrir StoreControl</a></p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Único email mensual de tareas. No habrá recordatorios adicionales.</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

function renderTEXT(nombre: string, baseCodigo: string, ymLabel: string, tasks: Row[], tz: string): string {
  const lines = tasks.map(t => `  - [${FREQ_LABEL[t.frecuencia] ?? t.frecuencia}] ${t.titulo} — vence ${fmtFechaTZ(t.fecha_limite, tz)}`).join('\n')
  return `Hola ${nombre},\n\nTareas a abordar este mes (${ymLabel}) en ${baseCodigo}:\n\n${lines}\n\nAbrir: ${APP_URL}\n`
}

async function procesar(opts: { force?: boolean; dryRun?: boolean }) {
  const cfg = await loadCfg()
  if (!cfg.enabled || !cfg.monthly_enabled) return { skipped: true, reason: 'monthly deshabilitado' }
  const horaMin = hhmmToMin(cfg.hora_envio_local)
  const ventanaMax = horaMin + 6*60

  const { data: bases } = await sb().from('bases').select('id, codigo_iata, zona_horaria').eq('activo', true)

  let enviadas = 0, omit_no_inicio = 0, omit_ventana = 0, omit_dup = 0, sin_tareas = 0
  const errores: string[] = []

  for (const base of bases ?? []) {
    const tz = base.zona_horaria || 'Europe/Madrid'
    const local = nowInTz(tz)
    if (!opts.force && !esPrimerLaborable(local)) { omit_no_inicio++; continue }
    if (!opts.force && (local.minutes < horaMin || local.minutes > ventanaMax)) { omit_ventana++; continue }

    const periodo = local.ym // YYYY-MM
    const { startISO, endISO } = rangoMes(periodo, tz)

    const { data: instancias, error } = await sb()
      .from('tareas_instancia')
      .select(`id, fecha_limite, estado,
        tareas_plantilla!inner(titulo, frecuencia, categoria),
        usuarios!inner(id, email, nombre, activo)`)
      .eq('base_id', base.id)
      .gte('fecha_limite', startISO).lte('fecha_limite', endISO)
      .in('estado', ['pendiente', 'vencida'])

    if (error) { errores.push(`${base.codigo_iata}: ${error.message}`); continue }

    const filtradas = (instancias ?? []).filter(i => {
      const f = (i as any).tareas_plantilla?.frecuencia
      return ['mensual','trimestral','semestral','anual'].includes(f)
        && (i as any).usuarios?.activo && (i as any).usuarios?.email
    })

    const porUsuario = new Map<string, { user: any; tasks: Row[] }>()
    for (const i of filtradas) {
      const u = (i as any).usuarios; const t = (i as any).tareas_plantilla
      if (cfg.no_enviar_a.includes(u.email)) continue
      const e = porUsuario.get(u.id) ?? { user: u, tasks: [] }
      e.tasks.push({ id: i.id as string, titulo: t.titulo, fecha_limite: i.fecha_limite as string, frecuencia: t.frecuencia, categoria: t.categoria ?? null })
      porUsuario.set(u.id, e)
    }
    if (porUsuario.size === 0) { sin_tareas++; continue }

    const ymLabel = new Date(`${periodo}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: tz })

    for (const { user, tasks } of porUsuario.values()) {
      tasks.sort((a,b) => a.fecha_limite.localeCompare(b.fecha_limite))
      if (!opts.force && await alreadySent(user.id, 'digest_mensual', periodo)) { omit_dup++; continue }
      const subject = `[${base.codigo_iata}] Tareas mensuales · ${ymLabel}`
      const html = renderHTML(user.nombre ?? 'Storekeeper', base.codigo_iata, ymLabel, tasks, tz)
      const text = renderTEXT(user.nombre ?? 'Storekeeper', base.codigo_iata, ymLabel, tasks, tz)
      if (opts.dryRun) { enviadas++; continue }
      const { ok, detail } = await smtpSend([user.email], [], subject, html, text)
      if (ok) { enviadas++; await logEntry(user.id, 'digest_mensual', periodo, 'ok', `${tasks.length} tareas`) }
      else { errores.push(`${base.codigo_iata}/${user.email}: ${detail}`); await logEntry(user.id, 'digest_mensual', periodo, 'error', detail) }
    }
  }

  return { ok: true, enviadas, omit_no_inicio, omit_ventana, omit_dup, sin_tareas, errores: errores.slice(0,20) }
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url)
    const out = await procesar({ force: u.searchParams.get('force')==='1', dryRun: u.searchParams.get('dry_run')==='1' })
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
