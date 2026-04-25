// Supabase Edge Function · send-admin-weekly
// =====================================================
// UN único email semanal a logistics@h-la.es con KPIs:
//  · % cumplimiento de la semana anterior por base
//  · Tareas vencidas con > umbral_critico_dias días
//  · Storekeepers inactivos (sin login en 14+ días)
//  · Top 5 tareas más retrasadas
//
// Se ejecuta cada hora; envía solo lunes 09:00-10:59 UTC y bloquea duplicados
// vía constraint único (destinatario_id, bucket=admin_semanal, periodo=YYYY-Www).

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

function isoWeekOf(d: Date): { year: number; week: number; periodo: string } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dow + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const diff = (t.getTime() - firstThursday.getTime()) / 86400000
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  const year = t.getUTCFullYear()
  return { year, week, periodo: `${year}-W${String(week).padStart(2,'0')}` }
}

async function loadCfg() {
  const { data } = await sb().from('configuracion').select('valor').eq('clave', 'digests').maybeSingle()
  const v = (data?.valor as any) ?? {}
  return {
    enabled: v.enabled !== false,
    admin_weekly_enabled: v.admin_weekly_enabled !== false,
    admin_email: v.admin_email ?? 'logistics@h-la.es',
    umbral_critico_dias: typeof v.umbral_critico_dias === 'number' ? v.umbral_critico_dias : 7,
  }
}

async function alreadySent(destId: string, bucket: string, periodo: string): Promise<boolean> {
  const { data } = await sb().from('notificaciones_log').select('id')
    .eq('destinatario_id', destId).eq('bucket', bucket).eq('periodo', periodo)
    .eq('status', 'ok').maybeSingle()
  return !!data
}
async function logEntry(destId: string, bucket: string, periodo: string, status: 'ok'|'error', detalle: string) {
  await sb().from('notificaciones_log').insert({
    instancia_id: null, destinatario_id: destId, tipo: 'recordatorio_1', canal: 'email',
    status, detalle: detalle.slice(0, 1900), bucket, periodo,
  })
}

async function buildKPIs(cfg: { umbral_critico_dias: number }, periodo: string) {
  // Semana ANTERIOR (lunes-domingo) — la que acaba de cerrar.
  const now = new Date()
  const dow = (now.getUTCDay() + 6) % 7
  const lastMonday = new Date(now); lastMonday.setUTCDate(now.getUTCDate() - dow - 7); lastMonday.setUTCHours(0,0,0,0)
  const lastSunday = new Date(lastMonday); lastSunday.setUTCDate(lastMonday.getUTCDate()+6); lastSunday.setUTCHours(23,59,59,999)

  // Cumplimiento por base
  const { data: bases } = await sb().from('bases').select('id, codigo_iata').eq('activo', true).order('codigo_iata')
  const cumplimiento: Array<{ codigo: string; total: number; completadas: number; pct: number }> = []
  for (const b of bases ?? []) {
    const { count: total } = await sb().from('tareas_instancia').select('*', { count: 'exact', head: true })
      .eq('base_id', b.id).gte('fecha_limite', lastMonday.toISOString()).lte('fecha_limite', lastSunday.toISOString())
    const { count: comp } = await sb().from('tareas_instancia').select('*', { count: 'exact', head: true })
      .eq('base_id', b.id).gte('fecha_limite', lastMonday.toISOString()).lte('fecha_limite', lastSunday.toISOString())
      .in('estado', ['completada','revisada'])
    const t = total ?? 0; const c = comp ?? 0
    cumplimiento.push({ codigo: b.codigo_iata, total: t, completadas: c, pct: t > 0 ? Math.round(c*100/t) : 0 })
  }

  // Vencidas críticas (> umbral_critico_dias)
  const cutoff = new Date(Date.now() - cfg.umbral_critico_dias * 86400000).toISOString()
  const { data: criticas } = await sb()
    .from('tareas_instancia')
    .select(`id, fecha_limite, estado,
      tareas_plantilla!inner(titulo),
      bases!inner(codigo_iata),
      usuarios(nombre)`)
    .lt('fecha_limite', cutoff).in('estado', ['pendiente','vencida'])
    .order('fecha_limite', { ascending: true }).limit(20)

  // Storekeepers inactivos (sin login 14+ días)
  const inactivo = new Date(Date.now() - 14*86400000).toISOString()
  const { data: skInactivos } = await sb().from('usuarios')
    .select('nombre, email, ultimo_login, base_id, bases(codigo_iata)')
    .eq('rol', 'storekeeper').eq('activo', true)
    .or(`ultimo_login.is.null,ultimo_login.lt.${inactivo}`)
    .limit(20)

  // Top 5 más retrasadas (mayor antigüedad de fecha_limite, aún no completada)
  const top5 = (criticas ?? []).slice(0, 5).map(c => ({
    titulo: (c as any).tareas_plantilla?.titulo ?? '—',
    base: (c as any).bases?.codigo_iata ?? '—',
    storekeeper: (c as any).usuarios?.nombre ?? '—',
    dias: Math.floor((Date.now() - new Date(c.fecha_limite as string).getTime()) / 86400000),
  }))

  return { cumplimiento, criticas: criticas ?? [], skInactivos: skInactivos ?? [], top5, periodoAnterior: isoWeekOf(lastMonday).periodo, periodo }
}

function renderHTML(kpis: any): string {
  const kFila = (b: any) => {
    const color = b.pct >= 90 ? '#16a34a' : b.pct >= 70 ? '#ea580c' : '#dc2626'
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${htmlEscape(b.codigo)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">${b.completadas}/${b.total}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${color};">${b.pct}%</td>
    </tr>`
  }
  const tFila = (t: any) => `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${htmlEscape(t.titulo)}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${htmlEscape(t.base)}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${htmlEscape(t.storekeeper)}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#dc2626;">${t.dias}d</td>
  </tr>`
  const sFila = (u: any) => `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${htmlEscape(u.nombre ?? '—')}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${htmlEscape((u.bases as any)?.codigo_iata ?? '—')}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString('es-ES') : 'nunca'}</td>
  </tr>`
  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;"><tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <tr><td style="background:#1e3a8a;color:#fff;padding:20px 24px;font-size:18px;font-weight:600;">StoreControl · KPIs semana ${htmlEscape(kpis.periodoAnterior)}</td></tr>
  <tr><td style="padding:24px;">
    <h3 style="margin:0 0 12px;font-size:16px;color:#111827;">Cumplimiento por base</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
      <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Base</th><th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Completadas</th><th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">%</th></tr></thead>
      <tbody>${kpis.cumplimiento.map(kFila).join('')}</tbody>
    </table>

    <h3 style="margin:24px 0 12px;font-size:16px;color:#111827;">Top 5 tareas más retrasadas</h3>
    ${kpis.top5.length === 0 ? '<p style="color:#16a34a;margin:0;">Sin retrasos críticos.</p>' : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
      <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Tarea</th><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Base</th><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Storekeeper</th><th align="right" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Días</th></tr></thead>
      <tbody>${kpis.top5.map(tFila).join('')}</tbody>
    </table>`}

    <h3 style="margin:24px 0 12px;font-size:16px;color:#111827;">Storekeepers inactivos (14+ días)</h3>
    ${kpis.skInactivos.length === 0 ? '<p style="color:#16a34a;margin:0;">Todos activos.</p>' : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;">
      <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Usuario</th><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Base</th><th align="left" style="padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;">Último login</th></tr></thead>
      <tbody>${kpis.skInactivos.map(sFila).join('')}</tbody>
    </table>`}

    <p style="margin:24px 0 0;"><a href="${APP_URL}/admin/dashboard" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Abrir Dashboard</a></p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Único email semanal admin. Los escalados críticos individuales se enviarán por separado y nunca repetidos.</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

function renderTEXT(kpis: any): string {
  const c = kpis.cumplimiento.map((b: any) => `  ${b.codigo}: ${b.completadas}/${b.total} (${b.pct}%)`).join('\n')
  const t = kpis.top5.length === 0 ? '  (sin retrasos)' : kpis.top5.map((x: any) => `  ${x.dias}d · ${x.titulo} [${x.base}] (${x.storekeeper})`).join('\n')
  return `KPIs StoreControl · semana ${kpis.periodoAnterior}\n\nCumplimiento:\n${c}\n\nTop retrasos:\n${t}\n\nDashboard: ${APP_URL}/admin/dashboard\n`
}

async function procesar(opts: { force?: boolean; dryRun?: boolean }) {
  const cfg = await loadCfg()
  if (!cfg.enabled || !cfg.admin_weekly_enabled) return { skipped: true, reason: 'admin_weekly deshabilitado' }
  const now = new Date()
  // Lunes 09:00-10:59 UTC (≈10-12 Madrid)
  if (!opts.force) {
    if (now.getUTCDay() !== 1) return { skipped: true, reason: 'no es lunes' }
    if (now.getUTCHours() < 9 || now.getUTCHours() > 10) return { skipped: true, reason: 'fuera de ventana 09-11 UTC' }
  }

  const { data: admin } = await sb().from('usuarios').select('id, nombre').eq('email', cfg.admin_email).maybeSingle()
  if (!admin?.id) return { skipped: true, reason: `admin ${cfg.admin_email} no existe en usuarios` }

  const { periodo } = isoWeekOf(now)
  if (!opts.force && await alreadySent(admin.id, 'admin_semanal', periodo)) {
    return { skipped: true, reason: 'ya enviado en este periodo' }
  }

  const kpis = await buildKPIs(cfg, periodo)
  const subject = `[Admin] KPIs StoreControl · semana ${kpis.periodoAnterior}`
  const html = renderHTML(kpis)
  const text = renderTEXT(kpis)

  if (opts.dryRun) return { ok: true, dryRun: true, kpis }

  const { ok, detail } = await smtpSend([cfg.admin_email], [], subject, html, text)
  if (ok) await logEntry(admin.id, 'admin_semanal', periodo, 'ok', `KPIs ${kpis.periodoAnterior}`)
  else await logEntry(admin.id, 'admin_semanal', periodo, 'error', detail)
  return { ok, detail, periodo }
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
