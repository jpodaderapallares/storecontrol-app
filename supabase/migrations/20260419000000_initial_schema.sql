-- =============================================================
-- StoreControl — Esquema inicial
-- EASA Part 145 · Logística HLA · 16 bases distribuidas
-- =============================================================

-- Extensiones
create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;

-- =============================================================
-- TIPOS ENUM
-- =============================================================
do $$ begin
  create type rol_usuario as enum ('admin', 'storekeeper');
exception when duplicate_object then null; end $$;

do $$ begin
  create type frecuencia_tarea as enum ('diaria', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_instancia as enum ('pendiente', 'completada', 'vencida', 'revisada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidencia_tipo as enum ('pdf', 'foto', 'cualquiera', 'no_requerida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_notificacion as enum ('recordatorio_1', 'recordatorio_2', 'vencimiento', 'escalado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type canal_notificacion as enum ('email', 'push', 'in_app');
exception when duplicate_object then null; end $$;

-- =============================================================
-- TABLAS
-- =============================================================

create table if not exists public.bases (
  id uuid primary key default uuid_generate_v4(),
  codigo_iata text not null unique,
  nombre_completo text not null,
  pais text default 'ES',
  zona_horaria text default 'Europe/Madrid',
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.usuarios (
  id uuid primary key, -- coincide con auth.users.id
  nombre text not null,
  email text not null unique,
  rol rol_usuario not null default 'storekeeper',
  base_id uuid references public.bases(id) on delete set null,
  activo boolean default true,
  ultimo_login timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.biblioteca_tecnica (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  referencia text not null unique,
  categoria text not null,
  version integer default 1,
  fecha_revision date default current_date,
  emisor text,
  pdf_url text,
  pdf_path text, -- ruta en Storage bucket biblioteca-tecnica
  activo boolean default true,
  created_at timestamptz default now(),
  created_by uuid references public.usuarios(id)
);

create table if not exists public.tareas_plantilla (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  descripcion text,
  frecuencia frecuencia_tarea not null,
  hora_limite time default '18:00',
  dia_semana smallint, -- 1..7 (solo semanal)
  dia_mes smallint,    -- 1..31 (solo mensual)
  bases_asignadas uuid[] not null default '{}',
  evidencia_requerida evidencia_tipo not null default 'pdf',
  procedimiento_bt_id uuid references public.biblioteca_tecnica(id) on delete set null,
  categoria text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tareas_instancia (
  id uuid primary key default uuid_generate_v4(),
  plantilla_id uuid not null references public.tareas_plantilla(id) on delete cascade,
  base_id uuid not null references public.bases(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha_asignada date not null,
  fecha_limite timestamptz not null,
  estado estado_instancia not null default 'pendiente',
  fecha_completada timestamptz,
  pdf_url text,
  pdf_path text,
  pdf_nombre text,
  notas text,
  created_at timestamptz default now()
);

create index if not exists idx_instancia_base on public.tareas_instancia (base_id, fecha_asignada);
create index if not exists idx_instancia_estado on public.tareas_instancia (estado);
create index if not exists idx_instancia_plantilla on public.tareas_instancia (plantilla_id);

create table if not exists public.notificaciones_log (
  id uuid primary key default uuid_generate_v4(),
  instancia_id uuid references public.tareas_instancia(id) on delete cascade,
  destinatario_id uuid references public.usuarios(id),
  tipo tipo_notificacion not null,
  canal canal_notificacion not null default 'email',
  enviado_at timestamptz default now(),
  status text default 'ok',
  detalle text
);

create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  accion text not null,
  entidad text,
  entidad_id uuid,
  base_id uuid references public.bases(id) on delete set null,
  timestamp timestamptz default now(),
  ip text,
  metadata_json jsonb
);

create index if not exists idx_audit_timestamp on public.audit_log (timestamp desc);
create index if not exists idx_audit_usuario on public.audit_log (usuario_id);

create table if not exists public.configuracion (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  updated_at timestamptz default now()
);

-- =============================================================
-- REGLAS DE INMUTABILIDAD (trigger)
-- =============================================================

create or replace function public.prevenir_modif_audit()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log es inmutable. Solo se permiten INSERT.';
end; $$;

drop trigger if exists trg_audit_inmutable on public.audit_log;
create trigger trg_audit_inmutable
  before update or delete on public.audit_log
  for each row execute function public.prevenir_modif_audit();

create or replace function public.prevenir_borrar_instancia_completada()
returns trigger language plpgsql as $$
begin
  if old.estado = 'completada' then
    raise exception 'No se pueden borrar tareas completadas (trazabilidad EASA).';
  end if;
  return old;
end; $$;

drop trigger if exists trg_instancia_no_borrar on public.tareas_instancia;
create trigger trg_instancia_no_borrar
  before delete on public.tareas_instancia
  for each row execute function public.prevenir_borrar_instancia_completada();

-- =============================================================
-- HELPERS
-- =============================================================

create or replace function public.es_admin()
returns boolean language sql stable as $$
  select exists(select 1 from public.usuarios where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.mi_base_id()
returns uuid language sql stable as $$
  select base_id from public.usuarios where id = auth.uid();
$$;

-- =============================================================
-- RLS
-- =============================================================

alter table public.bases enable row level security;
alter table public.usuarios enable row level security;
alter table public.biblioteca_tecnica enable row level security;
alter table public.tareas_plantilla enable row level security;
alter table public.tareas_instancia enable row level security;
alter table public.notificaciones_log enable row level security;
alter table public.audit_log enable row level security;
alter table public.configuracion enable row level security;

-- Bases: lectura autenticados
drop policy if exists bases_read on public.bases;
create policy bases_read on public.bases
  for select using (auth.role() = 'authenticated');
drop policy if exists bases_admin_write on public.bases;
create policy bases_admin_write on public.bases
  for all using (public.es_admin()) with check (public.es_admin());

-- Usuarios: admin todo; storekeeper solo se ve a sí mismo
drop policy if exists usuarios_self on public.usuarios;
create policy usuarios_self on public.usuarios
  for select using (id = auth.uid() or public.es_admin());
drop policy if exists usuarios_admin_all on public.usuarios;
create policy usuarios_admin_all on public.usuarios
  for all using (public.es_admin()) with check (public.es_admin());

-- Biblioteca técnica: lectura todos autenticados, escritura admin
drop policy if exists bt_read on public.biblioteca_tecnica;
create policy bt_read on public.biblioteca_tecnica
  for select using (auth.role() = 'authenticated');
drop policy if exists bt_admin on public.biblioteca_tecnica;
create policy bt_admin on public.biblioteca_tecnica
  for all using (public.es_admin()) with check (public.es_admin());

-- Plantillas: lectura todos autenticados, escritura admin
drop policy if exists plantillas_read on public.tareas_plantilla;
create policy plantillas_read on public.tareas_plantilla
  for select using (auth.role() = 'authenticated');
drop policy if exists plantillas_admin on public.tareas_plantilla;
create policy plantillas_admin on public.tareas_plantilla
  for all using (public.es_admin()) with check (public.es_admin());

-- Instancias: storekeeper solo su base, admin todo
drop policy if exists instancia_read on public.tareas_instancia;
create policy instancia_read on public.tareas_instancia
  for select using (public.es_admin() or base_id = public.mi_base_id());
drop policy if exists instancia_update on public.tareas_instancia;
create policy instancia_update on public.tareas_instancia
  for update using (public.es_admin() or base_id = public.mi_base_id())
  with check (public.es_admin() or base_id = public.mi_base_id());
drop policy if exists instancia_admin_insert on public.tareas_instancia;
create policy instancia_admin_insert on public.tareas_instancia
  for insert with check (public.es_admin());

-- Notificaciones log: solo lectura admin y propias, sin edición
drop policy if exists notif_read on public.notificaciones_log;
create policy notif_read on public.notificaciones_log
  for select using (public.es_admin() or destinatario_id = auth.uid());
drop policy if exists notif_insert on public.notificaciones_log;
create policy notif_insert on public.notificaciones_log
  for insert with check (auth.role() = 'authenticated');

-- Audit log: lectura admin, insert todos, nunca update/delete (trigger bloquea)
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select using (public.es_admin());
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (auth.role() = 'authenticated');

-- Configuración: lectura todos, escritura admin
drop policy if exists conf_read on public.configuracion;
create policy conf_read on public.configuracion
  for select using (auth.role() = 'authenticated');
drop policy if exists conf_admin on public.configuracion;
create policy conf_admin on public.configuracion
  for all using (public.es_admin()) with check (public.es_admin());

-- =============================================================
-- STORAGE BUCKETS (crear manualmente si no existen)
-- =============================================================
insert into storage.buckets (id, name, public)
values
  ('evidencias-tareas', 'evidencias-tareas', false),
  ('biblioteca-tecnica', 'biblioteca-tecnica', false)
on conflict (id) do nothing;

-- Políticas Storage: evidencias — cada storekeeper sube/lee las de su base
create policy if not exists "evid_read"
  on storage.objects for select
  using (
    bucket_id = 'evidencias-tareas'
    and (
      public.es_admin()
      or (split_part(name, '/', 1))::uuid = public.mi_base_id()
    )
  );

create policy if not exists "evid_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias-tareas'
    and (
      public.es_admin()
      or (split_part(name, '/', 1))::uuid = public.mi_base_id()
    )
  );

-- Biblioteca técnica — lectura todos autenticados, escritura admin
create policy if not exists "bt_read_all"
  on storage.objects for select
  using (bucket_id = 'biblioteca-tecnica' and auth.role() = 'authenticated');

create policy if not exists "bt_write_admin"
  on storage.objects for insert
  with check (bucket_id = 'biblioteca-tecnica' and public.es_admin());

-- =============================================================
-- FUNCIÓN PARA GENERAR INSTANCIAS (próximos 30 días)
-- =============================================================

create or replace function public.generar_instancias_30d(p_plantilla uuid)
returns integer language plpgsql as $$
declare
  v_plantilla public.tareas_plantilla%rowtype;
  v_base uuid;
  v_fecha date;
  v_fecha_limite timestamptz;
  v_count integer := 0;
  v_i integer;
begin
  select * into v_plantilla from public.tareas_plantilla where id = p_plantilla;
  if v_plantilla.id is null or v_plantilla.activo = false then return 0; end if;

  foreach v_base in array v_plantilla.bases_asignadas loop
    v_i := 0;
    while v_i <= 30 loop
      v_fecha := current_date + v_i;
      if v_plantilla.frecuencia = 'diaria' then
        -- incluir todos los días
      elsif v_plantilla.frecuencia = 'semanal' then
        if extract(isodow from v_fecha)::int <> coalesce(v_plantilla.dia_semana, 1) then
          v_i := v_i + 1; continue;
        end if;
      elsif v_plantilla.frecuencia = 'mensual' then
        if extract(day from v_fecha)::int <> coalesce(v_plantilla.dia_mes, 1) then
          v_i := v_i + 1; continue;
        end if;
      else
        -- frecuencias > mensual: solo generar primera ocurrencia futura
        if v_i <> 0 then v_i := v_i + 1; continue; end if;
      end if;

      v_fecha_limite := (v_fecha::timestamp + v_plantilla.hora_limite) at time zone 'Europe/Madrid';

      insert into public.tareas_instancia
        (plantilla_id, base_id, fecha_asignada, fecha_limite, estado)
      select p_plantilla, v_base, v_fecha, v_fecha_limite, 'pendiente'
      where not exists (
        select 1 from public.tareas_instancia
        where plantilla_id = p_plantilla and base_id = v_base and fecha_asignada = v_fecha
      );
      if found then v_count := v_count + 1; end if;
      v_i := v_i + 1;
    end loop;
  end loop;
  return v_count;
end; $$;

-- =============================================================
-- FUNCIÓN MARCAR VENCIDAS (se ejecuta por cron cada 15 min)
-- =============================================================

create or replace function public.marcar_instancias_vencidas()
returns integer language plpgsql as $$
declare
  v_count integer;
begin
  update public.tareas_instancia
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_limite < now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
