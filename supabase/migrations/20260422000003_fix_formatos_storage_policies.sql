-- =============================================================
-- Fix: las políticas de storage para formatos en la migración
-- 20260422000002 apuntaban por error al bucket 'biblioteca-tecnica'
-- y usaban 'create policy if not exists' (sintaxis no soportada).
-- Esta migración recrea las políticas correctamente para 'formatos'.
-- =============================================================

-- Configurar el bucket formatos con límites (50MB, sólo PDF)
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf']
where id = 'formatos';

-- Limpiar políticas previas por si existían
drop policy if exists "formatos_read_all"     on storage.objects;
drop policy if exists "formatos_write_admin"  on storage.objects;
drop policy if exists "formatos_update_admin" on storage.objects;
drop policy if exists "formatos_delete_admin" on storage.objects;

create policy "formatos_read_all"
  on storage.objects for select
  using (bucket_id = 'formatos' and auth.role() = 'authenticated');

create policy "formatos_write_admin"
  on storage.objects for insert
  with check (bucket_id = 'formatos' and public.es_admin());

create policy "formatos_update_admin"
  on storage.objects for update
  using      (bucket_id = 'formatos' and public.es_admin())
  with check (bucket_id = 'formatos' and public.es_admin());

create policy "formatos_delete_admin"
  on storage.objects for delete
  using (bucket_id = 'formatos' and public.es_admin());
