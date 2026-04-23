-- =============================================================
-- UNIFICACIÓN formatos ↔ tareas
-- Cada asignacion_formato se refleja como una tareas_plantilla "espejo"
-- vía triggers, para reutilizar el motor de tareas_instancia,
-- notificaciones_log, Edge Functions y UI storekeeper existentes.
-- =============================================================

-- 1. Enlazar tareas_plantilla con formatos (opcional)
alter table public.tareas_plantilla
  add column if not exists formato_id uuid references public.formatos(id) on delete set null,
  add column if not exists origen_asignacion_id uuid references public.asignaciones_formatos(id) on delete cascade,
  add column if not exists mes_anual smallint check (mes_anual between 1 and 12);

-- También en asignaciones_formatos (fuente de verdad de cara a admin)
alter table public.asignaciones_formatos
  add column if not exists mes_anual smallint check (mes_anual between 1 and 12);

create unique index if not exists idx_plantilla_origen_asignacion_unique
  on public.tareas_plantilla(origen_asignacion_id)
  where origen_asignacion_id is not null;

create index if not exists idx_plantilla_formato on public.tareas_plantilla(formato_id);

-- 2. Evitar instancias duplicadas (fundamental para upsert en generar_instancias)
create unique index if not exists idx_instancia_unique_dia
  on public.tareas_instancia(plantilla_id, base_id, fecha_asignada);

-- 3. Trigger: sincroniza cada asignacion_formato → tareas_plantilla espejo
create or replace function public.sync_asignacion_to_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  fmt_titulo text;
  fmt_descripcion text;
  fmt_categoria text;
begin
  if (TG_OP = 'DELETE') then
    -- Borrar la plantilla espejo (las instancias caen en cascada)
    delete from public.tareas_plantilla where origen_asignacion_id = OLD.id;
    return OLD;
  end if;

  -- INSERT o UPDATE: recuperar datos del formato
  select titulo, descripcion, categoria
    into fmt_titulo, fmt_descripcion, fmt_categoria
    from public.formatos
   where id = NEW.formato_id;

  if fmt_titulo is null then
    raise exception 'Formato % no encontrado', NEW.formato_id;
  end if;

  if (TG_OP = 'INSERT') then
    insert into public.tareas_plantilla (
      titulo, descripcion, frecuencia, hora_limite, dia_semana, dia_mes, mes_anual,
      bases_asignadas, evidencia_requerida, categoria, activo,
      formato_id, origen_asignacion_id
    ) values (
      fmt_titulo,
      coalesce(fmt_descripcion, 'Rellenar formato ' || fmt_titulo),
      NEW.frecuencia,
      NEW.hora_limite,
      NEW.dia_semana,
      NEW.dia_mes,
      NEW.mes_anual,
      array[NEW.base_id]::uuid[],
      'pdf'::evidencia_tipo,
      coalesce(fmt_categoria, 'formato'),
      NEW.activo,
      NEW.formato_id,
      NEW.id
    );
  else
    -- UPDATE
    update public.tareas_plantilla set
      titulo = fmt_titulo,
      descripcion = coalesce(fmt_descripcion, 'Rellenar formato ' || fmt_titulo),
      frecuencia = NEW.frecuencia,
      hora_limite = NEW.hora_limite,
      dia_semana = NEW.dia_semana,
      dia_mes = NEW.dia_mes,
      mes_anual = NEW.mes_anual,
      bases_asignadas = array[NEW.base_id]::uuid[],
      categoria = coalesce(fmt_categoria, 'formato'),
      activo = NEW.activo,
      formato_id = NEW.formato_id,
      updated_at = now()
    where origen_asignacion_id = NEW.id;

    -- Si no existía espejo (caso raro), crearlo
    if not found then
      insert into public.tareas_plantilla (
        titulo, descripcion, frecuencia, hora_limite, dia_semana, dia_mes, mes_anual,
        bases_asignadas, evidencia_requerida, categoria, activo,
        formato_id, origen_asignacion_id
      ) values (
        fmt_titulo,
        coalesce(fmt_descripcion, 'Rellenar formato ' || fmt_titulo),
        NEW.frecuencia, NEW.hora_limite, NEW.dia_semana, NEW.dia_mes, NEW.mes_anual,
        array[NEW.base_id]::uuid[], 'pdf'::evidencia_tipo,
        coalesce(fmt_categoria, 'formato'),
        NEW.activo, NEW.formato_id, NEW.id
      );
    end if;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_sync_asignacion_to_plantilla on public.asignaciones_formatos;
create trigger trg_sync_asignacion_to_plantilla
  after insert or update or delete on public.asignaciones_formatos
  for each row execute function public.sync_asignacion_to_plantilla();

-- 4. Backfill: para asignaciones existentes (si las hubiera), crear plantillas espejo ahora.
-- (Actualmente 0 asignaciones, pero dejamos el bloque por idempotencia.)
do $$
declare r record;
begin
  for r in
    select af.*
      from public.asignaciones_formatos af
      left join public.tareas_plantilla tp on tp.origen_asignacion_id = af.id
     where tp.id is null
  loop
    -- Reusar el trigger llamando explícitamente vía INSERT (pero eso daría conflicto),
    -- mejor insertar directo aquí.
    insert into public.tareas_plantilla (
      titulo, descripcion, frecuencia, hora_limite, dia_semana, dia_mes, mes_anual,
      bases_asignadas, evidencia_requerida, categoria, activo,
      formato_id, origen_asignacion_id
    )
    select f.titulo,
           coalesce(f.descripcion, 'Rellenar formato ' || f.titulo),
           r.frecuencia, r.hora_limite, r.dia_semana, r.dia_mes, r.mes_anual,
           array[r.base_id]::uuid[], 'pdf'::evidencia_tipo,
           coalesce(f.categoria, 'formato'),
           r.activo, r.formato_id, r.id
      from public.formatos f where f.id = r.formato_id;
  end loop;
end $$;
