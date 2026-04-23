# StoreControl

Aplicación web interna de gestión de cumplimiento operacional para el departamento
de **Logística de HLA Maintenance** — organización **EASA Part 145** con 16 almacenes
distribuidos.

La app tiene dos vistas:

- **Jefe de Logística (admin)** — visión global de las 16 bases, control de cumplimiento,
  gestión de tareas, usuarios, alertas, biblioteca técnica, auditoría y configuración.
- **Storekeeper (operativo)** — vista restringida a su propia base: tareas del día,
  semana y mes con carga de PDFs como evidencia.

El objetivo es dejar un registro auditado e inmutable que sirva como **defensa regulatoria
ante inspecciones EASA** (AMC1 145.A.30(e)).

---

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS (tema oscuro profesional)
- Supabase (Postgres + Auth + Storage + Edge Functions)
- Resend (emails transaccionales)
- Zustand · React Router v6 · Recharts · TanStack Table · react-dropzone · react-pdf
- pg_cron para notificaciones programadas

---

## Estructura

```
storecontrol/
├── src/
│   ├── App.tsx              Routing + protección por rol
│   ├── main.tsx
│   ├── index.css            Tokens + componentes Tailwind
│   ├── lib/
│   │   ├── supabase.ts      Cliente + helper de audit log
│   │   ├── database.types.ts
│   │   └── format.ts        Formateo dates + colores cumplimiento
│   ├── stores/
│   │   └── authStore.ts     Zustand · sesión + rol
│   ├── components/
│   │   ├── layout/          AdminLayout, StorekeeperLayout, Sidebar
│   │   └── ui/              ProgressBar, Badge, PageHeader
│   └── pages/
│       ├── Login.tsx
│       ├── admin/
│       │   ├── Dashboard.tsx       KPIs + grid de bases
│       │   ├── BaseDetail.tsx      Detalle por base (tabs)
│       │   ├── Tareas.tsx          CRUD plantillas
│       │   ├── Usuarios.tsx
│       │   ├── Alertas.tsx
│       │   ├── Biblioteca.tsx
│       │   ├── Auditoria.tsx
│       │   └── Config.tsx
│       └── storekeeper/
│           ├── Home.tsx            Tareas + upload PDF
│           └── Biblioteca.tsx
└── supabase/
    ├── migrations/
    │   ├── 20260419000000_initial_schema.sql
    │   └── 20260419000001_cron_jobs.sql
    ├── seed.sql
    └── functions/
        ├── send-recordatorios/     Recordatorios + vencimientos + escalado
        ├── generate-instances/     Rotación diaria de instancias
        └── crear-usuario/          Alta de usuarios via Auth admin
```

---

## Puesta en marcha

### 1 · Crear proyecto Supabase

Regístrate en https://supabase.com y crea un proyecto. Copia `URL`, `anon key` y
`service role key` del panel Settings → API.

### 2 · Aplicar esquema y datos

Desde la CLI (`npm i -g supabase`):

```bash
supabase link --project-ref <ref>
supabase db push                         # aplica migrations/*.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

Eso crea:

- Las **16 bases** (PMI, MAD, BCN, AGP, SVQ, VLC, IBZ, ALC, LPA, TFS, TFN, SPC, FUE, ACE, WAW, KTW).
- La **biblioteca técnica** con los 54 documentos reales (LOGINFO_, LOGN_, LOGTRA_)
  extraídos del *Logistics Notice List* de HLA.
- Las **17 plantillas de tareas** que corresponden al "Procedimiento de reporte mensual"
  del email de Julio Podadera (CMS F005, Toolboxes Stahlwille, F014 calibradas, GSE,
  paneles suplementarios, ruedas, botiquines, residuos, U/S area, caducidades, etc.).
- Las instancias para los próximos 30 días de cada plantilla × cada base.

### 3 · Storage buckets

Se crean vía migration (`evidencias-tareas` privado y `biblioteca-tecnica` privado).
Las políticas RLS garantizan que:

- Un storekeeper sólo sube/descarga PDFs cuya ruta empieza por el UUID de SU base.
- Todos los autenticados leen la biblioteca técnica; sólo admin escribe.

### 4 · Desplegar Edge Functions

```bash
supabase functions deploy send-recordatorios
supabase functions deploy generate-instances
supabase functions deploy crear-usuario

supabase secrets set \
  RESEND_API_KEY=re_xxx \
  RESEND_FROM_EMAIL=storecontrol@hla.es \
  ADMIN_EMAIL=logistica@hla.es
```

### 5 · Activar cron

Abre el *SQL editor* de Supabase y edita `supabase/migrations/20260419000001_cron_jobs.sql`
sustituyendo `<PROYECTO>` y `<SERVICE_ROLE_KEY>`. Ejecútalo.

### 6 · Variables del frontend

```bash
cp .env.example .env
# Edita VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

### 7 · Arrancar la app

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # producción
```

---

## Creación del primer admin

Supabase Auth no tiene usuario por defecto. Tras aplicar el esquema:

```sql
-- 1) Crear el usuario en Auth (desde el panel Authentication → Users)
--    con email = logistica@hla.es y contraseña provisional.
-- 2) Copiar su auth.users.id y ejecutar:
insert into public.usuarios (id, nombre, email, rol, base_id, activo)
values ('<UUID_AUTH>', 'Julio Podadera', 'logistica@hla.es', 'admin', null, true);
```

A partir de ese momento, el admin puede crear el resto de usuarios desde `/usuarios`
(la creación invoca la Edge Function `crear-usuario`, que envía email de bienvenida
con contraseña temporal via Resend).

---

## Flujos críticos (smoke test)

### Flujo 1 · Admin crea una tarea semanal

1. Login como admin → `/dashboard`.
2. `Tareas` → *Nueva tarea* → "Inventario cíclico", semanal, lunes 18:00, bases `PMI` y `MAD`,
   evidencia PDF requerida, procedimiento BT `LOGN_24_10_21_v1`.
3. El sistema llama automáticamente a `generar_instancias_30d` y crea las instancias
   para los próximos lunes.

### Flujo 2 · Storekeeper completa una tarea

1. Login como storekeeper de PMI → `/base/PMI`.
2. Ve la tarea en "Esta semana" como **PENDIENTE**.
3. Pulsa **ADJUNTAR PDF Y COMPLETAR**. Se abre un panel inline bajo la tarjeta con
   drag-and-drop. Suelta el PDF firmado, añade una nota, "Confirmar".
4. La tarjeta pasa a **COMPLETADA** (verde) sin recargar.
5. El PDF queda guardado en `evidencias-tareas/<base_id>/<instancia_id>/` en Supabase Storage.

### Flujo 3 · Incumplimiento y escalado

1. Storekeeper de MAD no completa la tarea. Al pasar la hora límite (18:00):
   - La DB marca la instancia como **vencida** (función `marcar_instancias_vencidas` + cron).
   - La Edge Function `send-recordatorios` envía mail de vencimiento al storekeeper y al admin.
2. 24 h después sigue sin completarse → nuevo mail de **escalado urgente** al admin
   (y registro en `audit_log`).

### Flujo 4 · Auditoría y defensa EASA

1. Admin entra a `/auditoria` y ve:
   - Todos los logins/logouts.
   - Cada PDF subido (nombre, tamaño, instancia, usuario, timestamp).
   - Los recordatorios enviados con status.
   - Cualquier cambio de configuración o de plantilla.
2. Puede filtrar por base/usuario/fecha y exportar a CSV.
3. El `audit_log` es **inmutable** (un trigger bloquea UPDATE/DELETE).

---

## Módulos implementados

| Módulo | Descripción |
|---|---|
| Auth | Login email+password, rutas protegidas por rol |
| Dashboard admin | 4 KPI cards + grid 4×N de bases con cumplimiento + panel lateral (gráfico por frecuencia, peores bases, feed de actividad) |
| Base detail | Tabs hoy/semana/mes/histórico + export PDF |
| Storekeeper home | Progreso del día + 3 secciones (diarias / semanales / mensuales) + carga PDF inline por tarea |
| Tareas admin | CRUD de plantillas con generación automática de instancias 30d |
| Usuarios admin | Listado + alta (Edge Function + Resend) + asignación de base |
| Alertas | Tabs de incumplimientos, recordatorios enviados, resueltas |
| Biblioteca | 54 refs sembradas · subida/versionado con drag&drop · registro de consultas |
| Auditoría | Tabla inmutable con filtros + CSV export · nota regulatoria AMC1 145.A.30(e) |
| Config | Empresa, umbrales, zonas horarias por base |
| Edge Functions | `send-recordatorios`, `generate-instances`, `crear-usuario` |

---

## Notas regulatorias

El sistema implementa por diseño los controles que HLA necesita para demostrar ante
una auditoría EASA Part 145 que:

- Las tareas de control de almacén están **formalmente asignadas** (plantilla → base).
- Los storekeepers han sido **notificados** (notificaciones_log con timestamps).
- Cada cumplimiento queda **trazado con evidencia PDF** (tareas_instancia.pdf_path).
- Los **incumplimientos se escalan** automáticamente al jefe de logística.
- El **registro es inmutable** (triggers bloquean UPDATE/DELETE en audit_log y en
  instancias completadas).
- La **documentación técnica** estaba disponible y fue consultada (bt_consultado se loggea).

---

## Contenido semilla basado en el email de Julio Podadera

El archivo `supabase/seed.sql` traduce a plantillas de tarea la tabla del email
*"HLA_COORDINACION LOGISTICA_PROCEDIMIENTO DE REPORTE MENSUAL"*:

| Procedimiento | Frecuencia (seed) |
|---|---|
| CMS — F005 Temperatura/Humedad | diaria |
| CMS — Control de caducidades | diaria |
| Control U/S Area | diaria |
| Inventory TOOLBOXES Stahlwille | mensual |
| Inventory CALIBRATED TOOLS (F014) | mensual |
| Inventory ANTIESTATIC WORKSTATION | mensual |
| Inventory SUPPLEMENTARY PANEL TOOL | mensual |
| Equipment Procedure — E/S herramientas | mensual |
| Opening/Closure Toolboxes | mensual |
| Material used — control general | mensual |
| Metal Cabinet Safety Check | mensual |
| Wheel Turning Procedure | mensual |
| CMS — TOOL_ESTACION | mensual |
| Inventario cíclico semanal | semanal |
| Inventory GSE | semestral |
| Control Residuos | semestral |
| Control botiquines | anual |

Todas con evidencia PDF requerida y, cuando procede, vinculadas al documento de
biblioteca correspondiente.
