# StoreControl — Auditoría y reparación COMPLETADA ✅

**Remote en GitHub:** `main` = `0d056ec` (los PDFs basura del antiguo remote fueron sobrescritos).
**Supabase:** 13 usuarios sincronizados, bucket `formatos` con 4 políticas correctas y límites 50MB/PDF, funciones hardened.
**Next:** revoca tu PAT + limpia carpeta local + sube los PDFs vía UI.

Ver versión completa y detallada en `outputs/ESTADO_RECUPERACION.md`.

---

## ⚠️ 1. Revoca tu PAT AHORA

Abre https://github.com/settings/tokens → borra `storecontrol-push-temp`. (Si no, expira solo en 7 días.)

## 🧹 2. Limpia tu carpeta local (PowerShell, 30 segundos)

```powershell
cd "C:\Users\Julio\Desktop\CLAUDE\STOREKEEPER APP\storecontrol-app\storecontrol-app"
Remove-Item -Recurse -Force .\CLAUDE -ErrorAction SilentlyContinue
Remove-Item -Force ".\package (1).json" -ErrorAction SilentlyContinue
Remove-Item -Force .\.git\index.lock -ErrorAction SilentlyContinue

git fetch origin
git reset --hard origin/main

git config core.autocrlf false
git add --renormalize .
git diff --cached --quiet || git commit -m "chore: normalize line endings to LF"
```

## 🎯 3. Verifica Vercel y usa la app

1. Verifica el deploy en https://vercel.com/jpodaderapallares/storecontrol-app (debería estar building o recién deployed el commit `0d056ec`).
2. Entra como admin en https://storecontrol-app.vercel.app con `logistics@h-la.es`.
3. Menú **Formatos** → sube el PDF de cada uno de los 11 formatos.
4. Menú **Formatos** → tab **Asignaciones** → crea las asignaciones (los 12 storekeepers ya aparecen).
5. Prueba login con `stores.pmi@h-la.es` (o cualquier otro) para confirmar el flujo storekeeper.

---

## 🛠 Bugs corregidos (resumen)

1. Migración `20260422000002` referenciaba bucket incorrecto + sintaxis inválida → policies del bucket `formatos` NUNCA se crearon → **ARREGLADO** con migración `20260422000003` y aplicada en producción.
2. 12 perfiles storekeeper faltantes en `public.usuarios` → **ARREGLADO** (insertados con base IATA correcta).
3. Funciones DB sin `search_path` → **ARREGLADO** (5 funciones).
4. `.git/config` con refspec truncado → **ARREGLADO**.
5. Working tree corrupto (CRLF + truncados) → **ARREGLADO** (reset + `.gitattributes`).
6. `CLAUDE/` untracked con PDFs basura → eliminada del repo, en `.gitignore`; resto local lo limpias tú en el Paso 2.
7. `package (1).json` duplicado → **ARREGLADO**.
8. Remote GitHub con 12 commits de PDFs basura → **ARREGLADO** (force push sobrescribió).
