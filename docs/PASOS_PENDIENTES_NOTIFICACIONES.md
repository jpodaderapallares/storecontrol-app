# Sistema de notificaciones por email — pasos manuales pendientes

Todo el back-end está desplegado (migraciones, Edge Functions v5 con SMTP, cron jobs). Para que los emails empiecen a salir, sólo quedan **4 pasos manuales** (5–10 min en total). No necesitas DNS, dominio corporativo, ni acceso IT.

---

## Enfoque: Gmail SMTP con cuenta nueva gratuita

Usamos una cuenta de Gmail **dedicada** (ej. `storecontrol.hla@gmail.com`) sólo para envíos automáticos. Los storekeepers seguirán contactando a `logistics@h-la.es` como hasta ahora — esa cuenta no se toca.

Gmail SMTP gratuito permite hasta **500 emails/día** por cuenta; suficiente para las 3–5 bases actuales y margen de crecimiento.

---

## Paso 1 · Crear cuenta Gmail nueva (2 min)

1. Ve a https://accounts.google.com/signup
2. Crea una cuenta nueva, por ejemplo:
   - Nombre: `StoreControl HLA`
   - Email: `storecontrol.hla@gmail.com` (o el que prefieras, apúntalo)
   - Contraseña: una segura, guárdala en tu gestor de contraseñas
3. Salta los pasos opcionales (teléfono de recuperación, etc. — puedes añadirlos luego).

> Importante: no uses tu Gmail personal. Cuenta dedicada = más control y menos riesgo.

## Paso 2 · Activar verificación en 2 pasos (2 min)

Gmail exige 2FA para poder generar **App Passwords** (imprescindibles para SMTP).

1. Inicia sesión con la cuenta nueva y ve a https://myaccount.google.com/security
2. En **Cómo inicias sesión en Google** → **Verificación en 2 pasos** → **Empezar**.
3. Añade tu móvil y verifica el SMS. Ya está activa.

## Paso 3 · Generar un App Password (1 min)

1. Con 2FA ya activo, ve a https://myaccount.google.com/apppasswords
2. Nombre de la app: `StoreControl SMTP`.
3. Pulsa **Crear**. Google te muestra una contraseña de **16 caracteres** (4 bloques de 4, con espacios).
4. **Cópiala exactamente**. Sólo se muestra una vez. Si la pierdes, generas otra y ya.

> Nota: en el siguiente paso, pégala SIN espacios (ej. `abcd efgh ijkl mnop` → `abcdefghijklmnop`).

## Paso 4 · Pegar los secrets en Supabase (1 min)

En el dashboard de Supabase → **Project Settings → Edge Functions → Secrets** (o `https://supabase.com/dashboard/project/kzatkwkrghtkzumnjwzn/functions/secrets`), añade/edita estos 6 secrets:

| Clave | Valor |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USERNAME` | `storecontrol.hla@gmail.com` (el email que creaste) |
| `SMTP_PASSWORD` | el app password de 16 chars sin espacios (paso 3) |
| `SMTP_FROM` | `StoreControl HLA <storecontrol.hla@gmail.com>` |
| `APP_URL` | `https://storecontrol-app.vercel.app` |

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta Supabase automáticamente. No los añadas.

Guarda. Listo.

---

## Paso 5 · Test end-to-end (opcional, recomendado)

Una vez hechos los pasos 1–4, **avísame** y yo disparo el cron manualmente para validar que un email real llega. Si no quieres esperar, haz esto:

1. En la app admin → **Formatos** → crea una asignación con frecuencia **diaria** y hora límite **5 min desde ahora** a una base con storekeeper asignado cuyo email sea uno tuyo (para recibir la prueba en tu bandeja).
2. Espera al próximo tick del cron (cada 15 min) o pídeme que lo fuerce.
3. Revisa la bandeja del storekeeper. Debería llegar `[StoreControl] HOY vence: …`.
4. En Supabase → **Table Editor → notificaciones_log**: verás el registro con `status=ok`.

---

## Resumen infraestructura desplegada (ya lista)

### Migraciones aplicadas
- `unify_formatos_with_tareas` — asignaciones_formatos ↔ tareas_plantilla (trigger automático)
- `generar_instancias_y_vencimientos` — motor de cadencia (6 frecuencias) + marcado de vencidas
- `plantillas_email` — 4 plantillas editables desde `/emails`
- `fix_ambiguous_plantilla_id_in_generar_v2` — parche de la función

### Edge Functions
- `send-recordatorios` (**v5, SMTP**) — decide y envía recordatorios cada 15 min
- `generate-instances` (v4) — regenera instancias cada noche

### Cron jobs activos
| Job | Frecuencia | Qué hace |
|---|---|---|
| `storecontrol_recordatorios_15m` | `*/15 * * * *` | Llama a `send-recordatorios` |
| `storecontrol_marcar_vencidas_db` | `*/5 * * * *` | Marca vencidas directamente en DB |
| `storecontrol_generar_instancias_diario` | `10 0 * * *` UTC | Regenera instancias 60d adelante |

### Política de envío (no editable; sí editable el contenido)

| Tipo | Cuándo | Destinatarios |
|---|---|---|
| `recordatorio_24h` | 20–28 h antes del vencimiento | Storekeeper |
| `recordatorio_hoy` | 0–4 h antes del vencimiento | Storekeeper |
| `vencida_24h` | 24–32 h después sin completar | Storekeeper + CC admin |
| `escalado_admin` | 48–56 h después sin completar | Solo admin |

Cada envío queda registrado en `notificaciones_log` → **trazabilidad legal completa**: si un storekeeper alega que no sabía nada, puedes imprimir la tabla y demostrar que se le avisó 4 veces.

---

## FAQ

**¿Por qué no usamos `@h-la.es` directamente?**
Porque requeriría acceso a los DNS del dominio corporativo (SPF, DKIM, DMARC) y tú no los controlas. Con Gmail SMTP no tocas nada del dominio.

**¿Los emails llegarán bien o irán a spam?**
Gmail tiene reputación impecable. Los emails se enviarán desde `storecontrol.hla@gmail.com` y llegarán correctamente a gmail, outlook y servidores corporativos. Si alguno cae a spam la primera vez, el destinatario marca "no es spam" y ya no vuelve a pasar.

**¿Y si algún día quiero migrar a `@h-la.es`?**
Cambias 4 secrets en Supabase (`SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`) y listo. El código no cambia.

**¿Qué pasa si supero los 500 emails/día de Gmail?**
Los intentos extra fallarán y quedarán registrados en `notificaciones_log` con `status=error`. Con las 3–5 bases actuales estás muy lejos del límite (máximo ~20 emails/día). Si llega el momento, migras a SendGrid, Brevo o Amazon SES sin tocar el código.

---

## Avisos de seguridad (warnings no bloqueantes)

El advisor de Supabase reporta 4 warnings que puedes revisar cuando tengas tiempo:
- Extensión `pg_net` en `public` — recomendado moverla a `extensions`.
- Bucket `qrdocs` público con política de listado amplia — revisar si es intencional.
- Password leak protection deshabilitada — activar en Auth → Settings.
- Postgres 17.4 tiene parches de seguridad disponibles — upgrade cuando puedas.

Ninguno es crítico ni bloquea el funcionamiento.
