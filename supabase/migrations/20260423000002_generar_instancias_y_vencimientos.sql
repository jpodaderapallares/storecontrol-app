-- =============================================================
-- MOTOR DE GENERACIÓN DE INSTANCIAS Y MARCADO DE VENCIDAS
-- =============================================================

-- Helper: determina si una fecha dada cumple la cadencia de una plantilla
create or replace function public.es_fecha_valida(
  fecha date,
  frec frecuencia_tarea,
  dia_semana_plantilla smallint,
  dia_mes_plantilla smallint,
  mes_anual_plantilla smallint
) returns boolean
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  dow smallint;
  dom smallint;
  mes smallint;
  ultimo_dia_mes smallint;
begin
  -- Convertimos el día de la semana a 1=lunes..7=domingo (estilo ISO)
  dow := extract(isodow from fecha)::smallint;
  dom := extract(day from fecha)::smallint;
  mes := extract(month from fecha)::smallint;

  if frec = 'diaria' then
    return true;

  elsif frec = 'semanal' then
    if dia_semana_plantilla is null then return false; end if;
    return dow = dia_semana_plantilla;

  elsif frec in ('mensual','trimestral','semestral','anual') then
    if dia_mes_plantilla is null then return false; end if;

    -- Manejo de overflow: si dia_mes=31 y el mes sólo tiene 28/29/30,
    -- la tarea se genera el último día real del mes.
    ultimo_dia_mes := extract(day from (date_trunc('month', fecha) + interval '1 month - 1 day'))::smallint;
    if dia_mes_plantilla > ultimo_dia_mes then
      if dom <> ultimo_dia_mes then return false; end if;
    else
      if dom <> dia_mes_plantilla then return false; end if;
    end if;

    if frec = 'mensual' then
      return true;
    elsif frec = 'trimestral' then
      return mes in (1, 4, 7, 10);
    elsif frec = 'semestral' then
      return mes in (1, 7);
    elsif frec = 'anual' then
      return mes = coalesce(mes_anual_plantilla, 1);
    end if;
  end if;

  return false;
end $$;

-- Genera instancias futuras para todas las plantillas activas
-- NOTA: las columnas de salida se prefijan con out_ para evitar ambigüedad
-- con la columna plantilla_id de tareas_instancia dentro del INSERT.
drop function if exists public.generar_instancias_proximas(integer);

create function public.generar_instancias_proximas(dias_adelante integer default 60)
returns table (out_plantilla_id uuid, out_instancias_creadas integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  d date;
  base_id_val uuid;
  storekeeper_id uuid;
  fecha_lim timestamptz;
  start_date date := current_date;
  end_date date := current_date + dias_adelante;
  ins_count integer;
  total integer;
begin
  for r in
    select * from public.tareas_plantilla where activo = true
  loop
    total := 0;
    d := start_date;
    while d <= end_date loop
      if public.es_fecha_valida(d, r.frecuencia, r.dia_semana, r.dia_mes, r.mes_anual) then
        for base_id_val in select unnest(r.bases_asignadas) loop
          -- Storekeeper titular de la base
          select u.id into storekeeper_id
            from public.usuarios u
            where u.base_id = base_id_val
              and u.rol = 'storekeeper'
              and u.activo = true
            limit 1;

          -- fecha_limite = día + hora_limite en la zona de la base
          fecha_lim := (d::text || ' ' || coalesce(r.hora_limite::text, '18:00'))::timestamptz;

          insert into public.tareas_instancia (
            plantilla_id, base_id, usuario_id,
            fecha_asignada, fecha_limite, estado
          ) values (
            r.id, base_id_val, storekeeper_id,
            d, fecha_lim, 'pendiente'
          )
          on conflict (plantilla_id, base_id, fecha_asignada) do nothing;

          get diagnostics ins_count = row_count;
          total := total + ins_count;
        end loop;
      end if;
      d := d + 1;
    end loop;

    if total > 0 then
      out_plantilla_id := r.id;
      out_instancias_creadas := total;
      return next;
    end if;
  end loop;
  return;
end $$;

-- Marca vencidas las pendientes cuya fecha_limite ya pasó
create or replace function public.marcar_instancias_vencidas()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare updated_count integer;
begin
  update public.tareas_instancia
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_limite < now();
  get diagnostics updated_count = row_count;
  return updated_count;
end $$;

-- Permisos
revoke all on function public.generar_instancias_proximas(integer) from public;
revoke all on function public.marcar_instancias_vencidas()       from public;
grant execute on function public.generar_instancias_proximas(integer) to service_role;
grant execute on function public.marcar_instancias_vencidas()       to service_role;
