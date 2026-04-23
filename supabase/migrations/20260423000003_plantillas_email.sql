-- =============================================================
-- PLANTILLAS DE EMAIL editables por admin
-- Tipos:
--   recordatorio_24h   → aviso 24h antes del vencimiento
--   recordatorio_hoy   → aviso el mismo día del vencimiento (≤ hora_limite)
--   vencida_24h        → aviso 24h después del vencimiento (CC admin)
--   escalado_admin     → notificación directa al admin si sigue sin hacer +48h
-- =============================================================

create table if not exists public.plantillas_email (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null unique,
  asunto text not null,
  cuerpo_html text not null,
  cuerpo_texto text,                -- fallback texto plano
  cc_admin boolean default false,   -- si true, se añade email_admin en CC
  activo boolean default true,
  descripcion text,
  variables_disponibles text[] default array[
    'nombre_storekeeper','email_storekeeper','base_codigo','base_nombre',
    'titulo_tarea','descripcion_tarea','fecha_limite','fecha_limite_corta',
    'horas_restantes','horas_vencida','link_app','pdf_formato_url',
    'nombre_admin','email_admin','empresa_nombre'
  ],
  updated_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.plantillas_email enable row level security;

drop policy if exists plantillas_read on public.plantillas_email;
create policy plantillas_read on public.plantillas_email
  for select using (auth.role() = 'authenticated');

drop policy if exists plantillas_write on public.plantillas_email;
create policy plantillas_write on public.plantillas_email
  for all using (public.es_admin()) with check (public.es_admin());

-- SEEDS por defecto
insert into public.plantillas_email (tipo, asunto, cuerpo_html, cuerpo_texto, cc_admin, descripcion) values
(
  'recordatorio_24h',
  '[StoreControl] Recordatorio: {{titulo_tarea}} vence mañana',
  '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#0f172a">Hola {{nombre_storekeeper}},</h2>
    <p>Este es un recordatorio de que debes completar el siguiente formato en la base <strong>{{base_codigo}}</strong>:</p>
    <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
      <div style="font-size:18px;font-weight:bold">{{titulo_tarea}}</div>
      <div style="color:#64748b;margin-top:4px">{{descripcion_tarea}}</div>
      <div style="margin-top:8px">📅 <strong>Fecha límite:</strong> {{fecha_limite}}</div>
    </div>
    <p>Puedes descargar la plantilla del formato y subir el PDF completado desde la app:</p>
    <p><a href="{{link_app}}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Abrir StoreControl</a></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:12px;color:#94a3b8">{{empresa_nombre}} · Email automático. Por favor no respondas a este mensaje.</p>
  </div>',
  'Hola {{nombre_storekeeper}},\n\nRecordatorio: debes completar "{{titulo_tarea}}" en {{base_codigo}} antes de {{fecha_limite}}.\n\nEntra en {{link_app}} para subir el PDF.\n\n— {{empresa_nombre}}',
  false,
  'Se envía 24h antes del vencimiento.'
),
(
  'recordatorio_hoy',
  '[StoreControl] HOY vence: {{titulo_tarea}} en {{base_codigo}}',
  '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#b91c1c">⏰ {{nombre_storekeeper}}, vence hoy</h2>
    <p>Tienes <strong>{{horas_restantes}} horas</strong> para completar:</p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0">
      <div style="font-size:18px;font-weight:bold">{{titulo_tarea}}</div>
      <div style="color:#64748b;margin-top:4px">Base: <strong>{{base_codigo}}</strong> · {{base_nombre}}</div>
      <div style="margin-top:8px">📅 <strong>Hora límite:</strong> {{fecha_limite_corta}}</div>
    </div>
    <p><a href="{{link_app}}" style="background:#dc2626;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Completar ahora</a></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:12px;color:#94a3b8">{{empresa_nombre}} · Email automático.</p>
  </div>',
  'AVISO URGENTE: "{{titulo_tarea}}" vence hoy a las {{fecha_limite_corta}} en {{base_codigo}}. Entra en {{link_app}} para completarlo.',
  false,
  'Se envía el mismo día, cuando faltan horas para el vencimiento.'
),
(
  'vencida_24h',
  '[StoreControl] VENCIDA sin completar: {{titulo_tarea}} · {{base_codigo}}',
  '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#b91c1c">⚠️ Tarea VENCIDA sin completar</h2>
    <p>Hola {{nombre_storekeeper}},</p>
    <p>La siguiente tarea <strong>ha vencido hace {{horas_vencida}} horas</strong> y sigue sin completarse:</p>
    <div style="background:#fef2f2;border:1px solid #dc2626;padding:16px;border-radius:8px;margin:16px 0">
      <div style="font-size:18px;font-weight:bold">{{titulo_tarea}}</div>
      <div style="color:#64748b;margin-top:4px">Base: <strong>{{base_codigo}}</strong></div>
      <div style="margin-top:8px">📅 <strong>Venció el:</strong> {{fecha_limite}}</div>
    </div>
    <p>Por favor, complétala lo antes posible. Este retraso ha sido notificado al responsable ({{nombre_admin}}).</p>
    <p><a href="{{link_app}}" style="background:#dc2626;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Completar con retraso</a></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:12px;color:#94a3b8">{{empresa_nombre}} · Con copia a {{email_admin}}</p>
  </div>',
  'TAREA VENCIDA: "{{titulo_tarea}}" lleva {{horas_vencida}}h sin completar en {{base_codigo}}. Se ha notificado al admin. Completar en {{link_app}}',
  true,
  'Se envía 24h después del vencimiento si la tarea sigue pendiente. Con CC al admin.'
),
(
  'escalado_admin',
  '[StoreControl] ESCALADO: {{nombre_storekeeper}} lleva 48h sin completar {{titulo_tarea}}',
  '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#b91c1c">🚨 Escalado de cumplimiento</h2>
    <p>Hola {{nombre_admin}},</p>
    <p>El storekeeper <strong>{{nombre_storekeeper}}</strong> ({{email_storekeeper}}) lleva <strong>más de 48 horas</strong> sin completar:</p>
    <div style="background:#fef2f2;border:2px solid #dc2626;padding:16px;border-radius:8px;margin:16px 0">
      <div style="font-size:18px;font-weight:bold">{{titulo_tarea}}</div>
      <div style="color:#64748b;margin-top:4px">Base: <strong>{{base_codigo}}</strong> · {{base_nombre}}</div>
      <div style="margin-top:8px">📅 Venció: {{fecha_limite}} (hace {{horas_vencida}}h)</div>
    </div>
    <p>Se han enviado 3 recordatorios previos al storekeeper sin éxito. Procede con el seguimiento disciplinario correspondiente.</p>
    <p><a href="{{link_app}}" style="background:#0f172a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Revisar en StoreControl</a></p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:12px;color:#94a3b8">{{empresa_nombre}}</p>
  </div>',
  'ESCALADO: {{nombre_storekeeper}} lleva 48h sin completar "{{titulo_tarea}}" en {{base_codigo}}. Revisar en {{link_app}}',
  false,
  'Se envía SÓLO al admin cuando el retraso supera 48h. Registra el incumplimiento.'
)
on conflict (tipo) do nothing;
