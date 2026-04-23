-- =============================================================
-- StoreControl — Datos semilla
-- Bases + biblioteca técnica (Logistics Notices) + plantillas
-- basadas en el email "Procedimiento de Reporte Mensual" (HLA)
-- =============================================================

-- ---- BASES (16) ------------------------------------------------
insert into public.bases (codigo_iata, nombre_completo, pais, zona_horaria) values
  ('PMI', 'Palma de Mallorca Son Sant Joan', 'ES', 'Europe/Madrid'),
  ('MAD', 'Madrid Barajas Adolfo Suárez', 'ES', 'Europe/Madrid'),
  ('BCN', 'Barcelona El Prat Josep Tarradellas', 'ES', 'Europe/Madrid'),
  ('AGP', 'Málaga Costa del Sol', 'ES', 'Europe/Madrid'),
  ('SVQ', 'Sevilla San Pablo', 'ES', 'Europe/Madrid'),
  ('VLC', 'Valencia Manises', 'ES', 'Europe/Madrid'),
  ('IBZ', 'Ibiza', 'ES', 'Europe/Madrid'),
  ('ALC', 'Alicante-Elche Miguel Hernández', 'ES', 'Europe/Madrid'),
  ('LPA', 'Gran Canaria', 'ES', 'Atlantic/Canary'),
  ('TFS', 'Tenerife Sur Reina Sofía', 'ES', 'Atlantic/Canary'),
  ('TFN', 'Tenerife Norte Ciudad de La Laguna', 'ES', 'Atlantic/Canary'),
  ('SPC', 'La Palma', 'ES', 'Atlantic/Canary'),
  ('FUE', 'Fuerteventura', 'ES', 'Atlantic/Canary'),
  ('ACE', 'Lanzarote César Manrique', 'ES', 'Atlantic/Canary'),
  ('WAW', 'Varsovia Chopin', 'PL', 'Europe/Warsaw'),
  ('KTW', 'Katowice Pyrzowice', 'PL', 'Europe/Warsaw')
on conflict (codigo_iata) do nothing;

-- ---- BIBLIOTECA TÉCNICA --------------------------------------
-- Referencias reales extraídas de Logistics Notice List (01_List.pdf)
insert into public.biblioteca_tecnica (titulo, referencia, categoria, version, fecha_revision, emisor) values
  ('ASL Airlines Belgium ROTABLES Main Base Kit Return', 'LOGINFO_18_01', 'Expedición', 1, '2018-11-27', 'D Romero'),
  ('Material/Component Receiving AMOS B737NG', 'LOGINFO_19_01', 'Recepción', 1, '2019-12-26', 'D Romero'),
  ('Stamped and signed documentation', 'LOGINFO_20_02', 'Recepción', 1, '2020-03-09', 'D Romero + C Vicente'),
  ('Shipments from HLA Stations', 'LOGINFO_22_01', 'Expedición', 1, '2022-04-18', 'D Romero'),
  ('Special Tooling collection HQ0', 'LOGINFO_24_12_03', 'Herramientas', 1, '2024-12-03', 'Julio Podadera'),
  ('Norwegian new shipment procedure', 'LOGINFO_24_12_16', 'Expedición', 1, '2024-12-16', 'Julio Podadera'),
  ('Unserviceable Oxygen cylinders storage', 'LOGINFO_24_12_18', 'Materiales Peligrosos', 1, '2024-12-16', 'Julio Podadera'),
  ('Procedimiento diario para personal de turno en ausencia del almacenero', 'LOGINFO_25_01_08', 'Almacenamiento', 1, '2025-01-08', 'Julio Podadera'),
  ('Procedimiento de control para el movimiento de herramientas calibradas', 'LOGINFO_25_01_09', 'Herramientas', 1, '2025-01-09', 'Julio Podadera'),
  ('Proper use & handling of torque tools in aviation', 'LOGINFO_25_01_14', 'Herramientas', 1, '2025-01-14', 'Julio Podadera'),
  ('Record of document destruction', 'LOGINFO_25_01_30', 'CAMO', 1, '2025-01-30', 'Julio Podadera'),
  ('Safe Handling and storage of Liquid Nitrogen', 'LOGINFO_25_04_03', 'Materiales Peligrosos', 1, '2025-04-03', 'Julio Podadera'),
  ('SAFE WORKING LOADS signage for racks', 'LOGINFO_25_10_15', 'Seguridad', 1, '2025-10-15', 'Julio Podadera'),
  ('Procedure for the use of Calibrated Vernier Calipers and Feeler Gauges', 'LOGINFO_25_11_21', 'Herramientas', 1, '2025-11-21', 'Julio Podadera'),
  ('Refuerzo del control de herramientas calibradas (F014)', 'LOGINFO_25_12_01', 'Herramientas', 1, '2025-12-01', 'Julio Podadera'),
  ('Wheel shipment Protection and Handling', 'LOGINFO_26_03_20', 'Expedición', 2, '2026-03-20', 'Julio Podadera'),
  ('Calibrated tools + Rec procedures + QUAR and U/S material + Consumable-Repairable', 'LOGTRA_18_01_4', 'Recepción', 4, '2017-07-05', 'D Romero'),
  ('Consumable Material Certificates', 'LOGTRA_19_01_v2', 'Recepción', 2, '2019-05-14', 'D Romero'),
  ('EASA Form 1 Authorised Release Certificate issued by HLA', 'LOGTRA_19_02_v3', 'CAMO', 3, '2019-08-26', 'D Romero'),
  ('19/079 Acceptance of components', 'LOGTRA_19_03', 'Recepción', 1, '2019-12-31', 'D Romero + C Vicente'),
  ('TDS and SDS', 'LOGTRA_21_01', 'Materiales Peligrosos', 1, '2021-01-27', 'D Romero'),
  ('F005, TEMP and HUM control + chemicals catalog temp and hum range', 'LOGTRA_21_02_v2', 'Almacenamiento', 2, '2024-11-25', 'Julio Podadera'),
  ('RECEIVING PROCEDURES and CMS', 'LOGTRA_21_03_v2', 'Recepción', 2, '2021-05-24', 'D Romero + C Valero'),
  ('P/N ADTS-505 Air Data Test Set', 'LOGN_17_01', 'Herramientas', 1, '2017-03-03', 'D Romero'),
  ('P/N C27007-31, Cutout Switch Stab Trim Control', 'LOGN_17_02', 'Inventario', 1, '2017-04-10', 'D Romero'),
  ('P/N CanKey, CanKey opener', 'LOGN_17_03', 'Herramientas', 1, '2017-06-23', 'D Romero'),
  ('Circuit Breaker Lockout Rings', 'LOGN_17_04', 'Seguridad', 1, '2017-06-23', 'D Romero'),
  ('Toolbox control', 'LOGN_17_05', 'Herramientas', 2, '2019-06-13', 'D Romero'),
  ('Stores organization', 'LOGN_17_06', 'Almacenamiento', 1, '2017-01-30', 'D Romero'),
  ('Toolbox Kit control', 'LOGN_17_07_v1', 'Herramientas', 1, '2024-10-11', 'Julio Podadera'),
  ('Consumable-repairable material', 'LOGN_18_07', 'Inventario', 1, '2018-01-08', 'D Romero'),
  ('ESD Material Handling', 'LOGN_18_08_v4', 'Almacenamiento', 4, '2024-10-22', 'Julio Podadera'),
  ('Receiving Procedures', 'LOGN_18_09', 'Recepción', 2, '2021-01-27', 'D Romero'),
  ('Expiration Date criteria', 'LOGN_18_10', 'Almacenamiento', 1, '2018-10-02', 'D Romero'),
  ('Deliveries/Collections in HLA-Stores', 'LOGN_19_01', 'Expedición', 1, '2019-02-08', 'D Romero'),
  ('First Used On Label', 'LOGN_19_02_v2', 'Almacenamiento', 1, '2019-06-06', 'Julio Podadera'),
  ('Oil consumption', 'LOGN_19_03', 'Materiales Peligrosos', 1, '2019-07-09', 'D Romero + C Vicente'),
  ('Flyaway Kit use', 'LOGN_19_04', 'Herramientas', 1, '2019-10-21', 'D Romero'),
  ('Circuit Breaker Lockout Rings and Switches Flags', 'LOGN_19_05', 'Seguridad', 1, '2019-12-13', 'D Romero + C Vicente'),
  ('Parts Identification, labeling, next due', 'LOGN_20_01', 'Almacenamiento', 1, '2020-04-29', 'D Romero'),
  ('Registro y control Herramientas y Equipos', 'LOGN_21_01', 'Herramientas', 1, '2021-08-12', 'D Romero'),
  ('F014 - Control e Inspección de Herramientas Calibradas', 'LOGN_22_01', 'Herramientas', 1, '2022-02-25', 'D Romero'),
  ('Receiving Inspection - Quarantine Area', 'LOGN_22_02', 'Recepción', 1, '2022-04-28', 'D Romero'),
  ('Flammable Materials Storage / Segregation', 'LOGN_22_03', 'Materiales Peligrosos', 1, '2022-08-26', 'D Romero'),
  ('Nitrogen Bottles', 'LOGN_22_04', 'Materiales Peligrosos', 1, '2022-10-18', 'D Romero'),
  ('Aircraft Tires Management / Receiving / Shipment', 'LOGN_23_01_v02', 'Expedición', 2, '2023-06-06', 'D Romero'),
  ('Aircraft Tires Turning procedure', 'LOGN_23_02', 'Almacenamiento', 1, '2023-12-26', 'D Romero'),
  ('Inventory Control Guideline', 'LOGN_24_10_21_v1', 'Inventario', 1, '2024-10-21', 'Julio Podadera'),
  ('Shipping Procedure for Technical Records NAX', 'LOGN_24_10_25_v1', 'Expedición', 1, '2024-10-25', 'Julio Podadera'),
  ('Emergency Lowering - Jack Block', 'LOGN_24_10_28', 'Seguridad', 1, '2024-10-28', 'Julio Podadera'),
  ('Visual Inspection - Non Applicable Components', 'LOGN_24_10_V1', 'Recepción', 1, '2024-10-14', 'Julio Podadera'),
  ('Prevent Cross-Contamination Grease Gun and Handheld Engine Oil Pump', 'LOGN_24_10_29', 'Materiales Peligrosos', 1, '2024-10-29', 'Julio Podadera'),
  ('Shelf Life Control After Opening Isopropyl Alcohol & Acetone', 'LOGN_25_09', 'Materiales Peligrosos', 1, '2025-09-03', 'Julio Podadera'),
  ('Protection Equipment for Work at Heights (Helmets and Life Lines)', 'LOGN_25_11', 'Seguridad', 1, '2025-11-25', 'Julio Podadera')
on conflict (referencia) do nothing;

-- ---- CONFIGURACIÓN -------------------------------------------
insert into public.configuracion (clave, valor, descripcion) values
  ('empresa', '{"nombre":"HLA Maintenance","certificado_easa":"ES.145.XXX","email_admin":"logistica@hla.es"}', 'Datos de la organización Part 145'),
  ('umbrales_cumplimiento', '{"verde":85,"amarillo":60,"rojo":0}', 'Umbrales % cumplimiento por color'),
  ('dias_sin_actividad_alerta', '1', 'Días sin login antes de marcar a un storekeeper como inactivo'),
  ('recordatorios_antes_escalado', '2', 'Número de recordatorios antes de escalar al admin'),
  ('horas_escalado_vencida', '24', 'Horas desde vencimiento para escalado urgente')
on conflict (clave) do nothing;

-- ---- PLANTILLAS DE TAREAS ------------------------------------
-- Basadas en el email "Procedimiento de Reporte Mensual" (Julio Podadera)
do $$
declare
  v_todas_bases uuid[];
  v_bt_toolbox uuid;
  v_bt_calib uuid;
  v_bt_flammable uuid;
  v_bt_inventory uuid;
  v_bt_f005 uuid;
  v_bt_wheels uuid;
  v_bt_ausencia uuid;
  v_bt_exp uuid;
begin
  select array_agg(id) into v_todas_bases from public.bases where activo;

  select id into v_bt_toolbox from public.biblioteca_tecnica where referencia = 'LOGN_17_05';
  select id into v_bt_calib from public.biblioteca_tecnica where referencia = 'LOGN_22_01';
  select id into v_bt_flammable from public.biblioteca_tecnica where referencia = 'LOGN_22_03';
  select id into v_bt_inventory from public.biblioteca_tecnica where referencia = 'LOGN_24_10_21_v1';
  select id into v_bt_f005 from public.biblioteca_tecnica where referencia = 'LOGTRA_21_02_v2';
  select id into v_bt_wheels from public.biblioteca_tecnica where referencia = 'LOGN_23_02';
  select id into v_bt_ausencia from public.biblioteca_tecnica where referencia = 'LOGINFO_25_01_08';
  select id into v_bt_exp from public.biblioteca_tecnica where referencia = 'LOGN_18_10';

  insert into public.tareas_plantilla
    (titulo, descripcion, frecuencia, hora_limite, dia_semana, dia_mes, bases_asignadas, evidencia_requerida, procedimiento_bt_id, categoria)
  values
    ('CMS — Control temperatura y humedad (F005)',
     'Registro diario de temperatura y humedad en áreas de almacenamiento. Subir captura o escaneo del F005 diligenciado.',
     'diaria', '10:00', null, null, v_todas_bases, 'pdf', v_bt_f005, 'Almacenamiento'),

    ('CMS — Control de caducidades',
     'Revisión diaria de caducidades en CMS. Retirar y segregar material caducado.',
     'diaria', '12:00', null, null, v_todas_bases, 'pdf', v_bt_exp, 'Almacenamiento'),

    ('Control U/S Area — Devoluciones del día',
     'Revisión diaria del área U/S y registro de devoluciones.',
     'diaria', '18:00', null, null, v_todas_bases, 'pdf', null, 'Almacenamiento'),

    ('Inventory TOOLBOXES — Cajas Stahlwille',
     'Inventario y control mensual de cajas de herramientas Stahlwille. Adjuntar escaneo firmado.',
     'mensual', '18:00', null, 5, v_todas_bases, 'pdf', v_bt_toolbox, 'Herramientas'),

    ('Inventory CALIBRATED TOOLS (F014)',
     'Inventario mensual de herramientas calibradas con control de caducidad. Adjuntar F014.',
     'mensual', '18:00', null, 5, v_todas_bases, 'pdf', v_bt_calib, 'Herramientas'),

    ('Inventory ANTIESTATIC WORKSTATION',
     'Inventario y control del equipo antiestático (ESD).',
     'mensual', '18:00', null, 10, v_todas_bases, 'pdf', null, 'Herramientas'),

    ('Inventory SUPPLEMENTARY PANEL TOOL',
     'Inventario y control panel suplementario de herramientas.',
     'mensual', '18:00', null, 10, v_todas_bases, 'pdf', null, 'Herramientas'),

    ('Equipment Procedure — Entrada/Salida herramientas',
     'Registro mensual de entrada y salida de herramientas y equipos.',
     'mensual', '18:00', null, 15, v_todas_bases, 'pdf', null, 'Herramientas'),

    ('Opening/Closure procedure — Toolboxes',
     'Registro mensual de apertura y cierre de cajas de herramientas.',
     'mensual', '18:00', null, 15, v_todas_bases, 'pdf', v_bt_toolbox, 'Herramientas'),

    ('Material used — Control general de almacenes',
     'Revisión mensual general del estado del almacén.',
     'mensual', '18:00', null, 20, v_todas_bases, 'pdf', v_bt_inventory, 'Inventario'),

    ('Metal Cabinet Safety Check',
     'Control mensual de armarios metálicos (inflamables / químicos).',
     'mensual', '18:00', null, 20, v_todas_bases, 'pdf', v_bt_flammable, 'Seguridad'),

    ('Wheel Turning Procedure',
     'Control mensual y girado de ruedas almacenadas.',
     'mensual', '18:00', null, 25, v_todas_bases, 'pdf', v_bt_wheels, 'Almacenamiento'),

    ('CMS — Plan Inspección herramientas y equipos (TOOL_ESTACION)',
     'Actualización mensual de la pestaña TOOL_ESTACION en CMS.',
     'mensual', '18:00', null, 25, v_todas_bases, 'pdf', null, 'Herramientas'),

    ('Inventario cíclico semanal',
     'Inventario rotatorio por zonas. Cada lunes se revisa una sección.',
     'semanal', '18:00', 1, null, v_todas_bases, 'pdf', v_bt_inventory, 'Inventario'),

    ('Inventory GSE — Ground Support Equipment',
     'Inventario y control GSE. Semestral (ene/jul).',
     'semestral', '18:00', null, 10, v_todas_bases, 'pdf', null, 'Herramientas'),

    ('Control Residuos — Retirada',
     'Control de retirada de residuos (semestral).',
     'semestral', '18:00', null, 15, v_todas_bases, 'pdf', null, 'Seguridad'),

    ('Control riesgos laborales — Botiquines',
     'Control anual de botiquines.',
     'anual', '18:00', null, 1, v_todas_bases, 'pdf', null, 'Seguridad');
end $$;

-- Generar instancias para los próximos 30 días para todas las plantillas activas
do $$
declare r record;
begin
  for r in select id from public.tareas_plantilla where activo loop
    perform public.generar_instancias_30d(r.id);
  end loop;
end $$;
