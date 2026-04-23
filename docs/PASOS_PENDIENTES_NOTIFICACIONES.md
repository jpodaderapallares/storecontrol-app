# Sistema de notificaciones por email — pasos manuales pendientes

Todo el back-end está desplegado y operativo (migraciones, Edge Functions, cron jobs). Para que los correos empiecen a salir realmente, quedan **3 cosas manuales** que sólo tú puedes hacer.

---

## 1. Cuenta Resend + API key

1. Crea una cuenta gratis en https://resend.com (te permite 3 000 emails/mes y 100/día, suficiente para empezar).
2. En el dashboard → **API Keys** → **Create API Key** → nombre: `storecontrol-prod`, permiso: **Full access** (o sólo Sending Access).
3. Copia el valor (`re_xxxxxxxxxxxx…`) — **sólo se muestra una vez**.

## 2. Configurar dominio `h-la.es` en Resend

1. Dashboard → **Domains** → **Add Domain** → `h-la.es`.
2. Resend te dará 3 registros DNS que debes añadir en tu proveedor (Ionos/Namecheap/lo que uses):
   - 1 × **TXT** (SPF): `v=spf1 include:amazonses.com ~all`  (o similar)
   - 2 × **CNAME** (DKIM): `resend._domainkey` → `resend.xxxx.amazonses.com`
   - 1 × **TXT** (DMARC): `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@h-la.es`
3. Espera 5–30 min y pulsa **Verify** en Resend. Cuando los 3 aparezcan en verde, el dominio está listo.

> Sin estos DNS, los correos acaban en spam o son rechazados por Gmail/Outlook corporativo.

## 3. Guardar los secrets en la Edge Function `send-recordatorios`

En el dashboard de Supabase → **Edge Functions → send-recordatorios → Secrets**, añade:

| Clave | Valor |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxx…` (paso 1) |
| `RESEND_FROM_EMAIL` | `StoreControl <notificaciones@h-la.es>` |
| `APP_URL` | `https://storecontrol-app.vercel.app` |

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta Supabase automáticamente.

## 4. Test end-to-end

Una vez hechos los pasos 1–3:

1. En la app admin → **Formatos** → abre un formato y asígnalo a una base con frecuencia **diaria**, hora límite en **5 minutos** desde ahora.
2. Fuerza el cron manualmente:
   ```sql
   select net.http_post(
     url := 'https://kzatkwkrghtkzumnjwzn.functions.supabase.co/send-recordatorios',
     headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
   );
   ```
   (o espera a que pasen los 15 min del cron programado)
3. Revisa la bandeja del storekeeper asignado. Debería llegar `[StoreControl] HOY vence: ...`.
4. En Supabase → **Table Editor → notificaciones_log**: verás el registro con `status=ok`.

---

## Resumen infraestructura desplegada (ya lista)

### Migraciones aplicadas
- `unify_formatos_with_tareas` — asignaciones_formatos ↔ tareas_plantilla (trigger automático)
- `generar_instancias_y_vencimientos` — motor de cadencia (6 frecuencias) + marcado de vencidas
- `plantillas_email` — 4 plantillas editables desde `/emails`
- `fix_ambiguous_plantilla_id_in_generar_v2` — parche de la función

### Edge Functions
- `send-recordatorios` (v3) — decide y envía recordatorios cada 15 min
- `generate-instances` (v4) — regenera instancias cada noche

### Cron jobs activos
| Job | Frecuencia | Qué hace |
|---|---|---|
| `storecontrol_recordatorios_15m` | `*/15 * * * *` | Llama a `send-recordatorios` |
| `storecontrol_marcar_vencidas_db` | `*/5 * * * *` | Marca vencidas directamente en DB |
| `storecontrol_generar_instancias_diario` | `10 0 * * *` UTC | Regenera instancias 60d adelante |

### Política de envío (no editable, sí editable el contenido)

| Tipo | Cuándo | Destinatarios |
|---|---|---|
| `recordatorio_24h` | 20–28 h antes del vencimiento | Storekeeper |
| `recordatorio_hoy` | 0–4 h antes del vencimiento | Storekeeper |
| `vencida_24h` | 24–32 h después sin completar | Storekeeper + CC admin |
| `escalado_admin` | 48–56 h después sin completar | Solo admin |

Cada envío queda registrado en `notificaciones_log` → **trazabilidad legal completa**: si un storekeeper alega que no sabía nada, puedes imprimir la tabla y demostrar que se le avisó 4 veces.

---

## Avisos de seguridad (warnings no bloqueantes)

El advisor de Supabase reporta 4 warnings que puedes revisar cuando tengas tiempo:
- Extensión `pg_net` en `public` — recomendado moverla a `extensions`.
- Bucket `qrdocs` público con política de listado amplia — revisar si es intencional.
- Password leak protection deshabilitada — activar en Auth → Settings.
- Postgres 17.4 tiene parches de seguridad disponibles — upgrade cuando puedas.

Ninguno es crítico ni bloquea el funcionamiento.
