// Tipos del esquema Supabase (simplificado — generar con `supabase gen types` en prod)

export type RolUsuario = 'admin' | 'storekeeper'
export type Frecuencia = 'diaria' | 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type FrecuenciaTarea = 'diaria' | 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type EstadoInstancia = 'pendiente' | 'completada' | 'vencida' | 'revisada' | 'desasignada'
export type EvidenciaTipo = 'pdf' | 'foto' | 'cualquiera' | 'no_requerida'
export type TipoNotificacion = 'recordatorio_1' | 'recordatorio_2' | 'vencimiento' | 'escalado'

export interface Base {
  id: string
  codigo_iata: string
  nombre_completo: string
  pais: string
  zona_horaria: string
  activo: boolean
  created_at: string
}

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: RolUsuario
  base_id: string | null
  activo: boolean
  ultimo_login: string | null
  created_at: string
}

export interface BibliotecaDoc {
  id: string
  titulo: string
  referencia: string
  categoria: string
  version: number
  fecha_revision: string
  emisor: string | null
  pdf_url: string | null
  pdf_path: string | null
  activo: boolean
  created_at: string
  created_by: string | null
}

export interface TareaPlantilla {
  id: string
  titulo: string
  descripcion: string | null
  frecuencia: Frecuencia
  hora_limite: string
  dia_semana: number | null
  dia_mes: number | null
  mes_anual: number | null
  bases_asignadas: string[]
  evidencia_requerida: EvidenciaTipo
  procedimiento_bt_id: string | null
  categoria: string | null
  activo: boolean
  formato_id: string | null
  origen_asignacion_id: string | null
  created_at: string
  updated_at: string
}

export interface TareaInstancia {
  id: string
  plantilla_id: string
  base_id: string
  usuario_id: string | null
  fecha_asignada: string
  fecha_limite: string
  estado: EstadoInstancia
  fecha_completada: string | null
  pdf_url: string | null
  pdf_path: string | null
  pdf_nombre: string | null
  notas: string | null
  created_at: string
  // Relaciones opcionales
  tareas_plantilla?: TareaPlantilla
  bases?: Base
}

export interface NotificacionLog {
  id: string
  instancia_id: string | null
  destinatario_id: string | null
  tipo: TipoNotificacion
  canal: 'email' | 'push' | 'in_app'
  enviado_at: string
  status: string
  detalle: string | null
}

export interface AuditEvento {
  id: string
  usuario_id: string | null
  accion: string
  entidad: string | null
  entidad_id: string | null
  base_id: string | null
  timestamp: string
  ip: string | null
  metadata_json: Record<string, any> | null
}

export interface Formato {
  id: string
  titulo: string
  descripcion: string | null
  codigo: string
  pdf_url: string | null
  pdf_path: string | null
  pdf_nombre: string | null
  version: number
  categoria: string | null
  activo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AsignacionFormato {
  id: string
  formato_id: string
  usuario_id: string
  base_id: string
  frecuencia: FrecuenciaTarea
  hora_limite: string
  dia_semana: number | null
  dia_mes: number | null
  mes_anual: number | null
  consolidar_recordatorios: boolean
  activo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PlantillaEmail {
  id: string
  tipo: 'recordatorio_24h' | 'recordatorio_hoy' | 'vencida_24h' | 'escalado_admin'
  asunto: string
  cuerpo_html: string
  cuerpo_texto: string | null
  cc_admin: boolean
  activo: boolean
  descripcion: string | null
  variables_disponibles: string[]
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface RecordatorioConsolidado {
  id: string
  usuario_id: string
  base_id: string
  fecha_envio: string
  hora: string
  formatos_ids: string[]
  instancias_ids: string[]
  estado: 'pendiente' | 'enviado' | 'fallido'
  enviado_at: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      bases: { Row: Base; Insert: Partial<Base>; Update: Partial<Base> }
      usuarios: { Row: Usuario; Insert: Partial<Usuario>; Update: Partial<Usuario> }
      biblioteca_tecnica: { Row: BibliotecaDoc; Insert: Partial<BibliotecaDoc>; Update: Partial<BibliotecaDoc> }
      tareas_plantilla: { Row: TareaPlantilla; Insert: Partial<TareaPlantilla>; Update: Partial<TareaPlantilla> }
      tareas_instancia: { Row: TareaInstancia; Insert: Partial<TareaInstancia>; Update: Partial<TareaInstancia> }
      notificaciones_log: { Row: NotificacionLog; Insert: Partial<NotificacionLog>; Update: Partial<NotificacionLog> }
      audit_log: { Row: AuditEvento; Insert: Partial<AuditEvento>; Update: never }
      configuracion: {
        Row: { clave: string; valor: any; descripcion: string | null; updated_at: string }
        Insert: { clave: string; valor: any; descripcion?: string | null }
        Update: { valor?: any; descripcion?: string | null }
      }
      formatos: { Row: Formato; Insert: Partial<Formato>; Update: Partial<Formato> }
      asignaciones_formatos: { Row: AsignacionFormato; Insert: Partial<AsignacionFormato>; Update: Partial<AsignacionFormato> }
      recordatorios_consolidados: { Row: RecordatorioConsolidado; Insert: Partial<RecordatorioConsolidado>; Update: Partial<RecordatorioConsolidado> }
      plantillas_email: { Row: PlantillaEmail; Insert: Partial<PlantillaEmail>; Update: Partial<PlantillaEmail> }
    }
  }
}
