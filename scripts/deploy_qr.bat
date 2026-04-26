@echo off
REM ============================================================
REM  StoreControl - Despliegue del modulo QR (Generar QR)
REM ------------------------------------------------------------
REM  - Anyade nueva pestanya "Generar QR" para storekeepers
REM  - Pagina /qr/:slug publica para escaneo de QR
REM  - Bucket privado "tooling_qr" + tabla documentos_qr
REM  - Edge Functions qr-redirect y purge-qr-trash
REM
REM  Pre-requisitos:
REM   - Migracion DB ya aplicada (v20260426 qr_module_*)
REM   - Edge Functions ya desplegadas en Supabase (v1 ACTIVE)
REM   - Cron job 10 'storecontrol_qr_purge_papelera' ya activo
REM
REM  Este .bat instala la dependencia "qrcode", hace commit + push
REM  del codigo fuente al repo (Vercel desplegara la SPA).
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
echo === git add (QR + fix dashboard + UX storekeeper + tooltips + logo HLA) ===
git add ^
  src\App.tsx ^
  src\components\layout\StorekeeperLayout.tsx ^
  src\components\layout\Sidebar.tsx ^
  src\lib\database.types.ts ^
  src\pages\admin\Dashboard.tsx ^
  src\pages\storekeeper\Home.tsx ^
  src\pages\storekeeper\QR.tsx ^
  src\pages\qr\QrRedirect.tsx ^
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
git commit -m "feat(qr+ux): modulo QR + fix dashboard domingo + storekeeper agrupado + tooltips + logo HLA"

echo.
echo === git push ===
git push origin main

echo.
echo ============================================================
echo  Push enviado. Vercel desplegara la SPA en 60-90s.
echo
echo  Backend YA desplegado en Supabase:
echo   - Tabla documentos_qr + RLS
echo   - Bucket tooling_qr (privado, 50MB max)
echo   - Edge Function qr-redirect (v1, JWT off — publica)
echo   - Edge Function purge-qr-trash (v1, JWT on)
echo   - Cron job 10 storecontrol_qr_purge_papelera (02:30 UTC)
echo
echo  Tag de backup pre-integracion: pre-qr-integration
echo ============================================================
pause
