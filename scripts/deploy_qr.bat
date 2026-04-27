@echo off
REM ============================================================
REM  StoreControl - Despliegue de fixes 2026-04-27
REM ------------------------------------------------------------
REM  Esta tanda de fixes incluye:
REM   - Fix critico: creacion de usuarios (llamada a Edge Function
REM     crear-usuario v16 con CORS) en vez del stub alert()
REM   - Fix critico: centro de alertas (toasts, borrar individual,
REM     reabrir, 3 pestanyas con contadores)
REM   - Fix critico: Dashboard "1% tareas hoy" (bug zona horaria,
REM     UTC vs Madrid) usando fechaLocalISO()
REM   - i18n: ES / EN / PL con selector en sidebar y header
REM   - Backend: politica RLS notif_admin_delete sobre
REM     notificaciones_log (admin puede borrar)
REM   - Backend: Edge Function crear-usuario redesplegada (v16)
REM
REM  Backend ya aplicado via Supabase MCP (no requiere accion):
REM   - Migracion notif_admin_delete_policy
REM   - Edge Function crear-usuario v16 ACTIVE
REM ============================================================

cd /d "%~dp0\.."
del /F /Q .git\index.lock 2>nul

echo.
echo === git status ===
git status --short

echo.
echo === npm install qrcode + tipos ===
call npm install qrcode@^1.5.4 --save
if errorlevel 1 (
  echo ERROR: npm install qrcode fallo. Abortando.
  pause
  exit /b 1
)
call npm install -D @types/qrcode@^1.5.5
if errorlevel 1 (
  echo ERROR: npm install @types/qrcode fallo. Abortando.
  pause
  exit /b 1
)

echo.
echo === git add (fix usuarios + alertas + dashboard TZ + i18n ES/EN/PL) ===
git add ^
  src\App.tsx ^
  src\main.tsx ^
  src\components\layout\StorekeeperLayout.tsx ^
  src\components\layout\Sidebar.tsx ^
  src\components\ui\LangSelector.tsx ^
  src\lib\database.types.ts ^
  src\lib\i18n\translations.ts ^
  src\lib\i18n\index.tsx ^
  src\pages\Login.tsx ^
  src\pages\admin\Dashboard.tsx ^
  src\pages\admin\Usuarios.tsx ^
  src\pages\admin\Alertas.tsx ^
  src\pages\admin\PlantillasEmail.tsx ^
  src\pages\storekeeper\Home.tsx ^
  src\pages\storekeeper\Biblioteca.tsx ^
  src\pages\storekeeper\QR.tsx ^
  src\pages\qr\QrRedirect.tsx ^
  supabase\functions\crear-usuario\index.ts ^
  supabase\functions\qr-redirect\index.ts ^
  supabase\functions\purge-qr-trash\index.ts ^
  public\README_HLA_LOGO.md ^
  docs\QR_INTEGRATION_ROLLBACK.md ^
  scripts\deploy_qr.bat ^
  package.json ^
  package-lock.json

REM Si ya pusiste el logo en public\hla-logo.png, lo incluimos tambien
if exist "public\hla-logo.png" git add public\hla-logo.png

echo.
echo === git commit ===
git commit -m "fix(critical): crear usuarios + centro alertas + dashboard TZ + i18n ES/EN/PL"

echo.
echo === git push ===
git push origin main

echo.
echo ============================================================
echo  Push enviado. Vercel desplegara la SPA en 60-90s.
echo
echo  Backend YA desplegado en Supabase:
echo   - Edge Function crear-usuario (v16 ACTIVE, CORS habilitado)
echo   - Politica RLS notif_admin_delete (admin borra alertas)
echo   - Tabla documentos_qr + RLS
echo   - Bucket tooling_qr (privado, 50MB max)
echo   - Edge Function qr-redirect (v1, JWT off - publica)
echo   - Edge Function purge-qr-trash (v1, JWT on)
echo   - Cron job 10 storecontrol_qr_purge_papelera (02:30 UTC)
echo
echo  Tag de backup pre-integracion: pre-qr-integration
echo ============================================================
pause
