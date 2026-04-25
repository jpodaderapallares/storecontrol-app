@echo off
REM ============================================================
REM  StoreControl - Despliegue del nuevo sistema de notificaciones
REM ------------------------------------------------------------
REM  - Sustituye el ciclo recordatorio_24h/recordatorio_hoy/
REM    vencida_24h/escalado_admin (que generaba spam) por:
REM      * 1 digest diario por storekeeper
REM      * 1 digest semanal por storekeeper (lunes)
REM      * 1 digest mensual por storekeeper (1er laborable)
REM      * 1 KPI semanal al admin (lunes 09-10 UTC)
REM      * 1 aviso critico admin por instancia >7 dias vencida (1 sola vez)
REM
REM  Este .bat solo hace commit + push del codigo fuente al
REM  repo (Vercel desplegara la SPA). Las Edge Functions ya
REM  estan desplegadas en Supabase y el cron ya esta cambiado.
REM ============================================================

cd /d "%~dp0\.."
del /F /Q .git\index.lock 2>nul

echo.
echo === git status ===
git status --short

echo.
echo === git add (digests + Config UI + scripts) ===
git add ^
  supabase\functions\send-digest-daily\index.ts ^
  supabase\functions\send-digest-weekly\index.ts ^
  supabase\functions\send-digest-monthly\index.ts ^
  supabase\functions\send-admin-weekly\index.ts ^
  src\pages\admin\Config.tsx ^
  scripts\deploy_notifs.bat

echo.
echo === git commit ===
git commit -m "feat(notifs): digests diario/semanal/mensual + KPI admin + critico unico"

echo.
echo === git push ===
git push origin main

echo.
echo ============================================================
echo  Push enviado. Vercel desplegara la SPA en 60-90s.
echo  Las Edge Functions ya estan en Supabase (v1 ACTIVE).
echo  El pg_cron antiguo (jobid=1) esta DESACTIVADO.
echo  Los nuevos jobs activos son 5,6,7,8.
echo ============================================================
pause
