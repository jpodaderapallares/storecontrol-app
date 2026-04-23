-- Cron jobs (pg_cron). Requieren que las Edge Functions estén desplegadas
-- y que las variables vault.supabase_url y vault.service_role_key estén fijadas.
--
-- ⚠️  Antes de aplicar, sustituir <PROYECTO> y <SERVICE_ROLE_KEY>.

-- Cada 15 minutos — recordatorios y marcado de vencidas
select cron.schedule(
  'storecontrol_recordatorios_15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROYECTO>.functions.supabase.co/send-recordatorios',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);

-- Diariamente a 00:10 UTC — generar instancias futuras
select cron.schedule(
  'storecontrol_generar_instancias_diario',
  '10 0 * * *',
  $$
  select net.http_post(
    url := 'https://<PROYECTO>.functions.supabase.co/generate-instances',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);

-- Fallback DB-only: marcar vencidas cada 5 min sin depender de Edge Function
select cron.schedule(
  'storecontrol_marcar_vencidas_db',
  '*/5 * * * *',
  $$ select public.marcar_instancias_vencidas(); $$
);
