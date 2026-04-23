# StoreControl — Checklist de despliegue

Todo el backend de Supabase ya ha sido desplegado por Claude en el proyecto
**`kzatkwkrghtkzumnjwzn`** (región `eu-north-1`). Quedan 4 pasos que
requieren credenciales externas (Resend, service-role, Auth) y que tú mismo
debes rematar desde el panel de Supabase.

---

## 0 · Qué está ya hecho (verificado)

| Componente | Estado |
|---|---|
| Esquema (`bases`, `usuarios`, `tareas_plantilla`, `tareas_instancia`, `biblioteca_tecnica`, `notificaciones_log`, `audit_log`, `configuracion`) | Creado |
| Enums, funciones (`es_admin`, `mi_base_id`, `generar_instancias_30d`, `marcar_instancias_vencidas`) | Creadas |
| RLS + triggers inmutables en `audit_log` e instancias completadas | Activos |
| Buckets `evidencias-tareas` y `biblioteca-tecnica` + policies | Creados |
| 16 bases (PMI, MAD, BCN, AGP, SVQ, VLC, IBZ, ALC, LPA, TFS, TFN, SPC, FUE, ACE, WAW, KTW) | Insertadas |
| 54 referencias de biblioteca técnica (LOGINFO_, LOGN_, LOGTRA_) | Insertadas |
| 17 plantillas de tareas del procedimiento mensual | Insertadas |
| 1 776 instancias para los próximos 30 días | Generadas |
| 5 claves de configuración (empresa, umbrales, alertas, escalado) | Insertadas |
| Edge Function `send-recordatorios` | Desplegada v1 |
| Edge Function `generate-instances` | Desplegada v1 |
| Edge Function `crear-usuario` | Desplegada v1 |
| `.env` del frontend con URL + anon key reales | Escrito |

---

## 1 · Crear el primer admin (manual — una sola vez)

Supabase Auth no tiene usuario por defecto. Desde el panel:

1. Abre https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/auth/users
2. **Add user → Create new user**
   - Email: `logistics@h-la.es`
   - Password: (una temporal — la cambias al primer login)
   - ✔ Auto Confirm User
3. Copia el `id` del usuario recién creado (columna UID)
4. Abre https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/sql/new y ejecuta:

```sql
insert into public.usuarios (id, nombre, email, rol, base_id, activo)
values ('<PEGAR_AQUI_EL_UID>', 'Julio Podadera', 'logistics@h-la.es', 'admin', null, true);
```

A partir de ese momento puedes entrar a la app y crear el resto de usuarios
desde `/usuarios` (la alta va contra la Edge Function `crear-usuario`).

---

## 2 · Configurar Resend (para que los emails funcionen)

Las Edge Functions `send-recordatorios` y `crear-usuario` usan Resend para
enviar email. Sin estos secrets **los emails no se envían**, el resto de
la app funciona igual.

1. Regístrate en https://resend.com y crea una API key.
2. Añade y verifica el dominio `h-la.es` (o reutiliza si ya lo tienes).
3. Ve a https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/functions/secrets
   y crea los secrets:

   | Nombre | Valor |
   |---|---|
   | `RESEND_API_KEY` | `re_xxxxxxxxxxxxxxxx` |
   | `RESEND_FROM_EMAIL` | `storecontrol@h-la.es` |
   | `ADMIN_EMAIL` | `logistics@h-la.es` |

---

## 3 · Activar los cron jobs de pg_cron

Abre https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/sql/new

Necesitas la **service-role key** (panel → Settings → API → `service_role secret`).
Cópiala y pégala en `<SERVICE_ROLE_KEY>` antes de ejecutar:

```sql
-- Asegura extensiones (Supabase ya las instala por defecto)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cada 15 min: recordatorios + marcar vencidas + escalado
select cron.schedule(
  'storecontrol_recordatorios_15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://kzatkwkrghtkzumnjwzn.functions.supabase.co/send-recordatorios',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);

-- Diario 00:10 UTC: generar siguientes 30 días de instancias
select cron.schedule(
  'storecontrol_generar_instancias_diario',
  '10 0 * * *',
  $$
  select net.http_post(
    url := 'https://kzatkwkrghtkzumnjwzn.functions.supabase.co/generate-instances',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);

-- Cada 5 min, sólo DB (fallback si las Edge Functions fallaran)
select cron.schedule(
  'storecontrol_marcar_vencidas_db',
  '*/5 * * * *',
  $$ select public.marcar_instancias_vencidas(); $$
);

select * from cron.job;   -- deberías ver los 3
```

---

## 4 · Arrancar el frontend

El `.env` ya está escrito con la URL y anon key reales del proyecto.

```bash
cd storecontrol-app
npm install
npm run dev          # http://localhost:5173
```

**Producción (Vercel recomendado):**

1. Sube el repo a GitHub.
2. Vercel → *New project* → selecciona el repo.
3. Framework preset: **Vite**.
4. Environment Variables (copiar desde `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. El dominio resultante (ej. `storecontrol.vercel.app`) es el que
   comparten los almaceneros.

Alternativa: Netlify (mismo preset Vite y mismas envs) o Cloudflare Pages.

---

## 5 · Smoke test rápido

Con el admin ya creado y el frontend arrancado:

1. Login con `logistics@h-la.es` → deberías ir a `/dashboard`.
2. KPIs muestran 16 bases, 17 plantillas, ~1 776 instancias pendientes.
3. `/tareas` → listado completo de las 17 plantillas.
4. `/biblioteca` → 54 referencias listadas.
5. Crea un storekeeper de prueba en `/usuarios` (base PMI) —
   **si Resend no está configurado, fallará el envío de email pero el usuario
   sí queda creado.** Cambia su contraseña manualmente en Auth → Users.
6. Login con ese storekeeper → ves sólo las tareas de PMI.
7. Adjunta un PDF → queda en `evidencias-tareas/<base_id>/<instancia_id>/`.
8. `/auditoria` como admin → ves `login`, `pdf_subido`, `tarea_completada`.

---

## 6 · Credenciales clave (referencia)

- **Project ref**: `kzatkwkrghtkzumnjwzn`
- **URL**: `https://kzatkwkrghtkzumnjwzn.supabase.co`
- **Panel**: https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn
- **Edge Functions endpoint**: `https://kzatkwkrghtkzumnjwzn.functions.supabase.co/<name>`
- **Email admin configurado**: `logistics@h-la.es`

El `service_role` y la `anon` key ya están en sus sitios (anon en `.env`,
service role sólo para cron y para configurar secrets — **nunca** en el
frontend).

---

## 7 · Qué hacer si algo va mal

| Síntoma | Causa probable | Fix |
|---|---|---|
| `401` al hacer login | RLS bloquea | El usuario no está en `public.usuarios` con `activo=true` |
| `403` subiendo PDF | Path incorrecto | La ruta debe empezar por `<base_id_del_storekeeper>/…` |
| No llegan emails | Resend sin verificar o falta secret | Revisar `functions/secrets` y estado del dominio |
| No se marcan vencidas | pg_cron no activado | Paso 3 de este checklist |
| Dashboard vacío | Falta admin | Paso 1 de este checklist |

Logs de Edge Functions:
https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/functions
