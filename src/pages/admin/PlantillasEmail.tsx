import { useEffect, useState } from 'react'
import { supabase, logAccion } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import { Save, Mail, Eye, Code } from 'lucide-react'
import type { PlantillaEmail } from '@/lib/database.types'

const TIPO_INFO: Record<PlantillaEmail['tipo'], { label: string; when: string; who: string }> = {
  recordatorio_24h: {
    label: 'Recordatorio 24h antes',
    when: 'Se envía 20-28h antes del vencimiento.',
    who: 'Destinatario: storekeeper asignado.',
  },
  recordatorio_hoy: {
    label: 'Aviso el mismo día',
    when: 'Se envía 0-4h antes del vencimiento.',
    who: 'Destinatario: storekeeper asignado.',
  },
  vencida_24h: {
    label: 'Tarea vencida 24h sin hacer',
    when: 'Se envía 24h después del vencimiento si sigue pendiente.',
    who: 'Destinatarios: storekeeper + CC admin.',
  },
  escalado_admin: {
    label: 'Escalado al admin 48h',
    when: 'Se envía 48h después del vencimiento si sigue sin completarse.',
    who: 'Destinatario: admin (solo).',
  },
}

const VARIABLES: Array<{ nombre: string; descripcion: string }> = [
  { nombre: 'nombre_storekeeper', descripcion: 'Nombre del storekeeper' },
  { nombre: 'email_storekeeper', descripcion: 'Email del storekeeper' },
  { nombre: 'base_codigo', descripcion: 'Código IATA (PMI, BCN...)' },
  { nombre: 'base_nombre', descripcion: 'Nombre completo de la base' },
  { nombre: 'titulo_tarea', descripcion: 'Título del formato/tarea' },
  { nombre: 'descripcion_tarea', descripcion: 'Descripción de la tarea' },
  { nombre: 'fecha_limite', descripcion: 'Fecha y hora límite completa' },
  { nombre: 'fecha_limite_corta', descripcion: 'Solo la hora (HH:mm)' },
  { nombre: 'horas_restantes', descripcion: 'Horas que faltan para el vencimiento' },
  { nombre: 'horas_vencida', descripcion: 'Horas que lleva vencida' },
  { nombre: 'link_app', descripcion: 'URL de la app' },
  { nombre: 'pdf_formato_url', descripcion: 'URL firmada al PDF del formato' },
  { nombre: 'nombre_admin', descripcion: 'Nombre del admin responsable' },
  { nombre: 'email_admin', descripcion: 'Email del admin' },
  { nombre: 'empresa_nombre', descripcion: 'Nombre de la empresa' },
]

export default function PlantillasEmail() {
  const { usuario } = useAuth()
  const [plantillas, setPlantillas] = useState<PlantillaEmail[]>([])
  const [seleccionada, setSeleccionada] = useState<PlantillaEmail | null>(null)
  const [vista, setVista] = useState<'html' | 'preview'>('html')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('plantillas_email').select('*').order('tipo')
    setPlantillas(data ?? [])
    if (data && data.length && !seleccionada) setSeleccionada(data[0])
  }

  async function guardar() {
    if (!seleccionada) return
    setGuardando(true)
    setGuardado(false)
    const { error } = await supabase
      .from('plantillas_email')
      .update({
        asunto: seleccionada.asunto,
        cuerpo_html: seleccionada.cuerpo_html,
        cuerpo_texto: seleccionada.cuerpo_texto,
        cc_admin: seleccionada.cc_admin,
        activo: seleccionada.activo,
        updated_by: usuario?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', seleccionada.id)

    setGuardando(false)
    if (!error) {
      setGuardado(true)
      await logAccion('plantilla_email_actualizada', 'plantillas_email', seleccionada.id, {
        tipo: seleccionada.tipo,
      })
      setTimeout(() => setGuardado(false), 2500)
      cargar()
    } else {
      alert('Error al guardar: ' + error.message)
    }
  }

  function actualizar<K extends keyof PlantillaEmail>(campo: K, valor: PlantillaEmail[K]) {
    if (!seleccionada) return
    setSeleccionada({ ...seleccionada, [campo]: valor })
  }

  // Preview con variables de ejemplo
  function renderPreview(html: string): string {
    const ejemplos: Record<string, string> = {
      nombre_storekeeper: 'Juan García',
      email_storekeeper: 'stores.pmi@h-la.es',
      base_codigo: 'PMI',
      base_nombre: 'PMI — Palma Son Sant Joan',
      titulo_tarea: 'HLA-INVENTORY-PANEL-AGP',
      descripcion_tarea: 'Revisión mensual del inventario del panel',
      fecha_limite: '25/04/2026, 18:00',
      fecha_limite_corta: '18:00',
      horas_restantes: '22',
      horas_vencida: '26',
      link_app: 'https://storecontrol-app.vercel.app',
      pdf_formato_url: '#',
      nombre_admin: 'Julio Podadera',
      email_admin: 'logistics@h-la.es',
      empresa_nombre: 'HLA Logística',
    }
    return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => ejemplos[k] ?? `{{${k}}}`)
  }

  if (!seleccionada) return <div className="text-slate-500 text-sm">Cargando plantillas…</div>

  return (
    <>
      <PageHeader
        title="Plantillas de email"
        subtitle="Edita los correos automáticos que se envían a storekeepers y admin"
      />

      <div className="grid grid-cols-[260px_1fr] gap-6">
        {/* Sidebar con tipos */}
        <div className="space-y-2">
          {plantillas.map(p => {
            const info = TIPO_INFO[p.tipo]
            const sel = seleccionada.id === p.id
            return (
              <button
                key={p.id}
                onClick={() => setSeleccionada(p)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  sel
                    ? 'border-accent bg-accent/10 text-slate-100'
                    : 'border-bg-border hover:bg-bg-elevated'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{info?.label ?? p.tipo}</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-snug">{info?.when}</div>
                  </div>
                  {!p.activo && <span className="pill-pend text-[10px]">Off</span>}
                </div>
              </button>
            )
          })}
        </div>

        {/* Editor */}
        <div className="space-y-4">
          <div className="surface p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-lg font-bold">
                  {TIPO_INFO[seleccionada.tipo]?.label}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {TIPO_INFO[seleccionada.tipo]?.when} · {TIPO_INFO[seleccionada.tipo]?.who}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={seleccionada.activo}
                  onChange={e => actualizar('activo', e.target.checked)}
                />
                Activa
              </label>
            </div>

            <div>
              <label className="label">Asunto *</label>
              <input
                className="input w-full mt-1 font-mono text-sm"
                value={seleccionada.asunto}
                onChange={e => actualizar('asunto', e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={seleccionada.cc_admin}
                onChange={e => actualizar('cc_admin', e.target.checked)}
              />
              Añadir al admin en CC
            </label>

            {/* Tabs HTML / Preview */}
            <div className="flex gap-1 border-b border-bg-border">
              <button
                className={`px-3 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
                  vista === 'html' ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setVista('html')}
              >
                <Code className="w-4 h-4" /> HTML
              </button>
              <button
                className={`px-3 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
                  vista === 'preview' ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setVista('preview')}
              >
                <Eye className="w-4 h-4" /> Vista previa
              </button>
            </div>

            {vista === 'html' ? (
              <textarea
                className="input w-full font-mono text-xs min-h-[320px]"
                value={seleccionada.cuerpo_html}
                onChange={e => actualizar('cuerpo_html', e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="bg-white rounded-lg p-4 min-h-[320px] overflow-auto">
                <iframe
                  title="Vista previa del email"
                  srcDoc={renderPreview(seleccionada.cuerpo_html)}
                  className="w-full min-h-[300px] border-0"
                />
              </div>
            )}

            <div>
              <label className="label">Cuerpo de texto plano (fallback)</label>
              <textarea
                className="input w-full mt-1 font-mono text-xs min-h-[100px]"
                value={seleccionada.cuerpo_texto ?? ''}
                onChange={e => actualizar('cuerpo_texto', e.target.value)}
                placeholder="Versión en texto plano para clientes de email que no renderizan HTML"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-bg-border">
              {guardado && <span className="text-success text-sm self-center">✓ Guardado</span>}
              <button className="btn-primary" onClick={guardar} disabled={guardando}>
                <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>

          {/* Variables disponibles */}
          <div className="surface p-5">
            <div className="font-display text-sm font-bold mb-3">
              Variables disponibles (click para copiar)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {VARIABLES.map(v => (
                <button
                  key={v.nombre}
                  onClick={() => navigator.clipboard?.writeText(`{{${v.nombre}}}`)}
                  className="text-left p-2 rounded border border-bg-border hover:bg-bg-elevated transition-colors"
                  title="Copiar al portapapeles"
                >
                  <div className="font-mono text-xs text-accent">{`{{${v.nombre}}}`}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{v.descripcion}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
