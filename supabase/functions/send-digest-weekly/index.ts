// Supabase Edge Function · send-digest-weekly
// =====================================================
// UN único email semanal por storekeeper con TODAS sus tareas frecuencia=semanal
// para la semana ISO en curso. Se ejecuta cada hora; envía solo los lunes
// cuando la hora local de la base alcanza digests.hora_envio_local.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
const SMTP_PORT = SMTP_HOST.endsWith('gmail.com') ? 587 : parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10)
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') ?? ''
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? ''
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? 'StoreControl <no-reply@example.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://storecontrol-app.vercel.app'

function sb() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

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
    const fromAddr = extractAddress(SMTP_FROM)
    await cmd(`MAIL FROM:<${fromAddr}>`, '250')
    for (const r of to) await cmd(`RCPT TO:<${r}>`, '250')
    for (const r of cc) await cmd(`RCPT TO:<${r}>`, '250')
    await cmd('DATA', '354')
    const mime = buildMIME(SMTP_FROM, to, cc, subject, html, text)
    const stuffed = mime.split('\r\n').map(l => l.startsWith('.') ? '.' + l : l).join('\r\n')
    await write(stuffed + '\r\n.\r\n')
    const after = await read(); if (!after.startsWith('250')) throw new Error(`SMTP DATA end: ${after.slice(0,200)}`)
    try { await write('QUIT\r\n'); await read() } catch {/**/}
    return { ok: true, detail: `sent to ${to.join(',')}` }
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e).slice(0, 400) }
  } finally { try { conn?.close() } catch {/**/} }
}

function nowInTz(tz: string): { date: string; minutes: number; dow: number } {
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
  return { date, minutes: hh*60+mm, dow: dows[get('weekday')] ?? 1 }
}

function hhmmToMin(s: string): number { const [h,m] = s.split(':').map(x=>parseInt(x,10)); return (isNaN(h)?7:h)*60 + (isNaN(m)?30:m) }

// ISO week number per RFC 8601
function isoWeek(dateStr: string): { year: number; week: number; periodo: string } {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dayOfWeek = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 3) // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  const year = d.getUTCFullYear()
  return { year, week, periodo: `${year}-W${String(week).padStart(2,'0')}` }
}

function tzOffsetSuffix(tz: string, dateStr: string): string {
  const probe = new Date(dateStr + 'T12:00:00Z')
  const local = new Date(probe.toLocaleString('en-US', { timeZone: tz }))
  const diffMin = Math.round((local.getTime() - probe.getTime()) / 60000)
  const sign = diffMin >= 0 ? '+' : '-'
  const abs = Math.abs(diffMin)
  return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`
}

// Devuelve [lunes, domingo] como ISO (00:00 y 23:59) en TZ.
function rangoSemana(dateStr: string, tz: string): { startISO: string; endISO: string } {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow)
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
  const mStr = monday.toISOString().slice(0,10)
  const sStr = sunday.toISOString().slice(0,10)
  return {
    startISO: new Date(`${mStr}T00:00:00${tzOffsetSuffix(tz, mStr)}`).toISOString(),
    endISO: new Date(`${sStr}T23:59:59${tzOffsetSuffix(tz, sStr)}`).toISOString(),
  }
}

async function loadCfg() {
  const { data } = await sb().from('configuracion').select('valor').eq('clave', 'digests').maybeSingle()
  const v = (data?.valor as any) ?? {}
  return {
    enabled: v.enabled !== false,
    weekly_enabled: v.weekly_enabled !== false,
    hora_envio_local: v.hora_envio_local ?? '07:30',
    no_enviar_a: Array.isArray(v.no_enviar_a) ? v.no_enviar_a : [] as string[],
  }
}

async function alreadySent(destinatarioId: string, bucket: string, periodo: string): Promise<boolean> {
  const { data } = await sb()
    .from('notificaciones_log').select('id')
    .eq('destinatario_id', destinatarioId).eq('bucket', bucket).eq('periodo', periodo)
    .eq('status', 'ok').maybeSingle()
  return !!data
}

async function logEntry(destId: string, bucket: string, periodo: string, status: 'ok'|'error', detalle: string) {
  await sb().from('notificaciones_log').insert({
    instancia_id: null, destinatario_id: destId,
    tipo: 'recordatorio_1', canal: 'email',
    status, detalle: detalle.slice(0, 1900),
    bucket, periodo,
  })
}

interface Row { id: string; titulo: string; fecha_limite: string; categoria: string | null }

function fmtDiaTZ(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short', timeZone: tz })
}
function fmtHoraTZ(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

function renderHTML(nombre: string, baseCodigo: string, periodo: string, tasks: Row[], tz: string): string {
  const rows = tasks.map(t => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${htmlEscape(t.titulo)}${t.categoria?` <span style="color:#6b7280;font-size:12px">(${htmlEscape(t.categoria)})</span>`:''}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;white-space:nowrap;">${htmlEscape(fmtDiaTZ(t.fecha_limite, tz))} <span style="color:#6b7280">${htmlEscape(fmtHoraTZ(t.fecha_limite, tz))}</span></td>
  </tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <tr><td style="background:#0f766e;color:#fff;padding:20px 24px;font-size:18px;font-weight:600;">StoreControl · ${htmlEscape(baseCodigo)} · Semanal</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 8px;">Hola ${htmlEscape(nombre)},</p>
    <p style="margin:0 0 16px;color:#374151;">Tus <b>tareas semanales</b> de la semana <b>${htmlEscape(periodo)}</b>:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
      <thead><tr style="background:#f3f4f6;">
        <th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Tarea</th>
        <th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Día / hora</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:24px 0 0;"><a href="${APP_URL}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Abrir StoreControl</a></p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Único email semanal de tareas. No habrá recordatorios adicionales.</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

function renderTEXT(nombre: string, baseCodigo: string, periodo: string, tasks: Row[], tz: string): string {
  const lines = tasks.map(t => `  - ${t.titulo} — ${fmtDiaTZ(t.fecha_limite,tz)} ${fmtHoraTZ(t.fecha_limite,tz)}`).join('\n')
  return `Hola ${nombre},\n\nTus tareas semanales (semana ${periodo}) en ${baseCodigo}:\n\n${lines}\n\nAbrir: ${APP_URL}\n`
}

async function procesar(opts: { force?: boolean; dryRun?: boolean }) {
  const cfg = await loadCfg()
  if (!cfg.enabled || !cfg.weekly_enabled) return { skipped: true, reason: 'weekly deshabilitado' }
  const horaMin = hhmmToMin(cfg.hora_envio_local)
  const ventanaMax = horaMin + 6*60

  const { data: bases } = await sb().from('bases').select('id, codigo_iata, zona_horaria').eq('activo', true)

  let enviadas = 0, omit_no_lunes = 0, omit_ventana = 0, omit_dup = 0, sin_tareas = 0
  const errores: string[] = []

  for (const base of bases ?? []) {
    const tz = base.zona_horaria || 'Europe/Madrid'
    const local = nowInTz(tz)
    if (!opts.force && local.dow !== 1) { omit_no_lunes++; continue }
    if (!opts.force && (local.minutes < horaMin || local.minutes > ventanaMax)) { omit_ventana++; continue }

    const { week, year, periodo } = isoWeek(local.date)
    const { startISO, endISO } = rangoSemana(local.date, tz)

    const { data: instancias, error } = await sb()
      .from('tareas_instancia')
      .select(`id, fecha_limite, estado, usuario_id,
        tareas_plantilla!inner(titulo, frecuencia, categoria),
        usuarios!inner(id, email, nombre, activo)`)
      .eq('base_id', base.id)
      .gte('fecha_limite', startISO).lte('fecha_limite', endISO)
      .in('estado', ['pendiente', 'vencida'])

    if (error) { errores.push(`${base.codigo_iata}: ${error.message}`); continue }

    const filtradas = (instancias ?? []).filter(i =>
      (i as any).tareas_plantilla?.frecuencia === 'semanal'
      && (i as any).usuarios?.activo && (i as any).usuarios?.email
    )

    const porUsuario = new Map<string, { user: any; tasks: Row[] }>()
    for (const i of filtradas) {
      const u = (i as any).usuarios; const t = (i as any).tareas_plantilla
      if (cfg.no_enviar_a.includes(u.email)) continue
      const e = porUsuario.get(u.id) ?? { user: u, tasks: [] }
      e.tasks.push({ id: i.id as string, titulo: t.titulo, fecha_limite: i.fecha_limite as string, categoria: t.categoria ?? null })
      porUsuario.set(u.id, e)
    }

    if (porUsuario.size === 0) { sin_tareas++; continue }

    for (const { user, tasks } of porUsuario.values()) {
      tasks.sort((a,b) => a.fecha_limite.localeCompare(b.fecha_limite))
      if (!opts.force && await alreadySent(user.id, 'digest_semanal', periodo)) { omit_dup++; continue }
      const subject = `[${base.codigo_iata}] Tus tareas semanales · ${periodo}`
      const html = renderHTML(user.nombre ?? 'Storekeeper', base.codigo_iata, periodo, tasks, tz)
      const text = renderTEXT(user.nombre ?? 'Storekeeper', base.codigo_iata, periodo, tasks, tz)
      if (opts.dryRun) { enviadas++; continue }
      const { ok, detail } = await smtpSend([user.email], [], subject, html, text)
      if (ok) { enviadas++; await logEntry(user.id, 'digest_semanal', periodo, 'ok', `${tasks.length} tareas`) }
      else { errores.push(`${base.codigo_iata}/${user.email}: ${detail}`); await logEntry(user.id, 'digest_semanal', periodo, 'error', detail) }
    }
  }

  return { ok: true, enviadas, omit_no_lunes, omit_ventana, omit_dup, sin_tareas, errores: errores.slice(0,20) }
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url)
    const out = await procesar({ force: u.searchParams.get('force')==='1', dryRun: u.searchParams.get('dry_run')==='1' })
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
