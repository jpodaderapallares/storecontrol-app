-- =============================================================
-- Formatos y Asignaciones de Formatos (Fase 2)
-- =============================================================

-- Tabla de formatos (plantillas de PDF que se asignan)
create table if not exists public.formatos (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  descripcion text,
  codigo text not null unique, -- ej: INV-MENSUAL, REPORT-SEMANAL
  pdf_url text,
  pdf_path text, -- ruta en Storage
  pdf_nombre text,
  version integer default 1,
  categoria text, -- inventarios, reportes, auditorías, etc
  activo boolean default true,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla de asignaciones (qué formato se asigna a quién y con qué frecuencia)
create table if not exists public.asignaciones_formatos (
  id uuid primary key default uuid_generate_v4(),
  formato_id uuid not null references public.formatos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  base_id uuid not null references public.bases(id) on delete cascade,
  frecuencia frecuencia_tarea not null, -- diaria, semanal, mensual, etc
  hora_limite time default '18:00',
  dia_semana smallint, -- 1..7 (solo semanal)
  dia_mes smallint,    -- 1..31 (solo mensual)
  consolidar_recordatorios boolean default true, -- agrupar con otros recordatorios
  activo boolean default true,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(formato_id, usuario_id, base_id)
);

-- Tabla de recordatorios consolidados (para agrupar múltiples formatos en un email)
create table if not exists public.recordatorios_consolidados (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  base_id uuid not null references public.bases(id) on delete cascade,
  fecha_envio date not null,
  hora time default '18:00',
  formatos_ids uuid[] not null default '{}', -- array de formato_id
  instancias_ids uuid[] not null default '{}', -- array de tareas_instancia.id
  estado text default 'pendiente', -- pendiente, enviado, fallido
  enviado_at timestamptz,
  created_at timestamptz default now()
);

-- Índices para performance
create index if not exists idx_asignaciones_usuario on public.asignaciones_formatos(usuario_id);
create index if not exists idx_asignaciones_base on public.asignaciones_formatos(base_id);
create index if not exists idx_asignaciones_formato on public.asignaciones_formatos(formato_id);
create index if not exists idx_recordatorios_usuario on public.recordatorios_consolidados(usuario_id, fecha_envio);
create index if not exists idx_formatos_activos on public.formatos(activo);

-- RLS
alter table public.formatos enable row level security;
alter table public.asignaciones_formatos enable row level security;
alter table public.recordatorios_consolidados enable row level security;

-- Políticas RLS: Formatos
drop policy if exists formatos_read on public.formatos;
create policy formatos_read on public.formatos
  for select using (auth.role() = 'authenticated');
drop policy if exists formatos_admin on public.formatos;
create policy formatos_admin on public.formatos
  for all using (public.es_admin()) with check (public.es_admin());

-- Políticas RLS: Asignaciones (admin todo, storekeeper solo sus asignaciones)
drop policy if exists asignaciones_read on public.asignaciones_formatos;
create policy asignaciones_read on public.asignaciones_formatos
  for select using (
    public.es_admin()
    or usuario_id = auth.uid()
    or base_id = public.mi_base_id()
  );
drop policy if exists asignaciones_admin on public.asignaciones_formatos;
create policy asignaciones_admin on public.asignaciones_formatos
  for all using (public.es_admin()) with check (public.es_admin());

-- Políticas RLS: Recordatorios (admin todo, storekeeper solo propios)
drop policy if exists recordatorios_read on public.recordatorios_consolidados;
create policy recordatorios_read on public.recordatorios_consolidados
  for select using (public.es_admin() or usuario_id = auth.uid());
drop policy if exists recordatorios_insert on public.recordatorios_consolidados;
create policy recordatorios_insert on public.recordatorios_consolidados
  for insert with check (auth.role() = 'authenticated');

-- Storage policy para formatos
create policy if not exists "formatos_read_all"
  on storage.objects for select
  using (bucket_id = 'biblioteca-tecnica' and auth.role() = 'authenticated');

create policy if not exists "formatos_write_admin"
  on storage.objects for insert
  with check (bucket_id = 'biblioteca-tecnica' and public.es_admin());
