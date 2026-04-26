# QR Integration · Backup baseline & rollback

Este documento describe **cómo deshacer** la integración del módulo QR
(pestaña "Generar QR" para almaceneros) si fuera necesario. La integración es
**aditiva**: solo añade artefactos nuevos (tablas, buckets, políticas, rutas,
componentes). No modifica ni borra nada de StoreControl.

---

## 1 · Baseline registrado el 2026-04-26

### Git
- **Tag local:** `pre-qr-integration` → commit `73360827f0ee79daa3a3c7fc9eb0e823062f8fac`
  ("feat(notifs): digests diario/semanal/mensual + KPI admin + critico unico").
- **Rama de desarrollo prevista:** `feature/qr-storekeeper` (fuera de `main`
  hasta que Julio dé el OK).

Para volver al estado previo en local:

```bat
git fetch --tags
git checkout main
git reset --hard pre-qr-integration
git push --force-with-lease origin main   :: solo si ya se había mergeado
```

### Supabase (proyecto `kzatkwkrghtkzumnjwzn`, eu-north-1)

Tablas en `public` antes de la integración (12):

```
bases · usuarios · biblioteca_tecnica · tareas_plantilla · tareas_instancia
notificaciones_log · audit_log · configuracion · formatos
asignaciones_formatos · recordatorios_consolidados · plantillas_email
```

Migraciones aplicadas hasta este punto (13, última `notificaciones_digest_buckets`).

Buckets en Storage:

```
biblioteca-tecnica  (privado)
evidencias-tareas   (privado)
formatos            (privado, 50 MB)
qrdocs              (PÚBLICO, residual del antiguo QR_app — NO se usa)
QRWEB               (PÚBLICO, residual del antiguo QR_app — NO se usa)
```

Cron jobs activos: 3, 4, 5, 6, 7, 8 (jobid=1 ya desactivado tras la reforma de notificaciones).

Helpers RLS críticos: `public.es_admin()`, `public.mi_base_id()`.

---

## 2 · Lo que añade la integración QR

| Artefacto | Tipo | Reversible con |
|---|---|---|
| `public.documentos_qr` | tabla nueva | `drop table` |
| políticas RLS sobre `documentos_qr` (4) | nuevas | se borran con el `drop table` |
| índices `documentos_qr_*` (3) | nuevos | se borran con el `drop table` |
| bucket `tooling_qr` | privado nuevo | `delete from storage.buckets` (vaciar antes) |
| políticas storage `tooling_qr_*` (4) | nuevas | `drop policy` |
| función SQL `resolver_qr_slug(text)` | nueva | `drop function` |
| función SQL `listar_qr_para_purgar()` | nueva | `drop function` |
| Edge Function `qr-redirect` (JWT off) | nueva | desplegar versión vacía o pausar |
| Edge Function `purge-qr-trash` (JWT on) | nueva | desplegar versión vacía o pausar |
| cron job `storecontrol_qr_purge_papelera` (jobid=10) | nuevo | `cron.unschedule(...)` |
| `src/pages/storekeeper/QR.tsx` | archivo nuevo | borrar |
| `src/pages/qr/QrRedirect.tsx` (`/qr/:slug`) | archivo nuevo | borrar |
| ruta + entrada sidebar storekeeper | nuevas | revert git |
| paquete `qrcode` + `@types/qrcode` (npm) | dependencias nuevas | `npm uninstall` |
| `public/hla-logo.png` | asset nuevo | borrar |

**Nada existente se modifica.** Si la rama nunca se mergea a `main`, basta con
descartar la rama y vaciar el bucket nuevo.

---

## 3 · Rollback completo paso a paso

> Solo si la integración llegó a producción (mergeada a `main` y desplegada).

### 3.1 Frontend (Vercel)

```bat
git checkout main
git reset --hard pre-qr-integration
git push --force-with-lease origin main
```

Vercel desplegará la versión previa en 60-90 s. La pestaña QR desaparece de la
UI del storekeeper.

### 3.2 Cron y funciones SQL

```sql
select cron.unschedule('storecontrol_qr_purge_papelera');
drop function if exists public.resolver_qr_slug(text);
drop function if exists public.listar_qr_para_purgar();
```

### 3.2b Edge Functions

Desde el panel de Supabase → Edge Functions, pausa o elimina:

- `qr-redirect`
- `purge-qr-trash`

### 3.3 Tabla y políticas

```sql
-- Borra la tabla (con sus índices, FKs y políticas RLS asociadas)
drop table if exists public.documentos_qr cascade;
```

### 3.4 Bucket de Storage

```sql
-- 1) Vaciar contenido del bucket
delete from storage.objects where bucket_id = 'tooling_qr';

-- 2) Borrar políticas
drop policy if exists "tooling_qr_select"      on storage.objects;
drop policy if exists "tooling_qr_insert"      on storage.objects;
drop policy if exists "tooling_qr_update"      on storage.objects;
drop policy if exists "tooling_qr_delete"      on storage.objects;
drop policy if exists "tooling_qr_admin_all"   on storage.objects;

-- 3) Borrar bucket
delete from storage.buckets where id = 'tooling_qr';
```

### 3.5 Verificación

```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_name='documentos_qr';                       -- 0
select count(*) from storage.buckets where id='tooling_qr';                        -- 0
select count(*) from cron.job where jobname='storecontrol_qr_purge_papelera';      -- 0
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('resolver_qr_slug','listar_qr_para_purgar'); -- 0
```

Si los tres devuelven `0`, el rollback está completo.

---

## 4 · Notas importantes

- Los buckets antiguos `qrdocs` y `QRWEB` (residuales del proyecto QR_app
  externo) **no se tocan** durante la integración. Siguen ahí, vacíos o no, y
  pueden borrarse manualmente cuando Julio confirme que no son necesarios.
- El antiguo proyecto `C:\Users\Julio\Desktop\QR_app` no comparte código con
  esta integración — solo se ha tomado como referencia funcional.
- Compartir (`share`) **no se implementa** en la primera versión por las
  incidencias detectadas en el QR_app original.
- La papelera **sí se implementa correctamente** (soft-delete + restauración
  + purga automática a los 30 días vía pg_cron).
